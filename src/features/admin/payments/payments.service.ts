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
import { AdminPaymentQueryDto } from './dto/payments.dto';

@Injectable()
export class AdminPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminPaymentQueryDto) {
    const where = this.paymentWhere(query);
    const include = this.paymentInclude();
    const result = await adminPage(
      this.prisma,
      this.prisma.payment.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip: adminSkip(query),
        take: query.pageSize,
      }),
      this.prisma.payment.count({ where }),
      query,
    );
    return {
      ...result,
      items: result.items.map((payment) => this.mapPayment(payment)),
    };
  }

  async get(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: this.paymentInclude(),
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return this.mapPayment(payment);
  }

  private paymentWhere(query: AdminPaymentQueryDto): Prisma.PaymentWhereInput {
    const where: Prisma.PaymentWhereInput = {
      status: query.status,
      purpose: query.purpose,
      userId: query.userId,
      orderId: query.orderId,
      quotation: query.requestId
        ? { is: { requestId: query.requestId } }
        : undefined,
      createdAt: adminCreatedAtFilter(query),
    };
    if (query.search) {
      where.OR = [
        { id: { contains: query.search, mode: 'insensitive' } },
        {
          providerReference: {
            contains: query.search,
            mode: 'insensitive',
          },
        },
        {
          stripePaymentIntentId: {
            contains: query.search,
            mode: 'insensitive',
          },
        },
        { user: { email: { contains: query.search, mode: 'insensitive' } } },
        {
          order: {
            is: {
              orderNumber: { contains: query.search, mode: 'insensitive' },
            },
          },
        },
        {
          quotation: {
            is: {
              request: {
                requestNumber: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            },
          },
        },
      ];
    }
    return where;
  }

  private paymentInclude() {
    return {
      user: { select: PERSON_SELECT },
      order: { include: { returnRequests: true } },
      quotation: {
        include: {
          request: { include: { report: true } },
        },
      },
    } satisfies Prisma.PaymentInclude;
  }

  private mapPayment(payment: {
    metadata: unknown;
    provider: string;
    status: PaymentStatus;
    purpose: PaymentPurpose;
    order: {
      id: string;
      orderNumber: string;
      returnRequests: { status: ReturnStatus }[];
    } | null;
    quotation: {
      request: {
        id: string;
        requestNumber: string;
        status: string;
        report: { customerConfirmedAt: Date | null } | null;
      };
    } | null;
    [key: string]: unknown;
  }) {
    const metadata =
      typeof payment.metadata === 'object' && payment.metadata !== null
        ? (payment.metadata as Record<string, unknown>)
        : undefined;
    const method =
      typeof metadata?.paymentMethod === 'string'
        ? metadata.paymentMethod
        : typeof metadata?.payment_method_type === 'string'
          ? metadata.payment_method_type
          : null;
    const canCapture =
      payment.provider === 'stripe' &&
      payment.purpose === PaymentPurpose.QUOTATION &&
      payment.status === PaymentStatus.AUTHORIZED &&
      payment.quotation?.request.status === 'REPORT_SUBMITTED' &&
      Boolean(payment.quotation.request.report?.customerConfirmedAt);
    const canRefundOrder =
      payment.provider === 'stripe' &&
      payment.purpose === PaymentPurpose.ORDER &&
      (payment.status === PaymentStatus.SUCCEEDED ||
        payment.status === PaymentStatus.PARTIALLY_REFUNDED) &&
      Boolean(
        payment.order?.returnRequests.some(
          (request) =>
            request.status === ReturnStatus.APPROVED ||
            request.status === ReturnStatus.RECEIVED,
        ),
      );
    return {
      ...payment,
      paymentMethod: method,
      orderId: payment.order?.id ?? null,
      orderNumber: payment.order?.orderNumber ?? null,
      requestId: payment.quotation?.request.id ?? null,
      requestNumber: payment.quotation?.request.requestNumber ?? null,
      actionEligibility: { canCapture, canRefundOrder },
    };
  }
}
