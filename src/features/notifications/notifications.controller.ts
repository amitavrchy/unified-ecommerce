import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import {
  ApiErrorResponseDto,
  SuccessResponseDto,
} from '../../common/dto/api-response.dto';
import { PrismaService } from '../../database/prisma.service';
import { NotificationResponseDto } from './dto/notification-response.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for the authenticated user' })
  @ApiOkResponse({ type: NotificationResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiOkResponse({ type: SuccessResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId: user.id },
      data: { readAt: new Date() },
    });
    return { success: true };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all unread notifications as read' })
  @ApiOkResponse({ type: SuccessResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async readAll(@CurrentUser() user: AuthUser) {
    await this.prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }
}
