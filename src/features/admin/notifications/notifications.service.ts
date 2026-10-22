import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { adminUtcRange } from '../common/admin-date-range';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  AdminNotificationQueryDto,
  BroadcastNotificationDto,
} from './dto/notifications.dto';

@Injectable()
export class AdminNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(userId: string, query: AdminNotificationQueryDto) {
    const dateRange = query.date
      ? adminUtcRange(query.date, query.date, query.timezone)
      : null;
    const where = {
      userId,
      ...(query.unreadOnly ? { readAt: null } : {}),
      ...(dateRange
        ? { createdAt: { gte: dateRange.start, lt: dateRange.end } }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                title: { contains: query.search, mode: 'insensitive' as const },
              },
              {
                body: { contains: query.search, mode: 'insensitive' as const },
              },
            ],
          }
        : {}),
    };
    const [items, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return {
      items,
      total,
      unreadCount,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async broadcast(dto: BroadcastNotificationDto) {
    const recipients = await this.prisma.user.findMany({
      where: {
        isActive: true,
        ...(dto.roles?.length ? { role: { in: dto.roles } } : {}),
      },
      select: { id: true },
    });
    if (recipients.length) {
      await this.notifications.createForUsers(
        recipients.map((recipient) => recipient.id),
        {
          title: dto.title,
          body: dto.body,
        },
      );
    }
    return { recipients: recipients.length };
  }
}
