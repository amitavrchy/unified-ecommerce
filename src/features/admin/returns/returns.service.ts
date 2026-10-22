import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import {
  PaymentPurpose,
  PaymentStatus,
  ReturnStatus,
} from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../database/prisma.service';
import {
  PERSON_SELECT,
  adminCreatedAtFilter,
  adminPage,
  adminSkip,
} from '../common/admin-pagination';
import { AdminReturnQueryDto } from './dto/returns.dto';

const RETURN_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: [ReturnStatus.APPROVED, ReturnStatus.REJECTED],
  APPROVED: [ReturnStatus.RECEIVED, ReturnStatus.REJECTED],
  REJECTED: [],
  RECEIVED: [],
  REFUNDED: [],
};

@Injectable()
export class AdminReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminReturnQueryDto) {
    const where: Prisma.ReturnRequestWhereInput = {
      status: query.status,
      createdAt: adminCreatedAtFilter(query),
    };
    if (query.search) {
      where.OR = [
        { reason: { contains: query.search, mode: 'insensitive' } },
        { comments: { contains: query.search, mode: 'insensitive' } },
        { adminNotes: { contains: query.search, mode: 'insensitive' } },
        {
          order: {
            orderNumber: { contains: query.search, mode: 'insensitive' },
          },
        },
        {
          order: {
            customer: {
              email: { contains: query.search, mode: 'insensitive' },
            },
          },
        },
        {
          orderItem: {
            is: {
              product: {
                name: { contains: query.search, mode: 'insensitive' },
              },
            },
          },
        },
      ];
    }
    const include = {
      order: {
        include: {
          customer: { select: PERSON_SELECT },
          payments: true,
        },
      },
      orderItem: { include: { product: true } },
    } satisfies Prisma.ReturnRequestInclude;
    const result = await adminPage(
      this.prisma,
      this.prisma.returnRequest.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip: adminSkip(query),
        take: query.pageSize,
      }),
      this.prisma.returnRequest.count({ where }),
      query,
    );
    return {
      ...result,
      items: result.items.map((request) => this.mapReturn(request)),
    };
  }

  async get(id: string) {
    const request = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: {
        order: {
          include: { customer: { select: PERSON_SELECT }, payments: true },
        },
        orderItem: { include: { product: true } },
      },
    });
    if (!request) throw new NotFoundException('Return request not found');
    return this.mapReturn(request);
  }

  private mapReturn(request: {
    status: ReturnStatus;
    order: {
      id: string;
      orderNumber: string;
      customer: unknown;
      payments: { purpose: PaymentPurpose; status: PaymentStatus }[];
    };
    orderItem: unknown;
    [key: string]: unknown;
  }) {
    const hasRefundablePayment = request.order.payments.some(
      (payment) =>
        payment.purpose === PaymentPurpose.ORDER &&
        (payment.status === PaymentStatus.SUCCEEDED ||
          payment.status === PaymentStatus.PARTIALLY_REFUNDED),
    );
    return {
      ...request,
      orderId: request.order.id,
      orderNumber: request.order.orderNumber,
      customer: request.order.customer,
      item: request.orderItem,
      actionEligibility: {
        allowedStatusTransitions: RETURN_TRANSITIONS[request.status],
        canRefund:
          hasRefundablePayment &&
          (request.status === ReturnStatus.APPROVED ||
            request.status === ReturnStatus.RECEIVED),
      },
    };
  }
}
