import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { RequestStatus, UserRole } from '../../../generated/prisma/enums';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { PrismaService } from '../../database/prisma.service';
import { CreateLocationDto } from './dto/tracking.dto';
import { TechnicianLocationResponseDto } from './dto/tracking-response.dto';

@ApiTags('Live Tracking')
@ApiBearerAuth()
@Controller('tracking')
@UseGuards(JwtAuthGuard)
export class TrackingController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('service-requests/:requestId/location')
  @ApiOperation({
    summary:
      'Record an assigned technician location while travelling or working',
  })
  @ApiParam({ name: 'requestId', description: 'Service request ID' })
  @ApiCreatedResponse({ type: TechnicianLocationResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async publish(
    @CurrentUser() user: AuthUser,
    @Param('requestId') requestId: string,
    @Body() dto: CreateLocationDto,
  ) {
    if (user.role !== UserRole.TECHNICIAN)
      throw new ForbiddenException(
        'Only technicians can publish live locations',
      );
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Service request not found');
    if (request.technicianId !== user.id)
      throw new ForbiddenException(
        'You are not assigned to this service request',
      );
    if (
      request.status !== RequestStatus.SCHEDULED &&
      request.status !== RequestStatus.IN_PROGRESS
    )
      throw new ForbiddenException(
        'Location sharing is only enabled for scheduled or active requests',
      );
    return this.prisma.technicianLocation.create({
      data: {
        technicianId: user.id,
        requestId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        heading: dto.heading,
        capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : undefined,
      },
    });
  }

  @Get('service-requests/:requestId/location')
  @ApiExtraModels(TechnicianLocationResponseDto)
  @ApiOperation({
    summary: 'Get the latest location of the assigned technician',
  })
  @ApiParam({ name: 'requestId', description: 'Service request ID' })
  @ApiOkResponse({
    description: 'Returns null when no location has been shared yet.',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(TechnicianLocationResponseDto) },
        { type: 'null' },
      ],
    },
  })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async latest(
    @CurrentUser() user: AuthUser,
    @Param('requestId') requestId: string,
  ) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Service request not found');
    if (
      user.role !== UserRole.ADMIN &&
      request.customerId !== user.id &&
      request.technicianId !== user.id
    ) {
      throw new ForbiddenException('You cannot view this technician location');
    }
    return this.prisma.technicianLocation.findFirst({
      where: { requestId },
      orderBy: { capturedAt: 'desc' },
    });
  }
}
