import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { QuoteCounterofferStatus } from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../database/prisma.service';
import {
  PERSON_SELECT,
  adminPage,
  adminSkip,
} from '../common/admin-pagination';
import { AdminQuotationQueryDto } from './dto/quotations.dto';

@Injectable()
export class AdminQuotationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminQuotationQueryDto) {
    const where: Prisma.QuotationWhereInput = {
      status: query.status,
      request: query.customerId ? { customerId: query.customerId } : undefined,
    };
    if (query.search) {
      where.OR = [
        { quoteNumber: { contains: query.search, mode: 'insensitive' } },
        {
          request: {
            requestNumber: { contains: query.search, mode: 'insensitive' },
          },
        },
        {
          request: {
            customer: {
              email: { contains: query.search, mode: 'insensitive' },
            },
          },
        },
        {
          request: {
            customer: {
              firstName: { contains: query.search, mode: 'insensitive' },
            },
          },
        },
        {
          request: {
            customer: {
              lastName: { contains: query.search, mode: 'insensitive' },
            },
          },
        },
      ];
    }
    const result = await adminPage(
      this.prisma,
      this.prisma.quotation.findMany({
        where,
        include: {
          request: {
            select: {
              id: true,
              requestNumber: true,
              status: true,
              customer: { select: PERSON_SELECT },
            },
          },
          counteroffers: {
            where: { status: QuoteCounterofferStatus.PENDING },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { validUntil: 'asc' },
        skip: adminSkip(query),
        take: query.pageSize,
      }),
      this.prisma.quotation.count({ where }),
      query,
    );
    return {
      ...result,
      items: result.items.map(({ request, counteroffers, ...quote }) => ({
        ...quote,
        ...(quote.totalAmount != null
          ? { totalAmount: Number(quote.totalAmount) }
          : {}),
        ...(quote.negotiatedTotal != null
          ? { negotiatedTotal: Number(quote.negotiatedTotal) }
          : {}),
        request: {
          id: request.id,
          requestNumber: request.requestNumber,
          status: request.status,
        },
        customer: request.customer,
        pendingNegotiation: counteroffers[0]
          ? {
              ...counteroffers[0],
              ...(counteroffers[0].requestedTotal != null
                ? {
                    requestedTotal: Number(counteroffers[0].requestedTotal),
                  }
                : {}),
            }
          : null,
      })),
    };
  }
}
