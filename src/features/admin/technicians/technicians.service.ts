import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import {
  RequestStatus,
  TechnicianVerificationStatus,
  UserRole,
} from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../database/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { adminLocalTodayRange } from '../common/admin-date-range';
import { adminPage, adminSkip } from '../common/admin-pagination';
import {
  AdminTechnicianQueryDto,
  AdminUpdateTechnicianDto,
  AdminVerifyTechnicianDto,
} from './dto/technicians.dto';

type SafeUser = Omit<Prisma.UserGetPayload<object>, 'passwordHash'>;
type TechnicianViewRow = SafeUser & {
  technician: Prisma.TechnicianProfileGetPayload<object> | null;
  _count: { assignedRequests: number };
  assignedRequests: { id: string; status: RequestStatus }[];
};

@Injectable()
export class AdminTechniciansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(query: AdminTechnicianQueryDto) {
    const where: Prisma.UserWhereInput = {
      role: UserRole.TECHNICIAN,
      technician: {
        is: {
          verificationStatus: query.verificationStatus,
          isAvailable: query.isAvailable,
        },
      },
    };
    if (query.search) {
      where.OR = this.personSearch(query.search);
    }
    const today = adminLocalTodayRange(query.timezone);
    const jobsToday = {
      scheduledStart: { gte: today.start, lt: today.end },
      status: {
        in: [RequestStatus.SCHEDULED, RequestStatus.IN_PROGRESS],
      },
    };
    const result = await adminPage(
      this.prisma,
      this.prisma.user.findMany({
        where,
        omit: { passwordHash: true },
        include: {
          technician: true,
          _count: {
            select: {
              assignedRequests: {
                where: jobsToday,
              },
            },
          },
          assignedRequests: {
            where: {
              OR: [
                { status: RequestStatus.IN_PROGRESS },
                {
                  status: RequestStatus.REPORT_SUBMITTED,
                  report: { is: { customerConfirmedAt: null } },
                },
              ],
            },
            select: { id: true, status: true },
          },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        skip: adminSkip(query),
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
      query,
    );
    return {
      ...result,
      items: result.items.map((row) => this.technicianView(row)),
    };
  }

  async get(id: string, timezone?: string) {
    const today = adminLocalTodayRange(timezone);
    const row = await this.prisma.user.findFirst({
      where: { id, role: UserRole.TECHNICIAN },
      omit: { passwordHash: true },
      include: {
        technician: true,
        _count: {
          select: {
            assignedRequests: {
              where: {
                scheduledStart: { gte: today.start, lt: today.end },
                status: {
                  in: [RequestStatus.SCHEDULED, RequestStatus.IN_PROGRESS],
                },
              },
            },
          },
        },
        assignedRequests: {
          where: {
            OR: [
              { status: RequestStatus.IN_PROGRESS },
              {
                status: RequestStatus.REPORT_SUBMITTED,
                report: { is: { customerConfirmedAt: null } },
              },
            ],
          },
          select: { id: true, status: true },
        },
      },
    });
    if (!row?.technician) throw new NotFoundException('Technician not found');
    return this.technicianView(row);
  }

  async update(id: string, dto: AdminUpdateTechnicianDto) {
    const exists = await this.prisma.user.findFirst({
      where: { id, role: UserRole.TECHNICIAN, technician: { isNot: null } },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Technician not found');

    const {
      serviceArea,
      skills,
      licenseNumber,
      yearsExperience,
      bio,
      isAvailable,
      ...userData
    } = dto;
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: userData }),
      this.prisma.technicianProfile.update({
        where: { userId: id },
        data: {
          serviceArea,
          skills,
          licenseNumber,
          yearsExperience,
          bio,
          isAvailable,
        },
      }),
    ]);
    return this.get(id);
  }

  async verify(id: string, dto: AdminVerifyTechnicianDto) {
    const exists = await this.prisma.user.findFirst({
      where: { id, role: UserRole.TECHNICIAN, technician: { isNot: null } },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Technician not found');

    await this.prisma.technicianProfile.update({
      where: { userId: id },
      data: {
        verificationStatus: dto.status,
        verificationNotes: dto.verificationNotes,
        verifiedAt:
          dto.status === TechnicianVerificationStatus.VERIFIED
            ? new Date()
            : null,
      },
    });

    if (dto.status === TechnicianVerificationStatus.VERIFIED) {
      await this.notifications.createForUser(id, {
        title: 'Technician account approved',
        body: 'An administrator approved your technician account. You can now receive job assignments.',
        data: { userId: id },
      });
    } else if (dto.status === TechnicianVerificationStatus.REJECTED) {
      await this.notifications.createForUser(id, {
        title: 'Technician account not approved',
        body:
          dto.verificationNotes?.trim() ||
          'An administrator declined your technician registration.',
        data: { userId: id },
      });
    }

    return this.get(id);
  }

  private personSearch(search: string): Prisma.UserWhereInput[] {
    return [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { company: { contains: search, mode: 'insensitive' } },
      {
        technician: {
          serviceArea: { contains: search, mode: 'insensitive' },
        },
      },
      {
        technician: { employeeId: { contains: search, mode: 'insensitive' } },
      },
    ];
  }

  private technicianView(row: TechnicianViewRow) {
    if (!row.technician) throw new NotFoundException('Technician not found');
    const { technician, _count, assignedRequests, ...user } = row;
    return {
      ...user,
      ...technician,
      id: user.id,
      profileId: technician.id,
      isActive: user.isActive,
      rating: Number(technician.rating),
      jobsToday: _count.assignedRequests,
      jobsInProgress: assignedRequests.filter(
        (request) => request.status === RequestStatus.IN_PROGRESS,
      ).length,
      reportsAwaitingReview: assignedRequests.filter(
        (request) => request.status === RequestStatus.REPORT_SUBMITTED,
      ).length,
    };
  }
}
