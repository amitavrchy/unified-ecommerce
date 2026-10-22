import { Injectable } from '@nestjs/common';
import { RequestStatus } from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../database/prisma.service';
import { adminUtcRange } from '../common/admin-date-range';
import { PERSON_SELECT } from '../common/admin-pagination';
import { AdminScheduleQueryDto } from './dto/schedule.dto';

@Injectable()
export class AdminScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: AdminScheduleQueryDto) {
    const range = adminUtcRange(query.from, query.to, query.timezone);
    return this.prisma.serviceRequest.findMany({
      where: {
        scheduledStart: { gte: range.start, lt: range.end },
        technicianId: query.technicianId,
        status: {
          in: query.status?.length
            ? query.status
            : [
                RequestStatus.SCHEDULED,
                RequestStatus.IN_PROGRESS,
                RequestStatus.REPORT_SUBMITTED,
                RequestStatus.COMPLETED,
              ],
        },
      },
      select: {
        id: true,
        requestNumber: true,
        status: true,
        description: true,
        customer: { select: PERSON_SELECT },
        technician: { select: PERSON_SELECT },
        category: { select: { id: true, name: true } },
        issue: { select: { id: true, name: true } },
        scheduledStart: true,
        scheduledEnd: true,
        createdAt: true,
        address: {
          select: {
            line1: true,
            city: true,
            state: true,
            zipCode: true,
          },
        },
      },
      orderBy: [{ scheduledStart: 'asc' }, { requestNumber: 'asc' }],
    });
  }
}
