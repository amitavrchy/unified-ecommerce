import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import Stripe from 'stripe';
import {
  OrderStatus,
  PaymentPurpose,
  PaymentStatus,
  QuoteStatus,
  RequestStatus,
  ReturnStatus,
  UserRole,
} from '../../../generated/prisma/enums';
import type { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../database/prisma.service';
import type {
  CreateCartCheckoutDto,
  CreateOrderCheckoutDto,
} from './dto/checkout.dto';

@Injectable()
export class StripeService {
  constructor(private readonly prisma: PrismaService) {}

  private client(): Stripe {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret)
      throw new InternalServerErrorException('Stripe is not configured');
    return new Stripe(secret);
  }

  private currency(): string {
    const currency = (process.env.STRIPE_CURRENCY ?? 'cad').toLowerCase();
    if (!/^[a-z]{3}$/.test(currency))
      throw new InternalServerErrorException(
        'STRIPE_CURRENCY must be an ISO 4217 currency code',
      );
    return currency;
  }

  private clientUrl(): string {
    const value = process.env.CLIENT_APP_URL;
    if (!value)
      throw new InternalServerErrorException(
        'CLIENT_APP_URL is required for Checkout',
      );
    return value.replace(/\/$/, '');
  }

  private taxRate(): number {
    const rate = Number(process.env.TAX_RATE ?? 0.14975);
    if (!Number.isFinite(rate) || rate < 0 || rate > 1)
      throw new InternalServerErrorException(
        'TAX_RATE must be a decimal between 0 and 1',
      );
    return rate;
  }

  async createOrderCheckout(user: AuthUser, dto: CreateOrderCheckoutDto) {
    if (user.role !== UserRole.CUSTOMER)
      throw new ForbiddenException('Only customers can checkout');
    const idempotencyKey = dto.idempotencyKey ?? randomUUID();
    const existing = await this.prisma.payment.findFirst({
      where: { userId: user.id, idempotencyKey },
      include: { order: true },
    });
    if (existing?.stripeCheckoutSessionId) {
      const session = await this.client().checkout.sessions.retrieve(
        existing.stripeCheckoutSessionId,
      );
      if (session.url && existing.orderId) {
        return this.checkoutResponse(existing, existing.orderId, session.url);
      }
    }
    if (existing)
      throw new BadRequestException(
        'This checkout request is no longer available; use a new idempotency key',
      );

    const quantities = new Map<string, number>();
    for (const item of dto.items)
      quantities.set(
        item.productId,
        (quantities.get(item.productId) ?? 0) + item.quantity,
      );
    if (!quantities.size)
      throw new BadRequestException('Checkout requires at least one item');

    const prepared = await this.prisma.$transaction(async (tx) => {
      const address = await tx.address.findFirst({
        where: { id: dto.shippingAddressId, userId: user.id },
      });
      if (!address)
        throw new ForbiddenException(
          'Shipping address does not belong to the customer',
        );
      const products = await tx.product.findMany({
        where: { id: { in: [...quantities.keys()] }, isActive: true },
      });
      if (products.length !== quantities.size)
        throw new NotFoundException('One or more products are unavailable');

      for (const product of products) {
        const quantity = quantities.get(product.id)!;
        const updated = await tx.product.updateMany({
          where: { id: product.id, stock: { gte: quantity } },
          data: { stock: { decrement: quantity } },
        });
        if (updated.count !== 1)
          throw new BadRequestException(
            `${product.name} no longer has enough stock`,
          );
      }

      const items = products.map((product) => ({
        productId: product.id,
        quantity: quantities.get(product.id)!,
        unitPrice: product.price,
      }));
      const subtotal = items.reduce(
        (sum, item) => sum + Number(item.unitPrice) * item.quantity,
        0,
      );
      const tax = Number((subtotal * this.taxRate()).toFixed(2));
      const order = await tx.order.create({
        data: {
          orderNumber: `CC-${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`,
          customerId: user.id,
          status: OrderStatus.PAYMENT_PENDING,
          shippingAddress: {
            line1: address.line1,
            apartment: address.apartment,
            city: address.city,
            state: address.state,
            zipCode: address.zipCode,
            country: address.country,
          },
          subtotal,
          tax,
          total: subtotal + tax,
          inventoryReservedAt: new Date(),
          items: { create: items },
          statusHistory: {
            create: {
              status: OrderStatus.PAYMENT_PENDING,
              actorId: user.id,
              note: 'Inventory reserved while awaiting Stripe Checkout payment',
            },
          },
        },
        include: { items: { include: { product: true } } },
      });
      const payment = await tx.payment.create({
        data: {
          userId: user.id,
          orderId: order.id,
          purpose: PaymentPurpose.ORDER,
          amount: order.total,
          currency: this.currency(),
          status: PaymentStatus.PENDING,
          idempotencyKey,
        },
      });
      return { order, payment };
    });

    let createdSession: Stripe.Checkout.Session | undefined;
    try {
      const stripe = this.client();
      createdSession = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          client_reference_id: prepared.payment.id,
          customer_email: user.email,
          success_url: `${this.clientUrl()}/orders/${prepared.order.id}/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${this.clientUrl()}/orders/${prepared.order.id}/cancelled`,
          metadata: {
            paymentId: prepared.payment.id,
            orderId: prepared.order.id,
            purpose: PaymentPurpose.ORDER,
          },
          payment_intent_data: {
            metadata: {
              paymentId: prepared.payment.id,
              orderId: prepared.order.id,
              purpose: PaymentPurpose.ORDER,
            },
          },
          line_items: [
            ...prepared.order.items.map((item) => ({
              quantity: item.quantity,
              price_data: {
                currency: this.currency(),
                unit_amount: this.toMinorUnit(item.unitPrice),
                product_data: {
                  name: item.product.name,
                  description: item.product.description.slice(0, 500),
                  metadata: { productId: item.productId },
                },
              },
            })),
            ...(Number(prepared.order.tax) > 0
              ? [
                  {
                    quantity: 1,
                    price_data: {
                      currency: this.currency(),
                      unit_amount: this.toMinorUnit(prepared.order.tax),
                      product_data: { name: 'Sales tax' },
                    },
                  },
                ]
              : []),
          ],
        },
        { idempotencyKey },
      );
      if (!createdSession.url)
        throw new InternalServerErrorException(
          'Stripe did not return a Checkout URL',
        );
      const payment = await this.prisma.payment.update({
        where: { id: prepared.payment.id },
        data: {
          stripeCheckoutSessionId: createdSession.id,
          status: PaymentStatus.PROCESSING,
        },
      });
      return this.checkoutResponse(
        payment,
        prepared.order.id,
        createdSession.url,
      );
    } catch (error) {
      // If Stripe did not create a session, there is no way to pay this
      // reservation, so it is safe to release it. Once Stripe has created a
      // session, only release inventory after that session is known expired;
      // otherwise a delayed payment could be accepted against returned stock.
      if (!createdSession) {
        await this.releaseOrderInventory(
          prepared.order.id,
          PaymentStatus.FAILED,
          'checkout_session_creation_failed',
        );
      } else {
        await this.reconcileCheckoutSessionAfterPersistenceFailure(
          prepared.payment.id,
          prepared.order.id,
          createdSession.id,
        );
      }
      throw error;
    }
  }

  async createCartCheckout(user: AuthUser, dto: CreateCartCheckoutDto) {
    if (user.role !== UserRole.CUSTOMER)
      throw new ForbiddenException('Only customers can checkout');
    const cart = await this.prisma.cart.findUnique({
      where: { customerId: user.id },
      include: { items: true },
    });
    if (!cart?.items.length) throw new BadRequestException('Cart is empty');
    return this.createOrderCheckout(user, {
      shippingAddressId: dto.shippingAddressId,
      idempotencyKey: dto.idempotencyKey,
      items: cart.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    });
  }

  async createServiceAuthorization(user: AuthUser, requestId: string) {
    if (user.role !== UserRole.CUSTOMER) throw new ForbiddenException();
    const request = await this.prisma.serviceRequest.findFirst({
      where: { id: requestId, customerId: user.id },
      include: { quotation: true },
    });
    if (!request?.quotation)
      throw new NotFoundException('Service quotation not found');
    const quote = request.quotation;
    if (quote.status !== QuoteStatus.ACCEPTED || quote.validUntil <= new Date())
      throw new BadRequestException('An active accepted quotation is required');
    const existing = await this.prisma.payment.findFirst({
      where: {
        quotationId: quote.id,
        status: {
          in: [
            PaymentStatus.PENDING,
            PaymentStatus.PROCESSING,
            PaymentStatus.AUTHORIZED,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing?.stripePaymentIntentId) {
      const intent = await this.client().paymentIntents.retrieve(
        existing.stripePaymentIntentId,
      );
      return {
        paymentId: existing.id,
        paymentIntentId: intent.id,
        clientSecret: intent.client_secret,
        status: intent.status,
        amount: Number(existing.amount),
        currency: existing.currency,
      };
    }
    const payment = await this.prisma.payment.create({
      data: {
        userId: user.id,
        quotationId: quote.id,
        purpose: PaymentPurpose.QUOTATION,
        amount: quote.totalAmount,
        currency: this.currency(),
        status: PaymentStatus.PENDING,
        idempotencyKey: randomUUID(),
      },
    });
    try {
      const intent = await this.client().paymentIntents.create(
        {
          amount: this.toMinorUnit(quote.totalAmount),
          currency: this.currency(),
          capture_method: 'manual',
          metadata: {
            paymentId: payment.id,
            quotationId: quote.id,
            requestId,
            purpose: PaymentPurpose.QUOTATION,
          },
        },
        { idempotencyKey: payment.idempotencyKey! },
      );
      const updated = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          stripePaymentIntentId: intent.id,
          status: PaymentStatus.PROCESSING,
        },
      });
      return {
        paymentId: updated.id,
        paymentIntentId: intent.id,
        clientSecret: intent.client_secret,
        status: intent.status,
        amount: Number(updated.amount),
        currency: updated.currency,
      };
    } catch (error) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          failureMessage: 'Could not create Stripe PaymentIntent',
        },
      });
      throw error;
    }
  }

  async captureServicePayment(user: AuthUser, paymentId: string) {
    if (user.role !== UserRole.ADMIN) throw new ForbiddenException();
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        quotation: { include: { request: { include: { report: true } } } },
      },
    });
    if (
      !payment ||
      payment.purpose !== PaymentPurpose.QUOTATION ||
      !payment.stripePaymentIntentId
    )
      throw new NotFoundException('Authorized service payment not found');
    if (payment.status !== PaymentStatus.AUTHORIZED)
      throw new BadRequestException('Payment is not authorized for capture');
    if (
      payment.quotation?.request.status !== RequestStatus.REPORT_SUBMITTED ||
      !payment.quotation.request.report?.customerConfirmedAt
    ) {
      throw new BadRequestException(
        'A customer-confirmed technician report is required before capture',
      );
    }
    const intent = await this.client().paymentIntents.capture(
      payment.stripePaymentIntentId,
      {},
      { idempotencyKey: `capture-${payment.id}` },
    );
    // The Stripe webhook is the source of truth for a successful capture. The
    // API only records that a capture has been requested; `payment_intent.succeeded`
    // marks the service as paid/completed.
    await this.prisma.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.AUTHORIZED },
      data: {
        status: PaymentStatus.PROCESSING,
        stripePaymentIntentId: intent.id,
      },
    });
    return this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  }

  async voidServiceAuthorizationsForRequest(requestId: string) {
    const payments = await this.prisma.payment.findMany({
      where: {
        quotation: { is: { requestId } },
        purpose: PaymentPurpose.QUOTATION,
        status: {
          in: [
            PaymentStatus.PENDING,
            PaymentStatus.PROCESSING,
            PaymentStatus.AUTHORIZED,
          ],
        },
      },
    });
    for (const payment of payments) {
      if (payment.stripePaymentIntentId) {
        const intent = await this.client().paymentIntents.cancel(
          payment.stripePaymentIntentId,
          {},
          { idempotencyKey: `void-${payment.id}` },
        );
        if (intent.status !== 'canceled') {
          throw new BadRequestException(
            'Stripe could not void the service payment authorization',
          );
        }
      }
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.VOIDED },
      });
    }
  }

  async cancelPendingOrder(user: AuthUser, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (user.role !== UserRole.ADMIN && order.customerId !== user.id)
      throw new ForbiddenException('You cannot cancel this order');
    if (order.status !== OrderStatus.PAYMENT_PENDING) {
      throw new BadRequestException(
        'Only an unpaid Checkout order can be cancelled here',
      );
    }
    const payment = order.payments.find(
      (candidate) =>
        candidate.purpose === PaymentPurpose.ORDER &&
        (candidate.status === PaymentStatus.PENDING ||
          candidate.status === PaymentStatus.PROCESSING),
    );
    if (payment?.stripeCheckoutSessionId) {
      const session = await this.client().checkout.sessions.retrieve(
        payment.stripeCheckoutSessionId,
      );
      if (session.payment_status === 'paid') {
        await this.completeOrderPayment(session);
        throw new ConflictException(
          'Stripe has already received payment for this order',
        );
      }
      if (session.status === 'open') {
        const expired = await this.client().checkout.sessions.expire(
          payment.stripeCheckoutSessionId,
          {},
          { idempotencyKey: `cancel-${payment.id}` },
        );
        if (expired.status !== 'expired') {
          throw new ConflictException(
            'Stripe Checkout could not be expired; do not release inventory yet',
          );
        }
      } else if (session.status === 'complete') {
        // A completed session with an asynchronous method can still settle.
        // It cannot be expired, so retain the reservation until Stripe sends
        // either its success or async-payment-failed event.
        throw new ConflictException(
          'Stripe is still finalizing this checkout payment',
        );
      }
    }
    await this.releaseOrderInventory(
      orderId,
      PaymentStatus.CANCELED,
      'cancelled_by_customer',
      OrderStatus.CANCELLED,
      user.id,
    );
    return this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        items: { include: { product: true } },
        returnRequest: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
        payments: true,
      },
    });
  }

  async refundDeliveredOrder(user: AuthUser, orderId: string) {
    if (user.role !== UserRole.ADMIN)
      throw new ForbiddenException('Only administrators can issue refunds');
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { returnRequest: true, payments: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.returnRequest) {
      throw new BadRequestException(
        'A return request is required before refunding',
      );
    }
    if (
      order.returnRequest.status !== ReturnStatus.APPROVED &&
      order.returnRequest.status !== ReturnStatus.RECEIVED
    ) {
      throw new BadRequestException(
        'The return must be approved or received before refunding',
      );
    }
    const payment = order.payments.find(
      (candidate) =>
        candidate.purpose === PaymentPurpose.ORDER &&
        candidate.status === PaymentStatus.SUCCEEDED &&
        Boolean(candidate.stripePaymentIntentId),
    );
    if (!payment?.stripePaymentIntentId) {
      throw new BadRequestException(
        'A successful Stripe order payment was not found',
      );
    }
    const refund = await this.client().refunds.create(
      {
        payment_intent: payment.stripePaymentIntentId,
        metadata: { paymentId: payment.id, orderId },
      },
      { idempotencyKey: `refund-${payment.id}` },
    );
    if (refund.status !== 'succeeded')
      throw new BadRequestException('Stripe refund did not complete');
    if (refund.amount !== this.toMinorUnit(payment.amount)) {
      throw new BadRequestException(
        'Stripe returned an unexpected refund amount for this order',
      );
    }
    const refundedAmount = Number(refund.amount) / 100;
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.REFUNDED,
          stripeRefundId: refund.id,
          refundedAmount,
        },
      });
      await tx.returnRequest.update({
        where: { id: order.returnRequest!.id },
        data: {
          status: ReturnStatus.REFUNDED,
          resolution: `Stripe refund ${refund.id}`,
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.REFUNDED },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: OrderStatus.REFUNDED,
          actorId: user.id,
          note: `Stripe refund ${refund.id}`,
        },
      });
      await tx.notification.create({
        data: {
          userId: order.customerId,
          title: 'Order refund issued',
          body: `A refund of ${refundedAmount.toFixed(2)} ${payment.currency.toUpperCase()} has been issued for order ${order.orderNumber}.`,
          data: { orderId, paymentId: payment.id, refundId: refund.id },
        },
      });
    });
    return this.prisma.returnRequest.findUniqueOrThrow({
      where: { id: order.returnRequest.id },
    });
  }

  async paymentForUser(user: AuthUser, id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { order: true, quotation: { include: { request: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (user.role !== UserRole.ADMIN && payment.userId !== user.id)
      throw new ForbiddenException();
    return payment;
  }

  async handleWebhook(rawBody: Buffer, signature: string | undefined) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !signature)
      throw new BadRequestException('Missing Stripe webhook signature');
    let event: Stripe.Event;
    try {
      event = this.client().webhooks.constructEvent(
        rawBody,
        signature,
        secret,
        Number(process.env.STRIPE_WEBHOOK_TOLERANCE_SECONDS ?? 300),
      );
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature');
    }
    try {
      await this.prisma.stripeWebhookEvent.create({
        data: {
          stripeEventId: event.id,
          type: event.type,
          objectId: this.eventObjectId(event),
        },
      });
    } catch (error: unknown) {
      if (this.isUniqueConstraint(error)) {
        const previous = await this.prisma.stripeWebhookEvent.findUnique({
          where: { stripeEventId: event.id },
        });
        if (previous?.processedAt) return { received: true, duplicate: true };
        await this.prisma.stripeWebhookEvent.update({
          where: { stripeEventId: event.id },
          data: { processingError: null },
        });
      } else {
        throw error;
      }
    }
    try {
      await this.processEvent(event);
      await this.prisma.stripeWebhookEvent.update({
        where: { stripeEventId: event.id },
        data: { processedAt: new Date() },
      });
    } catch (error: unknown) {
      await this.prisma.stripeWebhookEvent.update({
        where: { stripeEventId: event.id },
        data: {
          processingError:
            error instanceof Error
              ? error.message
              : 'Unknown webhook processing error',
        },
      });
      throw error;
    }
    return { received: true };
  }

  private async processEvent(event: Stripe.Event) {
    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const session = event.data.object;
      if (session.payment_status === 'paid')
        await this.completeOrderPayment(session);
      return;
    }
    if (
      event.type === 'checkout.session.expired' ||
      event.type === 'checkout.session.async_payment_failed'
    ) {
      const session = event.data.object;
      const payment = await this.prisma.payment.findUnique({
        where: { stripeCheckoutSessionId: session.id },
      });
      if (payment?.orderId)
        await this.releaseOrderInventory(
          payment.orderId,
          event.type.endsWith('expired')
            ? PaymentStatus.EXPIRED
            : PaymentStatus.FAILED,
          event.type,
        );
      return;
    }
    if (event.type === 'payment_intent.amount_capturable_updated') {
      const intent = event.data.object;
      await this.authorizeServicePaymentIntent(intent);
      return;
    }
    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object;
      await this.completeServicePaymentIntent(intent);
      return;
    }
    if (
      event.type === 'payment_intent.payment_failed' ||
      event.type === 'payment_intent.canceled'
    ) {
      const intent = event.data.object;
      await this.prisma.payment.updateMany({
        where: { stripePaymentIntentId: intent.id },
        data: {
          status: event.type.endsWith('canceled')
            ? PaymentStatus.CANCELED
            : PaymentStatus.FAILED,
          failureCode: intent.last_payment_error?.code ?? undefined,
          failureMessage: intent.last_payment_error?.message ?? undefined,
        },
      });
    }
  }

  private async completeOrderPayment(session: Stripe.Checkout.Session) {
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { stripeCheckoutSessionId: session.id },
        include: { order: true },
      });
      if (!payment?.orderId || payment.purpose !== PaymentPurpose.ORDER)
        throw new NotFoundException('Order payment not found');
      if (payment.status === PaymentStatus.SUCCEEDED) return;
      if (payment.order?.inventoryReleasedAt)
        throw new BadRequestException(
          'This order inventory reservation has already been released',
        );
      if (
        session.metadata?.paymentId !== payment.id ||
        session.metadata?.orderId !== payment.orderId ||
        session.currency !== payment.currency ||
        session.amount_total !== this.toMinorUnit(payment.amount)
      ) {
        throw new BadRequestException(
          'Stripe Checkout payment does not match the expected order',
        );
      }
      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id;
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.SUCCEEDED,
          paidAt: new Date(),
          stripePaymentIntentId: paymentIntentId,
        },
      });
      await tx.order.update({
        where: { id: payment.orderId },
        data: { status: OrderStatus.PAID, paidAt: new Date() },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: payment.orderId,
          status: OrderStatus.PAID,
          note: 'Stripe Checkout payment confirmed',
        },
      });
      await tx.notification.create({
        data: {
          userId: payment.userId,
          title: 'Order paid',
          body: `Your order ${payment.order?.orderNumber ?? ''} has been paid and is being prepared.`,
          data: { orderId: payment.orderId },
        },
      });
    });
  }

  /**
   * Handles the narrow failure window after Stripe has created a Checkout
   * Session but before this API has successfully stored its ID. We either
   * restore the link and let the webhook finish payment, or expire the session
   * before returning reserved stock. A best-effort recovery must never return
   * stock while an active Stripe session could still be paid.
   */
  private async reconcileCheckoutSessionAfterPersistenceFailure(
    paymentId: string,
    orderId: string,
    sessionId: string,
  ) {
    try {
      const session = await this.client().checkout.sessions.retrieve(sessionId);
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          stripeCheckoutSessionId: session.id,
          status: PaymentStatus.PROCESSING,
        },
      });
      if (session.payment_status === 'paid') {
        await this.completeOrderPayment(session);
        return;
      }
      if (session.status === 'expired') {
        await this.releaseOrderInventory(
          orderId,
          PaymentStatus.EXPIRED,
          'checkout_session_expired_during_recovery',
        );
        return;
      }
      if (session.status === 'open') {
        const expired = await this.client().checkout.sessions.expire(
          session.id,
          {},
          { idempotencyKey: `recover-expire-${paymentId}` },
        );
        if (expired.status === 'expired') {
          await this.releaseOrderInventory(
            orderId,
            PaymentStatus.FAILED,
            'checkout_session_persistence_failed',
          );
        }
      }
    } catch {
      // Keeping the reservation is conservative: a later signed webhook can
      // still settle it, while releasing it could oversell inventory.
    }
  }

  private async releaseOrderInventory(
    orderId: string,
    status: PaymentStatus,
    reason: string,
    orderStatus: OrderStatus = OrderStatus.PAYMENT_FAILED,
    actorId?: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true, payments: true },
      });
      if (
        !order ||
        order.inventoryReleasedAt ||
        order.status === OrderStatus.PAID
      )
        return;
      for (const item of order.items)
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: orderStatus,
          inventoryReleasedAt: new Date(),
        },
      });
      await tx.orderStatusHistory.create({
        data: { orderId, status: orderStatus, note: reason, actorId },
      });
      await tx.payment.updateMany({
        where: {
          orderId,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
        },
        data: { status, failureMessage: reason },
      });
    });
  }

  private async authorizeServicePaymentIntent(intent: Stripe.PaymentIntent) {
    const paymentId = intent.metadata.paymentId;
    if (!paymentId)
      throw new BadRequestException(
        'Stripe PaymentIntent has no payment reference',
      );
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (
      !payment ||
      payment.purpose !== PaymentPurpose.QUOTATION ||
      payment.stripePaymentIntentId !== intent.id ||
      intent.currency !== payment.currency ||
      intent.amount !== this.toMinorUnit(payment.amount)
    ) {
      throw new BadRequestException(
        'Stripe authorization does not match the expected quote',
      );
    }
    await this.prisma.payment.updateMany({
      where: {
        id: payment.id,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
      },
      data: { status: PaymentStatus.AUTHORIZED, authorizedAt: new Date() },
    });
  }

  private async completeServicePaymentIntent(intent: Stripe.PaymentIntent) {
    const paymentId = intent.metadata.paymentId;
    if (!paymentId) return;
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { quotation: { include: { request: true } } },
      });
      if (!payment || payment.purpose !== PaymentPurpose.QUOTATION) return;
      if (payment.status === PaymentStatus.CAPTURED) return;
      if (
        payment.stripePaymentIntentId !== intent.id ||
        intent.currency !== payment.currency ||
        intent.amount_received !== this.toMinorUnit(payment.amount) ||
        !payment.quotation
      ) {
        throw new BadRequestException(
          'Stripe capture does not match the expected quote',
        );
      }
      if (payment.quotation.request.status !== RequestStatus.REPORT_SUBMITTED) {
        throw new BadRequestException(
          'Service report must be submitted before a payment capture can complete',
        );
      }
      const now = new Date();
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.CAPTURED, capturedAt: now, paidAt: now },
      });
      await tx.serviceRequest.update({
        where: { id: payment.quotation.requestId },
        data: { status: RequestStatus.COMPLETED, completedAt: now },
      });
      await tx.serviceRequestStatusHistory.create({
        data: {
          requestId: payment.quotation.requestId,
          status: RequestStatus.COMPLETED,
          note: 'Stripe payment captured after final report approval',
        },
      });
      await tx.notification.create({
        data: {
          userId: payment.userId,
          title: 'Service payment captured',
          body: `Payment for quote ${payment.quotation.quoteNumber} has been captured and your service is complete.`,
          data: {
            paymentId: payment.id,
            requestId: payment.quotation.requestId,
          },
        },
      });
    });
  }

  private checkoutResponse(
    payment: {
      id: string;
      stripeCheckoutSessionId: string | null;
      currency: string;
      amount: unknown;
    },
    orderId: string,
    checkoutUrl: string,
  ) {
    return {
      paymentId: payment.id,
      orderId,
      checkoutSessionId: payment.stripeCheckoutSessionId!,
      checkoutUrl,
      currency: payment.currency,
      amount: Number(payment.amount),
    };
  }

  private toMinorUnit(amount: unknown): number {
    return Math.round(Number(amount) * 100);
  }
  private eventObjectId(event: Stripe.Event): string | undefined {
    const object = event.data.object;
    return 'id' in object && typeof object.id === 'string'
      ? object.id
      : undefined;
  }
  private isUniqueConstraint(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }
}
