import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  TechnicianVerificationStatus,
  UserRole,
} from '../../../generated/prisma/enums';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import {
  ApiErrorResponseDto,
  SuccessResponseDto,
} from '../../common/dto/api-response.dto';
import { PrismaService } from '../../database/prisma.service';
import { MediaUploadService } from '../../service/cloudinary/media-upload.service';
import {
  AddressDto,
  NotificationPreferencesDto,
  ProfileDto,
  ProfileFormDto,
  TechnicianProfileDto,
  TechnicianVerificationDto,
} from './dto/users.dto';
import {
  AddressResponseDto,
  PaymentResponseDto,
  UserProfileResponseDto,
  UserResponseDto,
  UserWithTechnicianResponseDto,
} from './dto/user-response.dto';

const AVATAR_FOLDER = 'vacuumCare/avatars';

@ApiTags('Users & Profiles')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaUploadService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  @ApiOkResponse({ type: UserProfileResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  me(@CurrentUser() user: AuthUser) {
    return this.prisma.user.findUnique({
      where: { id: user.id },
      omit: { passwordHash: true },
      include: { addresses: true, technician: true },
    });
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Update the authenticated user profile',
    description:
      'Send as multipart form data. Upload a profile picture on the avatar field; JSON bodies are still accepted for the text fields alone.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ProfileFormDto })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @UseInterceptors(FileInterceptor('avatar'))
  async update(
    @CurrentUser() user: AuthUser,
    @Body() dto: ProfileDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    let avatarUrl: string | undefined;
    if (avatar) {
      this.media.assertImages([avatar]);
      [avatarUrl] = await this.media.uploadUrls([avatar], AVATAR_FOLDER);
    }
    return this.prisma.user.update({
      where: { id: user.id },
      data: { ...dto, ...(avatarUrl ? { avatarUrl } : {}) },
      omit: { passwordHash: true },
    });
  }

  @Patch('me/preferences')
  @ApiOperation({ summary: 'Update email and push notification preferences' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: NotificationPreferencesDto,
  ) {
    return this.prisma.user.update({
      where: { id: user.id },
      data: {
        notificationEmail: dto.email,
        notificationPush: dto.push,
      },
      omit: { passwordHash: true },
    });
  }

  @Post('me/onboarding/complete')
  @ApiOperation({ summary: 'Mark first-run onboarding as completed' })
  @ApiOkResponse({ type: SuccessResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async completeOnboarding(@CurrentUser() user: AuthUser) {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { onboardingCompletedAt: new Date() },
    });
    return { success: true };
  }

  @Patch('me/technician')
  @ApiOperation({
    summary: 'Update the authenticated technician profile and availability',
  })
  @ApiOkResponse({ type: UserWithTechnicianResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async updateTechnician(
    @CurrentUser() user: AuthUser,
    @Body() dto: TechnicianProfileDto,
  ) {
    if (user.role !== UserRole.TECHNICIAN)
      throw new ForbiddenException('Only technicians can update this profile');
    await this.prisma.technicianProfile.update({
      where: { userId: user.id },
      data: dto,
    });
    return this.prisma.user.findUnique({
      where: { id: user.id },
      omit: { passwordHash: true },
      include: { technician: true },
    });
  }

  @Get('me/addresses')
  @ApiOperation({
    summary: 'List saved addresses for checkout and service requests',
  })
  @ApiOkResponse({ type: AddressResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  addresses(@CurrentUser() user: AuthUser) {
    return this.prisma.address.findMany({
      where: { userId: user.id },
      orderBy: [{ isPrimary: 'desc' }, { line1: 'asc' }],
    });
  }

  @Post('me/addresses')
  @ApiOperation({ summary: 'Add an address for the authenticated user' })
  @ApiCreatedResponse({ type: AddressResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async addAddress(@CurrentUser() user: AuthUser, @Body() dto: AddressDto) {
    return this.prisma.$transaction(async (tx) => {
      const hasAddress = await tx.address.findFirst({
        where: { userId: user.id },
        select: { id: true },
      });
      // The first saved address is always primary. Later additions become the
      // primary address only when the customer explicitly asks for it.
      const isPrimary = dto.isPrimary ?? !hasAddress;
      if (isPrimary) {
        await tx.address.updateMany({
          where: { userId: user.id },
          data: { isPrimary: false },
        });
      }
      return tx.address.create({
        data: { ...dto, userId: user.id, isPrimary },
      });
    });
  }

  @Patch('me/addresses/:id')
  @ApiOperation({ summary: 'Update one of the authenticated user addresses' })
  @ApiParam({ name: 'id', description: 'Address ID' })
  @ApiOkResponse({ type: AddressResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({
    type: ApiErrorResponseDto,
    description: 'The address does not belong to the authenticated user.',
  })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async editAddress(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddressDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const address = await tx.address.findFirst({
        where: { id, userId: user.id },
      });
      if (!address)
        throw new ForbiddenException(
          'This address does not belong to the authenticated user',
        );
      if (dto.isPrimary === false && address.isPrimary) {
        const replacement = await tx.address.findFirst({
          where: { userId: user.id, id: { not: id }, isPrimary: true },
          select: { id: true },
        });
        if (!replacement) {
          throw new BadRequestException(
            'At least one saved address must remain primary',
          );
        }
      }
      if (dto.isPrimary) {
        await tx.address.updateMany({
          where: { userId: user.id, id: { not: id } },
          data: { isPrimary: false },
        });
      }
      return tx.address.update({ where: { id }, data: dto });
    });
  }

  @Delete('me/addresses/:id')
  @ApiOperation({ summary: 'Delete a non-primary address' })
  @ApiParam({ name: 'id', description: 'Address ID' })
  @ApiOkResponse({ type: SuccessResponseDto })
  @ApiForbiddenResponse({
    type: ApiErrorResponseDto,
    description:
      'The address does not belong to the user or is the primary address, which cannot be deleted.',
  })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async deleteAddress(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const result = await this.prisma.address.deleteMany({
      where: { id, userId: user.id, isPrimary: false },
    });
    if (!result.count)
      throw new ForbiddenException('Primary address cannot be deleted');
    return { success: true };
  }

  @Get('technicians')
  @ApiOperation({ summary: 'List active technicians' })
  @ApiOkResponse({ type: UserWithTechnicianResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  technicians() {
    return this.prisma.user.findMany({
      where: {
        role: UserRole.TECHNICIAN,
        isActive: true,
        technician: {
          is: { verificationStatus: TechnicianVerificationStatus.VERIFIED },
        },
      },
      omit: { passwordHash: true },
      include: { technician: true },
    });
  }

  @Patch('admin/technicians/:id/verification')
  @ApiOperation({
    summary: 'Verify or reject a technician registration (admin only)',
  })
  @ApiParam({ name: 'id', description: 'Technician user ID' })
  @ApiOkResponse({ type: UserWithTechnicianResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async verifyTechnician(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TechnicianVerificationDto,
  ) {
    if (user.role !== UserRole.ADMIN) throw new ForbiddenException();
    const technician = await this.prisma.user.findFirst({
      where: { id, role: UserRole.TECHNICIAN },
      include: { technician: true },
    });
    if (!technician?.technician)
      throw new ForbiddenException('Technician not found');
    await this.prisma.technicianProfile.update({
      where: { userId: id },
      data: {
        verificationStatus: dto.status,
        verificationNotes: dto.verificationNotes,
        verifiedAt:
          dto.status === TechnicianVerificationStatus.VERIFIED
            ? new Date()
            : null,
      },
    });
    return this.prisma.user.findUnique({
      where: { id },
      omit: { passwordHash: true },
      include: { technician: true },
    });
  }

  @Get('me/payments')
  @ApiOperation({ summary: 'List payment history for the authenticated user' })
  @ApiOkResponse({ type: PaymentResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  payments(@CurrentUser() user: AuthUser) {
    return this.prisma.payment.findMany({
      where: { userId: user.id },
      include: {
        quotation: { include: { request: true } },
        order: { select: { id: true, orderNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('admin/all')
  @ApiOperation({ summary: 'List all users (admin only)' })
  @ApiOkResponse({ type: UserProfileResponseDto, isArray: true })
  @ApiForbiddenResponse({
    type: ApiErrorResponseDto,
    description: 'Only administrators can access this endpoint.',
  })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  all(@CurrentUser() user: AuthUser) {
    if (user.role !== UserRole.ADMIN) throw new ForbiddenException();
    return this.prisma.user.findMany({
      omit: { passwordHash: true },
      include: { technician: true, addresses: true },
    });
  }
}
