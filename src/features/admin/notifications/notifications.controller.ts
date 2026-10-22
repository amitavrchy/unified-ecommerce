import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../../../common/auth/auth.types';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { ApiErrorResponseDto } from '../../../common/dto/api-response.dto';
import { AdminGuard } from '../admin.guard';
import {
  AdminNotificationQueryDto,
  BroadcastNotificationDto,
} from './dto/notifications.dto';
import {
  AdminNotificationPageResponseDto,
  BroadcastNotificationResponseDto,
} from './dto/notifications-response.dto';
import { AdminNotificationsService } from './notifications.service';

@ApiTags('Admin Notifications')
@ApiBearerAuth()
@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
export class AdminNotificationsController {
  constructor(private readonly notifications: AdminNotificationsService) {}

  @Get()
  @ApiOperation({
    summary:
      'List paginated notifications for the current administrator with unread count',
  })
  @ApiOkResponse({ type: AdminNotificationPageResponseDto })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: AdminNotificationQueryDto,
  ) {
    return this.notifications.list(user.id, query);
  }

  @Post('broadcast')
  @ApiOperation({
    summary: 'Broadcast an in-app notification to selected roles (admin only)',
  })
  @ApiCreatedResponse({ type: BroadcastNotificationResponseDto })
  broadcast(@Body() dto: BroadcastNotificationDto) {
    return this.notifications.broadcast(dto);
  }
}
