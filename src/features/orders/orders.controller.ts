import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  OrderStatus,
  ReturnStatus,
  UserRole,
} from '../../../generated/prisma/enums';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { PrismaService } from '../../database/prisma.service';
import { StripeService } from '../payments/stripe.service';
import {
  OrderResponseDto,
  RequestReturnDto,
  ReturnRequestResponseDto,
  UpdateOrderStatusDto,
  UpdateReturnStatusDto,
} from './dto/orders.dto';

const orderInclude = {
  items: { include: { product: true } },
  returnRequest: true,
  statusHistory: { orderBy: { createdAt: 'asc' } },
  payments: true,
} as const;

const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
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

const ALLOWED_RETURN_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: [ReturnStatus.APPROVED, ReturnStatus.REJECTED],
  APPROVED: [ReturnStatus.RECEIVED, ReturnStatus.REJECTED],
  REJECTED: [],
  RECEIVED: [],
  REFUNDED: [],
};

@ApiTags('Orders & Returns')
@ApiBearerAuth()
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List orders for the authenticated customer, or all orders for an admin',
  })
  @ApiOkResponse({ type: OrderResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.order.findMany({
      where: user.role === UserRole.ADMIN ? {} : { customerId: user.id },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get an order, its delivery timeline, payment-safe status, and return request',
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async one(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const order = await this.authorizedOrder(user, id);
    return this.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: orderInclude,
    });
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Cancel an unpaid hosted Checkout order and release its inventory',
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'Stripe already received payment for this order.',
  })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stripe.cancelPendingOrder(user, id);
  }

  @Post(':id/return')
  @ApiOperation({ summary: 'Request a return for a delivered order' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiCreatedResponse({ type: ReturnRequestResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'A return request already exists for this order.',
  })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async requestReturn(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RequestReturnDto,
  ) {
    if (user.role !== UserRole.CUSTOMER)
      throw new ForbiddenException('Only customers can request returns');
    const order = await this.authorizedOrder(user, id);
    if (order.status !== OrderStatus.DELIVERED)
      throw new BadRequestException(
        'Only delivered orders are eligible for returns',
      );
    if (order.returnRequest)
      throw new ConflictException('A return request already exists');
    return this.prisma.returnRequest.create({ data: { orderId: id, ...dto } });
  }

  @Post(':id/refund')
  @ApiOperation({
    summary:
      'Issue a Stripe refund for an approved or received return (admin only)',
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiOkResponse({ type: ReturnRequestResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  refund(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stripe.refundDeliveredOrder(user, id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Update an order fulfillment or delivery status (admin only)',
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async status(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    this.admin(user);
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (!ALLOWED_ORDER_TRANSITIONS[order.status].includes(dto.status))
      throw new BadRequestException(
        `Cannot transition from ${order.status} to ${dto.status}`,
      );
    if (
      dto.status === OrderStatus.SHIPPED &&
      (!dto.trackingNumber || !dto.carrier)
    )
      throw new BadRequestException(
        'carrier and trackingNumber are required before shipping',
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: {
          status: dto.status,
          trackingNumber: dto.trackingNumber,
          carrier: dto.carrier,
          estimatedDelivery: dto.estimatedDelivery
            ? new Date(dto.estimatedDelivery)
            : undefined,
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          status: dto.status,
          note: dto.note,
          actorId: user.id,
        },
      });
      await tx.notification.create({
        data: {
          userId: order.customerId,
          title: `Order ${dto.status.toLowerCase().replaceAll('_', ' ')}`,
          body: `Your order ${order.orderNumber} is now ${dto.status.toLowerCase().replaceAll('_', ' ')}.`,
          data: { orderId: id, status: dto.status },
        },
      });
    });
    return this.prisma.order.findUniqueOrThrow({
      where: { id },
      include: orderInclude,
    });
  }

  @Patch('returns/:id/status')
  @ApiOperation({ summary: 'Review and update a return request (admin only)' })
  @ApiParam({ name: 'id', description: 'Return request ID' })
  @ApiOkResponse({ type: ReturnRequestResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async returnStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateReturnStatusDto,
  ) {
    this.admin(user);
    const request = await this.prisma.returnRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Return request not found');
    if (dto.status === ReturnStatus.REFUNDED) {
      throw new BadRequestException(
        'Use POST /orders/:id/refund so Stripe processes the refund',
      );
    }
    if (!ALLOWED_RETURN_TRANSITIONS[request.status].includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition return from ${request.status} to ${dto.status}`,
      );
    }
    return this.prisma.returnRequest.update({ where: { id }, data: dto });
  }

  private async authorizedOrder(user: AuthUser, id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { returnRequest: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (user.role !== UserRole.ADMIN && order.customerId !== user.id)
      throw new ForbiddenException('You cannot access this order');
    return order;
  }

  private admin(user: AuthUser) {
    if (user.role !== UserRole.ADMIN)
      throw new ForbiddenException('Only administrators can use this action');
  }
}
