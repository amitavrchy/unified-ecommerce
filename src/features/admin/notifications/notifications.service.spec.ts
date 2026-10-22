import { PrismaService } from '../../../database/prisma.service';
import { AdminNotificationsService } from './notifications.service';

describe('AdminNotificationsService', () => {
  const prisma = {
    notification: {
      findMany: jest.fn(),
      count: jest.fn(),
      createMany: jest.fn(),
    },
    user: { findMany: jest.fn() },
    $transaction: jest.fn((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    ),
  };
  let service: AdminNotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminNotificationsService(
      prisma as unknown as PrismaService,
      {
        createForUsers: jest.fn().mockResolvedValue(0),
      } as never,
    );
  });

  it('returns filtered admin notifications with a global unread count', async () => {
    prisma.notification.findMany.mockResolvedValue([{ id: 'notification-1' }]);
    prisma.notification.count.mockResolvedValueOnce(1).mockResolvedValueOnce(4);

    await expect(
      service.list('admin-1', {
        page: 2,
        pageSize: 10,
        unreadOnly: true,
        date: '2026-08-20',
        timezone: 'America/Toronto',
        search: 'quote',
      }),
    ).resolves.toEqual({
      items: [{ id: 'notification-1' }],
      total: 1,
      unreadCount: 4,
      page: 2,
      pageSize: 10,
    });
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });
});
