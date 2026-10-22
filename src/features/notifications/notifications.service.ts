import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { Observable } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { UserRole } from '../../../generated/prisma/enums';
import { PrismaService } from '../../database/prisma.service';

export type NotificationPayload = {
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
};

type NotificationClient = Pick<
  Prisma.TransactionClient,
  'notification' | 'user'
>;

@Injectable()
export class NotificationsService {
  private readonly events = new EventEmitter();

  constructor(private readonly prisma: PrismaService) {
    this.events.setMaxListeners(0);
  }

  createForUser(
    userId: string,
    payload: NotificationPayload,
    client: NotificationClient = this.prisma,
  ) {
    const created = client.notification.create({ data: { userId, ...payload } });
    return Promise.resolve(created).then((notification) => {
      this.notifyUser(userId);
      return notification;
    });
  }

  async createForUsers(
    userIds: string[],
    payload: NotificationPayload,
    client: NotificationClient = this.prisma,
  ) {
    const recipients = [...new Set(userIds)];
    if (!recipients.length) return 0;
    const result = await client.notification.createMany({
      data: recipients.map((userId) => ({ userId, ...payload })),
    });
    this.notifyUsers(recipients);
    return result.count;
  }

  async fanOutToActiveAdmins(
    payload: NotificationPayload,
    client: NotificationClient = this.prisma,
  ) {
    const admins = await client.user.findMany({
      where: { role: UserRole.ADMIN, isActive: true },
      select: { id: true },
    });
    return this.createForUsers(
      admins.map((admin) => admin.id),
      payload,
      client,
    );
  }

  notifyUser(userId: string) {
    this.events.emit(userId, { type: 'refresh' });
  }

  notifyUsers(userIds: string[]) {
    for (const userId of new Set(userIds)) {
      this.notifyUser(userId);
    }
  }

  stream(userId: string): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const handler = (payload: { type: string }) => {
        subscriber.next({ data: payload });
      };
      this.events.on(userId, handler);
      subscriber.next({ data: { type: 'connected' } });
      const heartbeat = setInterval(() => {
        subscriber.next({ data: { type: 'ping' } });
      }, 25000);
      return () => {
        clearInterval(heartbeat);
        this.events.off(userId, handler);
      };
    });
  }
}
