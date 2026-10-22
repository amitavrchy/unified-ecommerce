import { RequestStatus, UserRole } from '../../../../generated/prisma/enums';
import type { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../database/prisma.service';
import { TechnicianHomeService } from './home.service';

describe('TechnicianHomeService', () => {
  const technician: AuthUser = {
    id: 'tech-1',
    email: 'marc@example.com',
    role: UserRole.TECHNICIAN,
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    serviceRequest: { count: jest.fn() },
  };
  let service: TechnicianHomeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TechnicianHomeService(prisma as unknown as PrismaService);
    prisma.user.findUnique.mockResolvedValue({
      firstName: 'Marc',
      technician: { rating: 4.8 },
    });
    prisma.serviceRequest.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(84)
      .mockResolvedValueOnce(4);
  });

  it('returns Figma home KPI counts for the authenticated technician', async () => {
    const result = await service.stats(technician, { timezone: 'UTC' });

    expect(result).toMatchObject({
      firstName: 'Marc',
      jobsToday: 3,
      inProgress: 1,
      completedThisMonth: 12,
      weeklyTasks: 8,
      completedThisWeek: 5,
      totalCompleted: 84,
      upcoming: 4,
      averageRating: 4.8,
      timezone: 'UTC',
    });
    expect(prisma.serviceRequest.count).toHaveBeenNthCalledWith(2, {
      where: {
        technicianId: 'tech-1',
        status: RequestStatus.IN_PROGRESS,
      },
    });
    expect(prisma.serviceRequest.count).toHaveBeenNthCalledWith(6, {
      where: {
        technicianId: 'tech-1',
        status: RequestStatus.COMPLETED,
      },
    });
    expect(prisma.serviceRequest.count).toHaveBeenNthCalledWith(7, {
      where: {
        technicianId: 'tech-1',
        status: RequestStatus.SCHEDULED,
      },
    });
  });
});
