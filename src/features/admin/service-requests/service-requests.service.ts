import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { QuoteCounterofferStatus } from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../database/prisma.service';
import { adminUtcRange } from '../common/admin-date-range';
import {
  PERSON_SELECT,
  adminPage,
  adminSkip,
} from '../common/admin-pagination';
import { AdminServiceRequestQueryDto } from './dto/service-requests.dto';

@Injectable()
export class AdminServiceRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminServiceRequestQueryDto) {
    const where: Prisma.ServiceRequestWhereInput = {
      status: query.status,
      customerId: query.customerId,
      technicianId: query.technicianId,
      categoryId: query.categoryId,
      issueId: query.issueId,
    };
    if (query.search) {
      where.OR = [
        { requestNumber: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        {
          customer: { email: { contains: query.search, mode: 'insensitive' } },
        },
        {
          customer: {
            firstName: { contains: query.search, mode: 'insensitive' },
          },
        },
        {
          customer: {
            lastName: { contains: query.search, mode: 'insensitive' },
          },
        },
      ];
    }
    if (query.from || query.to) {
      if (!query.from || !query.to) {
        throw new BadRequestException('from and to must be provided together');
      }
      const range = adminUtcRange(query.from, query.to, query.timezone);
      where.createdAt = { gte: range.start, lt: range.end };
    }
    const result = await adminPage(
      this.prisma,
      this.prisma.serviceRequest.findMany({
        where,
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
          createdAt: true,
          quotation: {
            select: {
              id: true,
              totalAmount: true,
              negotiatedTotal: true,
              counteroffers: {
                where: { status: QuoteCounterofferStatus.PENDING },
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: {
                  id: true,
                  requestedTotal: true,
                  note: true,
                  status: true,
                  createdAt: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: adminSkip(query),
        take: query.pageSize,
      }),
      this.prisma.serviceRequest.count({ where }),
      query,
    );
    return {
      ...result,
      items: result.items.map(({ quotation, ...request }) => ({
        ...request,
        quotation: quotation
          ? {
              id: quotation.id,
              totalAmount: Number(quotation.totalAmount),
              negotiatedTotal:
                quotation.negotiatedTotal == null
                  ? null
                  : Number(quotation.negotiatedTotal),
              pendingNegotiation: quotation.counteroffers[0]
                ? {
                    ...quotation.counteroffers[0],
                    requestedTotal: Number(
                      quotation.counteroffers[0].requestedTotal,
                    ),
                  }
                : null,
            }
          : null,
      })),
    };
  }
}
