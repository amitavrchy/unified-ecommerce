import {
  Controller,
  ForbiddenException,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RtcRole, RtcTokenBuilder } from 'agora-token';
import { randomUUID } from 'crypto';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CallStatus, UserRole } from '../../../generated/prisma/enums';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { PrismaService } from '../../database/prisma.service';
import {
  AgoraTokenResponseDto,
  CallSessionResponseDto,
} from './dto/calls-response.dto';

@ApiTags('Agora Calls')
@ApiBearerAuth()
@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('service-request/:requestId/token')
  @ApiOperation({
    summary: 'Start or join the active Agora call for a service request',
    description:
      'The request customer, assigned technician, or an administrator can join. The short-lived token is generated server-side and the response includes callId for refresh/end lifecycle actions.',
  })
  @ApiParam({ name: 'requestId', description: 'Service request ID' })
  @ApiCreatedResponse({ type: AgoraTokenResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  token(@CurrentUser() user: AuthUser, @Param('requestId') requestId: string) {
    return this.tokenForRequest(user, requestId);
  }

  @Post(':id/token')
  @ApiOperation({
    summary: 'Refresh an Agora token for an active call session',
  })
  @ApiParam({ name: 'id', description: 'Call session ID' })
  @ApiOkResponse({ type: AgoraTokenResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async refresh(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const call = await this.prisma.callSession.findUnique({
      where: { id },
      include: { request: true },
    });
    if (!call) throw new NotFoundException('Call session not found');
    this.authorizeParticipant(user, call.request);
    if (call.status === CallStatus.ENDED)
      throw new ForbiddenException('This call has ended');
    if (call.status === CallStatus.CREATED) {
      await this.prisma.callSession.update({
        where: { id },
        data: { status: CallStatus.ACTIVE, startedAt: new Date() },
      });
    }
    return this.createToken(call.id, call.channelName, user.id);
  }

  @Get('service-request/:requestId')
  @ApiOperation({ summary: 'List call history for a service request' })
  @ApiParam({ name: 'requestId', description: 'Service request ID' })
  @ApiOkResponse({ type: CallSessionResponseDto, isArray: true })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async history(
    @CurrentUser() user: AuthUser,
    @Param('requestId') requestId: string,
  ) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Service request not found');
    this.authorizeParticipant(user, request);
    return this.prisma.callSession.findMany({
      where: { requestId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post(':id/end')
  @ApiOperation({ summary: 'End an active call session' })
  @ApiParam({ name: 'id', description: 'Call session ID' })
  @ApiOkResponse({ type: CallSessionResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async end(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const call = await this.prisma.callSession.findUnique({
      where: { id },
      include: { request: true },
    });
    if (!call) throw new NotFoundException('Call session not found');
    this.authorizeParticipant(user, call.request);
    return this.prisma.callSession.update({
      where: { id },
      data: { status: CallStatus.ENDED, endedAt: new Date() },
    });
  }

  private async tokenForRequest(user: AuthUser, requestId: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Service request not found');
    this.authorizeParticipant(user, request);
    let call = await this.prisma.callSession.findFirst({
      where: { requestId, status: { not: CallStatus.ENDED } },
      orderBy: { createdAt: 'desc' },
    });
    if (!call) {
      call = await this.prisma.callSession.create({
        data: {
          requestId,
          createdById: user.id,
          channelName: `service-${requestId.slice(-16)}-${randomUUID().slice(0, 8)}`,
          status: CallStatus.ACTIVE,
          startedAt: new Date(),
        },
      });
    } else if (call.status === CallStatus.CREATED) {
      call = await this.prisma.callSession.update({
        where: { id: call.id },
        data: { status: CallStatus.ACTIVE, startedAt: new Date() },
      });
    }
    return this.createToken(call.id, call.channelName, user.id);
  }

  private createToken(callId: string, channelName: string, userId: string) {
    const appId = process.env.AGORA_APP_ID;
    const certificate = process.env.AGORA_APP_CERTIFICATE;
    if (!appId || !certificate) {
      throw new InternalServerErrorException(
        'AGORA_APP_ID and AGORA_APP_CERTIFICATE are required',
      );
    }
    const expiresIn = this.tokenTtl();
    const expiresAtUnix = Math.floor(Date.now() / 1000) + expiresIn;
    const token = RtcTokenBuilder.buildTokenWithUserAccount(
      appId,
      certificate,
      channelName,
      userId,
      RtcRole.PUBLISHER,
      expiresAtUnix,
      expiresAtUnix,
    );
    return {
      callId,
      appId,
      token,
      channelName,
      userAccount: userId,
      expiresIn,
      expiresAtUnix,
      expiresAt: new Date(expiresAtUnix * 1000).toISOString(),
    };
  }

  private tokenTtl() {
    const parsed = Number(process.env.AGORA_TOKEN_TTL_SECONDS ?? 3600);
    if (!Number.isInteger(parsed) || parsed < 60 || parsed > 86_400) {
      throw new InternalServerErrorException(
        'AGORA_TOKEN_TTL_SECONDS must be an integer between 60 and 86400',
      );
    }
    return parsed;
  }

  private authorizeParticipant(
    user: AuthUser,
    request: { customerId: string; technicianId: string | null },
  ) {
    if (user.role === UserRole.ADMIN) return;
    if (request.customerId !== user.id && request.technicianId !== user.id) {
      throw new ForbiddenException(
        'Only the customer, assigned technician, or office administrator can join',
      );
    }
    if (!request.technicianId) {
      throw new ForbiddenException(
        'A technician must be assigned before the customer call starts',
      );
    }
  }
}
