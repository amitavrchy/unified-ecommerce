import { UserRole } from '../../../generated/prisma/enums';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  it('fans out one normalized payload to active administrators', async () => {
    const prisma = {
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]),
      },
      notification: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const service = new NotificationsService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.fanOutToActiveAdmins({
        title: 'New request',
        body: 'A service request needs review.',
        data: { requestId: 'request-1' },
      }),
    ).resolves.toBe(2);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: UserRole.ADMIN, isActive: true },
      select: { id: true },
    });
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ userId: 'admin-1' }),
        expect.objectContaining({ userId: 'admin-2' }),
      ],
    });
  });
});
