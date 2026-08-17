import {
  Body,
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../../../generated/prisma/enums';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthUser } from '../../common/auth/auth.types';
import {
  ApiErrorResponseDto,
  SuccessResponseDto,
} from '../../common/dto/api-response.dto';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PrismaService } from '../../database/prisma.service';
import {
  ForgotPasswordDto,
  LoginDto,
  ResetPasswordDto,
  SignupDto,
  TechnicianSignupDto,
} from './dto/auth.dto';
import {
  AuthSessionResponseDto,
  ForgotPasswordResponseDto,
} from './dto/auth-response.dto';
import { UserProfileResponseDto } from '../users/dto/user-response.dto';
import { PasswordResetDeliveryService } from './password-reset-delivery.service';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly passwordResetDelivery: PasswordResetDeliveryService,
  ) {}

  @Post('customer/signup')
  @ApiOperation({ summary: 'Register a customer' })
  @ApiCreatedResponse({ type: AuthSessionResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'The email address is already registered.',
  })
  signupCustomer(@Body() dto: SignupDto) {
    return this.signup(dto, UserRole.CUSTOMER);
  }

  @Post('technician/signup')
  @ApiOperation({
    summary: 'Register a technician with skills and service area',
  })
  @ApiCreatedResponse({ type: AuthSessionResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'The email address is already registered.',
  })
  signupTechnician(@Body() dto: TechnicianSignupDto) {
    return this.signup(dto, UserRole.TECHNICIAN);
  }

  private async signup(dto: SignupDto | TechnicianSignupDto, role: UserRole) {
    if (!dto.acceptTerms)
      throw new BadRequestException(
        'Terms acceptance is required to create an account',
      );
    if (
      await this.prisma.user.findUnique({
        where: { email: dto.email.toLowerCase() },
      })
    )
      throw new ConflictException('Email already registered');
    const technician =
      role === UserRole.TECHNICIAN ? (dto as TechnicianSignupDto) : undefined;
    const user = await this.prisma.user.create({
      data: {
        role,
        email: dto.email.toLowerCase(),
        passwordHash: await hash(dto.password, 12),
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        termsAcceptedAt: new Date(),
        termsVersion: dto.termsVersion,
        addresses: {
          create: {
            line1: dto.address,
            apartment: dto.apartment,
            city: dto.city,
            state: dto.state,
            zipCode: dto.zipCode,
            isPrimary: true,
          },
        },
        technician: technician
          ? {
              create: {
                serviceArea: technician.serviceArea,
                skills: technician.skills,
                employeeId: technician.employeeId,
                licenseNumber: technician.licenseNumber,
                yearsExperience: technician.yearsExperience,
                bio: technician.bio,
              },
            }
          : undefined,
      },
      include: { addresses: true, technician: true },
    });
    return this.session(user);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login any customer, technician, or admin' })
  @ApiCreatedResponse({ type: AuthSessionResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: 'Credentials are invalid or the account is inactive.',
  })
  async login(@Body() dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { technician: true },
    });
    if (
      !user ||
      !user.isActive ||
      !(await compare(dto.password, user.passwordHash))
    )
      throw new UnauthorizedException('Invalid credentials');
    return this.session(user);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password-reset token' })
  @ApiCreatedResponse({ type: ForgotPasswordResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user)
      return { message: 'If that account exists, a reset code has been sent.' };
    const token = randomBytes(32).toString('hex');
    const reset = await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      return tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date(Date.now() + 15 * 60_000),
        },
      });
    });
    try {
      await this.passwordResetDelivery.send(user.email, token);
    } catch (error) {
      // Do not leave an undisclosed, unusable reset token active if the
      // configured mail provider rejects the request.
      await this.prisma.passwordResetToken.delete({ where: { id: reset.id } });
      throw error;
    }
    return {
      message: 'If that account exists, a reset code has been sent.',
      ...(process.env.NODE_ENV !== 'production' ? { token } : {}),
    };
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with a one-time token' })
  @ApiCreatedResponse({ type: SuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: 'The reset token is invalid, expired, or already used.',
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const reset = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!reset)
      throw new UnauthorizedException('Invalid or expired reset token');
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: reset.userId },
        data: { passwordHash: await hash(dto.password, 12) },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: reset.id },
        data: { usedAt: new Date() },
      }),
    ]);
    return { success: true };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  @ApiBearerAuth()
  @ApiOkResponse({ type: UserProfileResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.prisma.user.findUnique({
      where: { id: user.id },
      omit: { passwordHash: true },
      include: { addresses: true, technician: true },
    });
  }

  private session(user: { id: string; email: string; role: UserRole }) {
    return {
      accessToken: this.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
      }),
      user: { id: user.id, email: user.email, role: user.role },
    };
  }
}
