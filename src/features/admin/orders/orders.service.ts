import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { OrderStatus } from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../database/prisma.service';
import { orderDetailInclude } from '../../orders/order-detail';
import { mapCustomerOrder } from '../../orders/order-view';
import {
  PERSON_SELECT,
  adminCreatedAtFilter,
  adminPage,
  adminSkip,
} from '../common/admin-pagination';
import { AdminOrderQueryDto } from './dto/orders.dto';

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PAYMENT_PENDING: [],
  PLACED: [],
  PAID: [OrderStatus.PROCESSING],
  PROCESSING: [OrderStatus.SHIPPED],
  SHIPPED: [OrderStatus.DELIVERED],
  DELIVERED: [],
  CANCELLED: [],
  PAYMENT_FAILED: [OrderStatus.CANCELLED],
  REFUNDED: [],
};

@Injectable()
export class AdminOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminOrderQueryDto) {
    const where: Prisma.OrderWhereInput = {
      status: query.status,
      customerId: query.customerId,
      createdAt: adminCreatedAtFilter(query),
    };
    if (query.search) {
      where.OR = [
        { orderNumber: { contains: query.search, mode: 'insensitive' } },
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
    const result = await adminPage(
      this.prisma,
      this.prisma.order.findMany({
        where,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          createdAt: true,
          customer: { select: PERSON_SELECT },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: adminSkip(query),
        take: query.pageSize,
      }),
      this.prisma.order.count({ where }),
      query,
    );
    return {
      ...result,
      items: result.items.map(({ _count, ...order }) => ({
        ...order,
        itemCount: _count.items,
        actionEligibility: this.orderActions(order.status),
      })),
    };
  }

  async get(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: orderDetailInclude,
    });
    if (!order) throw new NotFoundException('Order not found');
    return {
      ...mapCustomerOrder(order),
      actionEligibility: this.orderActions(order.status),
    };
  }

  private orderActions(status: OrderStatus) {
    return {
      allowedStatusTransitions: ORDER_TRANSITIONS[status],
      canCancel: status === OrderStatus.PAYMENT_PENDING,
    };
  }
}
