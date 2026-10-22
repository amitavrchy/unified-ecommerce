import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Prisma } from '../../../generated/prisma/client';
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
import { MediaUploadService } from '../../service/cloudinary/media-upload.service';
import { CartService } from '../cart/cart.service';
import { CartResponseDto } from '../cart/dto/cart-response.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { StripeService } from '../payments/stripe.service';
import {
  CustomerOrderQueryDto,
  CustomerReturnResponseDto,
  OrderPageResponseDto,
  OrderResponseDto,
  RequestReturnDto,
  RefundOrderDto,
  ReturnRequestResponseDto,
  UpdateOrderStatusDto,
  UpdateReturnStatusDto,
  UpdateReturnStatusFormDto,
} from './dto/orders.dto';
import { orderDetailInclude } from './order-detail';
import { customerOrderStatuses, mapCustomerOrder } from './order-view';

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

const RETURN_LABEL_FOLDER = 'vacuumCare/return-labels';

@ApiTags('Orders & Returns')
@ApiBearerAuth()
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly notifications: NotificationsService,
    private readonly cart: CartService,
    private readonly media: MediaUploadService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List store orders for the authenticated customer',
    description:
      'Admins see every order. Use group=active|complete for the My Orders tabs. Each item includes tracking timeline, shipping address, and action flags.',
  })
  @ApiOkResponse({ type: OrderPageResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: CustomerOrderQueryDto,
  ) {
    const groupStatuses = customerOrderStatuses(query.group);
    const where: Prisma.OrderWhereInput = {
      ...(user.role === UserRole.ADMIN ? {} : { customerId: user.id }),
      status:
        query.status ?? (groupStatuses ? { in: groupStatuses } : undefined),
    };
    if (query.search) {
      where.OR = [
        { orderNumber: { contains: query.search, mode: 'insensitive' } },
        {
          items: {
            some: {
              product: {
                name: { contains: query.search, mode: 'insensitive' },
              },
            },
          },
        },
      ];
    }
    let [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: orderDetailInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    orders = await this.syncPendingOrders(orders);
    return {
      items: orders.map((order) => mapCustomerOrder(order)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  @Get('returns')
  @ApiOperation({
    summary: 'List return requests for the authenticated customer',
  })
  @ApiOkResponse({ type: CustomerReturnResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async listReturns(@CurrentUser() user: AuthUser) {
    const requests = await this.prisma.returnRequest.findMany({
      where:
        user.role === UserRole.ADMIN ? {} : { order: { customerId: user.id } },
      include: {
        order: { select: { orderNumber: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return requests.map(({ order, ...request }) => ({
      ...request,
      orderNumber: order.orderNumber,
      orderStatus: order.status,
    }));
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get an order, delivery timeline, payment status, and return eligibility',
  })
  @ApiParam({ name: 'id', description: 'Order ID or order number (CC-...)' })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async one(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const order = await this.authorizedOrder(user, id);
    if (order.status === OrderStatus.PAYMENT_PENDING) {
      await this.stripe.syncPendingOrderPayment(order.id);
    }
    const detail = await this.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: orderDetailInclude,
    });
    return mapCustomerOrder(detail);
  }

  @Get(':id/returns')
  @ApiOperation({ summary: 'List return requests for one order' })
  @ApiParam({ name: 'id', description: 'Order ID or order number (CC-...)' })
  @ApiOkResponse({ type: ReturnRequestResponseDto, isArray: true })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async orderReturns(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const order = await this.authorizedOrder(user, id);
    return this.prisma.returnRequest.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Cancel an unpaid hosted Checkout order and release its inventory',
  })
  @ApiParam({ name: 'id', description: 'Order ID or order number (CC-...)' })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'Stripe already received payment for this order.',
  })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const order = await this.authorizedOrder(user, id);
    const cancelled = await this.stripe.cancelPendingOrder(user, order.id);
    return mapCustomerOrder(cancelled);
  }

  @Post(':id/reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Add this order’s products back to the cart',
    description:
      'Merges quantities with the current cart and caps each line at available stock. Inactive or out-of-stock products are skipped.',
  })
  @ApiParam({ name: 'id', description: 'Order ID or order number (CC-...)' })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async reorder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (user.role !== UserRole.CUSTOMER)
      throw new ForbiddenException('Only customers can reorder');
    const order = await this.authorizedOrder(user, id);
    const detail = await this.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
    return this.cart.addFromOrder(
      user,
      detail.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    );
  }

  @Post(':id/return')
  @ApiOperation({ summary: 'Request a return for a delivered order' })
  @ApiParam({ name: 'id', description: 'Order ID or order number (CC-...)' })
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
    const activeReturns = await this.prisma.returnRequest.findMany({
      where: { orderId: order.id, status: { not: ReturnStatus.REJECTED } },
    });
    if (dto.orderItemId) {
      const item = await this.prisma.orderItem.findFirst({
        where: { id: dto.orderItemId, orderId: order.id },
        select: { id: true },
      });
      if (!item) {
        throw new BadRequestException(
          'orderItemId must belong to the selected order',
        );
      }
      if (activeReturns.some((request) => !request.orderItemId)) {
        throw new ConflictException(
          'A full-order return already exists for this order',
        );
      }
      if (
        activeReturns.some((request) => request.orderItemId === dto.orderItemId)
      ) {
        throw new ConflictException(
          'A return request already exists for this item',
        );
      }
    } else if (activeReturns.length) {
      throw new ConflictException('A return request already exists');
    }
    const returnRequest = await this.prisma.returnRequest.create({
      data: { orderId: order.id, ...dto },
    });
    await this.notifications.fanOutToActiveAdmins({
      title: 'New return request',
      body: `A return was requested for order ${order.orderNumber}.`,
      data: { orderId: order.id, returnRequestId: returnRequest.id },
    });
    return returnRequest;
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
  refund(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RefundOrderDto = {},
  ) {
    return this.stripe.refundDeliveredOrder(user, id, dto.returnRequestId);
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
      await this.notifications.createForUser(
        order.customerId,
        {
          title: `Order ${dto.status.toLowerCase().replaceAll('_', ' ')}`,
          body: `Your order ${order.orderNumber} is now ${dto.status.toLowerCase().replaceAll('_', ' ')}.`,
          data: { orderId: id, status: dto.status },
        },
        tx,
      );
    });
    const detail = await this.prisma.order.findUniqueOrThrow({
      where: { id },
      include: orderDetailInclude,
    });
    return mapCustomerOrder(detail);
  }

  @Patch('returns/:id/status')
  @ApiOperation({
    summary: 'Review and update a return request (admin only)',
    description:
      'Send as multipart form data. Upload the shipping label on the returnLabel field, or pass an already-hosted returnLabelUrl.',
  })
  @ApiParam({ name: 'id', description: 'Return request ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateReturnStatusFormDto })
  @ApiOkResponse({ type: ReturnRequestResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @UseInterceptors(FileInterceptor('returnLabel'))
  async returnStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateReturnStatusDto,
    @UploadedFile() returnLabel?: Express.Multer.File,
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
    let returnLabelUrl = dto.returnLabelUrl;
    if (returnLabel) {
      this.media.assertDocuments([returnLabel]);
      [returnLabelUrl] = await this.media.uploadUrls(
        [returnLabel],
        RETURN_LABEL_FOLDER,
      );
    }
    return this.prisma.returnRequest.update({
      where: { id },
      data: { ...dto, returnLabelUrl },
    });
  }

  private async syncPendingOrders<
    T extends { id: string; status: OrderStatus },
  >(orders: T[]): Promise<T[]> {
    const pendingIds = orders
      .filter((order) => order.status === OrderStatus.PAYMENT_PENDING)
      .map((order) => order.id);
    if (!pendingIds.length) return orders;
    const syncedIds = (
      await Promise.all(
        pendingIds.map(async (id) =>
          (await this.stripe.syncPendingOrderPayment(id)) ? id : null,
        ),
      )
    ).filter((id): id is string => Boolean(id));
    if (!syncedIds.length) return orders;
    const refreshed = await this.prisma.order.findMany({
      where: { id: { in: syncedIds } },
      include: orderDetailInclude,
    });
    const byId = new Map(refreshed.map((order) => [order.id, order]));
    return orders.map((order) => byId.get(order.id) ?? order) as T[];
  }

  private async authorizedOrder(user: AuthUser, idOrNumber: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        OR: [{ id: idOrNumber }, { orderNumber: idOrNumber }],
      },
      include: { returnRequests: true },
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
