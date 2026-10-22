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
import { Prisma } from '../../../generated/prisma/client';
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
import { NotificationsService } from '../notifications/notifications.service';
import type {
  CreateCartCheckoutDto,
  CreateOrderCheckoutDto,
  PreviewCheckoutDto,
} from './dto/checkout.dto';
import { checkoutCurrency, quoteOrderTotals } from './order-pricing';
import { checkoutRedirectUrls, stripeSecretKey } from './checkout-urls';
import { orderDetailInclude } from '../orders/order-detail';

@Injectable()
export class StripeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private client(): Stripe {
    return new Stripe(stripeSecretKey(), {
      timeout: 10000,
      maxNetworkRetries: 1,
    });
  }

  private currency(): string {
    return checkoutCurrency();
  }

  async createOrderCheckout(user: AuthUser, dto: CreateOrderCheckoutDto) {
    if (user.role !== UserRole.CUSTOMER)
      throw new ForbiddenException('Only customers can checkout');
    const idempotencyKey = dto.idempotencyKey;
    if (!idempotencyKey)
      throw new BadRequestException('idempotencyKey is required');
    // Validate provider and redirects before reserving any stock.
    const stripe = this.client();
    checkoutRedirectUrls({});
    this.currency();
    const quantities = new Map<string, number>();
    for (const item of dto.items)
      quantities.set(
        item.productId,
        (quantities.get(item.productId) ?? 0) + item.quantity,
      );
    if (!quantities.size || quantities.size > 99)
      throw new BadRequestException(
        'Checkout requires between 1 and 99 distinct products',
      );

    const prepared = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`checkout:${idempotencyKey}`}))`;
      const existing = await tx.payment.findUnique({
        where: { idempotencyKey },
        include: {
          order: { include: { items: { include: { product: true } } } },
        },
      });
      if (existing) {
        if (
          existing.userId !== user.id ||
          existing.purpose !== PaymentPurpose.ORDER ||
          !existing.order
        ) {
          throw new BadRequestException(
            'This idempotency key belongs to another checkout',
          );
        }
        const metadata = existing.metadata as Record<
          string,
          Prisma.JsonValue
        > | null;
        if (
          metadata?.checkoutAddressId !== dto.shippingAddressId ||
          existing.order.items.length !== quantities.size ||
          existing.order.items.some(
            (item) => quantities.get(item.productId) !== item.quantity,
          )
        ) {
          throw new BadRequestException(
            'An idempotency key must be reused with the same checkout details',
          );
        }
        if (
          ![PaymentStatus.PENDING, PaymentStatus.PROCESSING].includes(
            existing.status as 'PENDING' | 'PROCESSING',
          )
        ) {
          throw new ConflictException(
            'This checkout is already finalized; check the order status',
          );
        }
        return { order: existing.order, payment: existing };
      }
      const address = await tx.address.findFirst({
        where: { id: dto.shippingAddressId, userId: user.id },
      });
      if (!address)
        throw new ForbiddenException(
          'Shipping address does not belong to the customer',
        );
      const products = await tx.product.findMany({
        where: { id: { in: [...quantities.keys()] }, isActive: true },
        orderBy: { id: 'asc' },
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

      const totals = quoteOrderTotals(
        products.map((product) => ({
          price: Number(product.price),
          quantity: quantities.get(product.id)!,
          taxable: product.taxable,
        })),
      );
      const taxableSubtotal = products
        .filter((p) => p.taxable)
        .reduce((sum, p) => sum + Number(p.price) * quantities.get(p.id)!, 0);
      let remainingTax = Math.round(totals.tax * 100);
      const taxableProducts = products.filter((p) => p.taxable);
      const items = products.map((product) => {
        const quantity = quantities.get(product.id)!;
        const lastTaxable = product.id === taxableProducts.at(-1)?.id;
        const taxCents =
          !product.taxable || taxableSubtotal === 0
            ? 0
            : lastTaxable
              ? remainingTax
              : Math.min(
                  remainingTax,
                  Math.round(
                    (totals.tax * 100 * Number(product.price) * quantity) /
                      taxableSubtotal,
                  ),
                );
        remainingTax -= taxCents;
        return {
          productId: product.id,
          quantity,
          unitPrice: product.price,
          taxAmount: taxCents / 100,
        };
      });
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
          subtotal: totals.subtotal,
          tax: totals.tax,
          total: totals.total,
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
          metadata: { checkoutAddressId: dto.shippingAddressId },
        },
      });
      return { order, payment };
    });

    if (prepared.payment.stripeCheckoutSessionId) {
      const session = await stripe.checkout.sessions.retrieve(
        prepared.payment.stripeCheckoutSessionId,
      );
      if (session.status === 'open' && session.url) {
        return this.checkoutResponse(
          prepared.payment,
          prepared.order.id,
          session.url,
        );
      }
      if (session.payment_status === 'paid')
        await this.completeOrderPayment(session);
      throw new ConflictException(
        'Checkout is no longer open; check the order status',
      );
    }
    let createdSession: Stripe.Checkout.Session | undefined;
    try {
      const metadata = prepared.payment.metadata as Record<
        string,
        Prisma.JsonValue
      > | null;
      let params = metadata?.checkoutSessionParams as unknown as
        Stripe.Checkout.SessionCreateParams | undefined;
      if (!params) {
        params = {
          mode: 'payment',
          payment_method_types: ['card'],
          client_reference_id: prepared.payment.id,
          customer_email: user.email,
          ...checkoutRedirectUrls({ orderId: prepared.order.id }),
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
        };
        // Store one exact request body. Concurrent callers and retries must not
        // change product names, redirects or amounts for the same Stripe key.
        params = await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`checkout:${idempotencyKey}`}))`;
          const current = await tx.payment.findUniqueOrThrow({
            where: { id: prepared.payment.id },
          });
          const saved = current.metadata as Record<
            string,
            Prisma.JsonValue
          > | null;
          if (saved?.checkoutSessionParams)
            return saved.checkoutSessionParams as unknown as Stripe.Checkout.SessionCreateParams;
          await tx.payment.update({
            where: { id: current.id },
            data: {
              metadata: {
                checkoutAddressId: dto.shippingAddressId,
                checkoutSessionParams:
                  params as unknown as Prisma.InputJsonValue,
              },
            },
          });
          return params!;
        });
      }
      createdSession = await stripe.checkout.sessions.create(params, {
        idempotencyKey: `order:${prepared.payment.id}`,
      });
      if (!createdSession.url)
        throw new InternalServerErrorException(
          'Stripe did not return a Checkout URL',
        );
      await this.prisma.payment.updateMany({
        where: {
          id: prepared.payment.id,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
        },
        data: {
          stripeCheckoutSessionId: createdSession.id,
          status: PaymentStatus.PROCESSING,
        },
      });
      const payment = await this.prisma.payment.findUniqueOrThrow({
        where: { id: prepared.payment.id },
      });
      return this.checkoutResponse(
        payment,
        prepared.order.id,
        createdSession.url,
      );
    } catch (error) {
      if (!createdSession && this.isDefiniteProviderRejection(error)) {
        await this.releaseOrderInventory(
          prepared.order.id,
          PaymentStatus.FAILED,
          'checkout_rejected_by_stripe',
        );
        throw error;
      }
      // A timeout does not prove Stripe failed. Keep the claim and stock so
      // retrying this checkout uses the same provider key and request body.
      if (createdSession) {
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

  async previewCheckout(user: AuthUser, dto: PreviewCheckoutDto) {
    if (user.role !== UserRole.CUSTOMER)
      throw new ForbiddenException('Only customers can checkout');

    const quantities = new Map<string, number>();
    let source: 'cart' | 'items' = 'items';
    if (dto.items) {
      if (!dto.items.length)
        throw new BadRequestException('Checkout requires at least one item');
      for (const item of dto.items)
        quantities.set(
          item.productId,
          (quantities.get(item.productId) ?? 0) + item.quantity,
        );
    } else {
      source = 'cart';
      const cart = await this.prisma.cart.findUnique({
        where: { customerId: user.id },
        include: { items: true },
      });
      if (!cart?.items.length) throw new BadRequestException('Cart is empty');
      for (const item of cart.items)
        quantities.set(item.productId, item.quantity);
    }

    const address = dto.shippingAddressId
      ? await this.prisma.address.findFirst({
          where: { id: dto.shippingAddressId, userId: user.id },
        })
      : await this.prisma.address.findFirst({
          where: { userId: user.id, isPrimary: true },
        });
    if (dto.shippingAddressId && !address)
      throw new ForbiddenException(
        'Shipping address does not belong to the customer',
      );

    const products = await this.prisma.product.findMany({
      where: { id: { in: [...quantities.keys()] }, isActive: true },
    });
    if (products.length !== quantities.size)
      throw new NotFoundException('One or more products are unavailable');
    for (const product of products) {
      const quantity = quantities.get(product.id)!;
      if (product.stock < quantity)
        throw new BadRequestException(
          `${product.name} no longer has enough stock`,
        );
    }

    const items = products.map((product) => {
      const quantity = quantities.get(product.id)!;
      const unitPrice = Number(product.price);
      return {
        productId: product.id,
        name: product.name,
        quantity,
        unitPrice,
        lineTotal: Number((unitPrice * quantity).toFixed(2)),
        taxable: product.taxable,
        inStock: product.stock > 0,
        availableStock: product.stock,
        tagline: product.features[0] ?? null,
        imageUrls: product.imageUrls,
      };
    });
    return {
      source,
      items,
      itemCount: items.reduce((count, item) => count + item.quantity, 0),
      currency: this.currency(),
      shippingAddress: address
        ? {
            id: address.id,
            line1: address.line1,
            apartment: address.apartment,
            city: address.city,
            state: address.state,
            zipCode: address.zipCode,
            country: address.country,
            isPrimary: address.isPrimary,
          }
        : null,
      ...quoteOrderTotals(
        items.map((item) => ({
          price: item.unitPrice,
          quantity: item.quantity,
          taxable: item.taxable,
        })),
      ),
    };
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
    const authorizedAmount = quote.negotiatedTotal ?? quote.totalAmount;
    // Claim one payment per quotation before contacting Stripe. Concurrent
    // requests reuse the persisted idempotency key, including after timeouts.
    const existing = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`quote-authorization:${quote.id}`}))`;
      const active = await tx.payment.findFirst({
        where: {
          quotationId: quote.id,
          purpose: PaymentPurpose.QUOTATION,
          status: {
            in: [
              PaymentStatus.PENDING,
              PaymentStatus.PROCESSING,
              PaymentStatus.AUTHORIZED,
              PaymentStatus.CAPTURED,
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (active?.idempotencyKey) return active;
      if (active)
        return tx.payment.update({
          where: { id: active.id },
          data: { idempotencyKey: randomUUID() },
        });
      return tx.payment.create({
        data: {
          userId: user.id,
          quotationId: quote.id,
          purpose: PaymentPurpose.QUOTATION,
          amount: authorizedAmount,
          currency: this.currency(),
          status: PaymentStatus.PROCESSING,
          idempotencyKey: randomUUID(),
        },
      });
    });
    if (
      existing.status === PaymentStatus.AUTHORIZED ||
      existing.status === PaymentStatus.CAPTURED
    ) {
      return {
        paymentId: existing.id,
        requestId,
        checkoutUrl: null,
        checkoutSessionId: existing.stripeCheckoutSessionId,
        amount: Number(existing.amount),
        currency: existing.currency,
      };
    }
    if (existing.stripePaymentIntentId && !existing.stripeCheckoutSessionId) {
      const intent = await this.client().paymentIntents.retrieve(
        existing.stripePaymentIntentId,
      );
      if (intent.status === 'requires_capture') {
        await this.authorizeServicePaymentIntent(intent);
        return {
          paymentId: existing.id,
          requestId,
          checkoutUrl: null,
          checkoutSessionId: null,
          amount: Number(existing.amount),
          currency: existing.currency,
        };
      }
      throw new ConflictException(
        'An existing authorization is being confirmed; check its payment status',
      );
    }
    if (existing?.stripeCheckoutSessionId) {
      const session = await this.client().checkout.sessions.retrieve(
        existing.stripeCheckoutSessionId,
      );
      if (session.status === 'complete') {
        throw new BadRequestException(
          'Authorization is being confirmed; check the payment status',
        );
      }
      if (session.status === 'open' && session.url) {
        return {
          paymentId: existing.id,
          requestId,
          checkoutUrl: session.url,
          checkoutSessionId: session.id,
          amount: Number(existing.amount),
          currency: existing.currency,
        };
      }
    }
    const payment = existing;
    try {
      const generation = existing.stripeCheckoutSessionId ?? 'initial';
      const params = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`quote-authorization:${quote.id}`}))`;
        const current = await tx.payment.findUniqueOrThrow({
          where: { id: payment.id },
        });
        const metadata = current.metadata as Record<
          string,
          Prisma.JsonValue
        > | null;
        if (
          metadata?.authorizationGeneration === generation &&
          metadata.authorizationSessionParams
        ) {
          return metadata.authorizationSessionParams as unknown as Stripe.Checkout.SessionCreateParams;
        }
        const request: Stripe.Checkout.SessionCreateParams = {
          mode: 'payment',
          payment_method_types: ['card'],
          client_reference_id: payment.id,
          customer_email: user.email,
          ...checkoutRedirectUrls({
            requestId,
            paymentId: payment.id,
          }),
          metadata: {
            paymentId: payment.id,
            quotationId: quote.id,
            requestId,
            purpose: PaymentPurpose.QUOTATION,
          },
          payment_intent_data: {
            capture_method: 'manual',
            metadata: {
              paymentId: payment.id,
              quotationId: quote.id,
              requestId,
              purpose: PaymentPurpose.QUOTATION,
            },
          },
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: payment.currency,
                unit_amount: this.toMinorUnit(payment.amount),
                product_data: {
                  name: `Service quote ${quote.quoteNumber}`,
                },
              },
            },
          ],
        };
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            metadata: {
              authorizationGeneration: generation,
              authorizationSessionParams:
                request as unknown as Prisma.InputJsonValue,
            },
          },
        });
        return request;
      });
      const session = await this.client().checkout.sessions.create(params, {
        idempotencyKey: `quote:${payment.id}:${generation}`,
      });
      if (!session.url)
        throw new InternalServerErrorException(
          'Stripe did not return a Checkout URL',
        );
      const paymentIntentId = this.checkoutPaymentIntentId(session);
      await this.prisma.payment.updateMany({
        where: {
          id: payment.id,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
        },
        data: {
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: paymentIntentId,
          status: PaymentStatus.PROCESSING,
        },
      });
      const updated = await this.prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      return {
        paymentId: updated.id,
        requestId,
        checkoutUrl: session.url,
        checkoutSessionId: session.id,
        amount: Number(updated.amount),
        currency: updated.currency,
      };
    } catch (error) {
      if (this.isDefiniteProviderRejection(error)) {
        await this.prisma.payment.updateMany({
          where: {
            id: payment.id,
            stripeCheckoutSessionId: null,
            status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
          },
          data: {
            status: PaymentStatus.FAILED,
            failureMessage: 'Authorization rejected by Stripe',
          },
        });
        throw error;
      }
      // Stripe may have accepted the request before a network/DB failure.
      // Keep this attempt active so the next request safely retries its key.
      await this.prisma.payment.updateMany({
        where: { id: payment.id, stripeCheckoutSessionId: null },
        data: {
          failureMessage:
            'Stripe authorization creation is pending a safe retry',
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
      if (!payment.stripeCheckoutSessionId && !payment.stripePaymentIntentId) {
        throw new ConflictException(
          'Authorization creation is pending; retry it before cancellation',
        );
      }
      if (payment.stripeCheckoutSessionId) {
        const session = await this.client().checkout.sessions.retrieve(
          payment.stripeCheckoutSessionId,
        );
        if (session.status === 'open')
          await this.client().checkout.sessions.expire(session.id);
        if (session.status === 'complete' && !payment.stripePaymentIntentId) {
          const intentId = this.checkoutPaymentIntentId(session);
          if (!intentId)
            throw new ConflictException(
              'Authorization is still being confirmed',
            );
          payment.stripePaymentIntentId = intentId;
        }
      }
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
    if (payment && !payment.stripeCheckoutSessionId) {
      throw new ConflictException(
        'Checkout creation is pending; retry the original checkout before cancelling',
      );
    }
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
      include: orderDetailInclude,
    });
  }

  async refundDeliveredOrder(
    user: AuthUser,
    orderId: string,
    returnRequestId?: string,
  ) {
    if (user.role !== UserRole.ADMIN)
      throw new ForbiddenException('Only administrators can issue refunds');
    const stripe = this.client();
    const claimed = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`order:${orderId}`}))`;
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { returnRequests: true, payments: true, items: true },
      });
      if (!order) throw new NotFoundException('Order not found');
      const eligible = order.returnRequests.filter(
        (r) =>
          r.status === ReturnStatus.APPROVED ||
          r.status === ReturnStatus.RECEIVED,
      );
      const request = returnRequestId
        ? order.returnRequests.find((r) => r.id === returnRequestId)
        : eligible.length === 1
          ? eligible[0]
          : undefined;
      if (
        !request ||
        (!eligible.some((r) => r.id === request.id) &&
          request.status !== ReturnStatus.REFUNDED)
      ) {
        throw new BadRequestException(
          'Specify an approved or received returnRequestId',
        );
      }
      if (request.status === ReturnStatus.REFUNDED)
        return { request, payment: null };
      const payment = order.payments.find(
        (p) =>
          p.purpose === PaymentPurpose.ORDER &&
          (p.status === PaymentStatus.SUCCEEDED ||
            p.status === PaymentStatus.PARTIALLY_REFUNDED) &&
          p.stripePaymentIntentId,
      );
      if (!payment?.stripePaymentIntentId)
        throw new BadRequestException(
          'A successful Stripe order payment was not found',
        );
      const failed =
        request.refundStatus === 'failed' ||
        request.refundStatus === 'canceled';
      if (request.refundAmount && !failed) return { request, payment };
      // Reserve the amount in the database before contacting Stripe. Other
      // returns cannot spend this balance while this refund is pending.
      const reserved = order.returnRequests
        .filter(
          (r) =>
            r.id !== request.id &&
            r.status !== ReturnStatus.REFUNDED &&
            r.refundStatus !== 'failed' &&
            r.refundStatus !== 'canceled',
        )
        .reduce((sum, r) => sum + Number(r.refundAmount ?? 0), 0);
      const remaining = Number(
        payment.amount.minus(payment.refundedAmount).minus(reserved).toFixed(2),
      );
      const amount = this.refundAmountForReturn(order, request, remaining);
      if (amount <= 0)
        throw new BadRequestException(
          'No remaining unreserved refundable amount',
        );
      const updated = await tx.returnRequest.update({
        where: { id: request.id },
        data: {
          refundAmount: amount,
          refundStatus: 'requested',
          stripeRefundId: null,
          refundAttempt: failed ? { increment: 1 } : undefined,
        },
      });
      return { request: updated, payment };
    });
    if (!claimed.payment) return claimed.request;
    const request = claimed.request;
    const refund = request.stripeRefundId
      ? await stripe.refunds.retrieve(request.stripeRefundId)
      : await stripe.refunds.create(
          {
            payment_intent: claimed.payment.stripePaymentIntentId!,
            amount: this.toMinorUnit(request.refundAmount),
            metadata: {
              paymentId: claimed.payment.id,
              orderId,
              returnRequestId: request.id,
              refundAttempt: String(request.refundAttempt),
            },
          },
          {
            idempotencyKey: `refund-${claimed.payment.id}-${request.id}-${request.refundAttempt}`,
          },
        );
    await this.reconcileRefund(refund, user.id);
    return this.prisma.returnRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
  }

  private async reconcileRefund(refund: Stripe.Refund, actorId?: string) {
    const requestId = refund.metadata?.returnRequestId;
    const paymentId = refund.metadata?.paymentId;
    // Refunds made outside this API have no return mapping. They require
    // operator reconciliation rather than guessing which return to complete.
    if (!requestId || !paymentId) return;
    const reference = await this.prisma.returnRequest.findUnique({
      where: { id: requestId },
    });
    if (!reference) throw new NotFoundException('Refund return not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`order:${reference.orderId}`}))`;
      const request = await tx.returnRequest.findUniqueOrThrow({
        where: { id: requestId },
      });
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      if (Number(refund.metadata?.refundAttempt ?? 0) !== request.refundAttempt)
        return;
      const intentId =
        typeof refund.payment_intent === 'string'
          ? refund.payment_intent
          : refund.payment_intent?.id;
      if (
        payment.purpose !== PaymentPurpose.ORDER ||
        payment.orderId !== request.orderId ||
        payment.stripePaymentIntentId !== intentId ||
        refund.currency !== payment.currency ||
        !request.refundAmount ||
        refund.amount !== this.toMinorUnit(request.refundAmount) ||
        (request.stripeRefundId && request.stripeRefundId !== refund.id)
      ) {
        throw new BadRequestException(
          'Stripe refund does not match the expected return',
        );
      }
      if (request.status === ReturnStatus.REFUNDED) {
        if (refund.status !== 'failed' && refund.status !== 'canceled') return;
        const refundedAmount = payment.refundedAmount.minus(
          request.refundAmount,
        );
        if (refundedAmount.lessThan(0))
          throw new BadRequestException('Refund accounting is inconsistent');
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            refundedAmount,
            status: refundedAmount.greaterThan(0)
              ? PaymentStatus.PARTIALLY_REFUNDED
              : PaymentStatus.SUCCEEDED,
          },
        });
        await tx.returnRequest.update({
          where: { id: request.id },
          data: {
            status: ReturnStatus.RECEIVED,
            refundStatus: refund.status,
            resolution: `Stripe refund ${refund.id}: ${refund.status}`,
          },
        });
        const changed = await tx.order.updateMany({
          where: { id: request.orderId, status: OrderStatus.REFUNDED },
          data: { status: OrderStatus.DELIVERED },
        });
        if (changed.count)
          await tx.orderStatusHistory.create({
            data: {
              orderId: request.orderId,
              status: OrderStatus.DELIVERED,
              note: `Stripe refund ${refund.id} ${refund.status}; return requires review`,
            },
          });
        return;
      }
      await tx.returnRequest.update({
        where: { id: request.id },
        data: {
          stripeRefundId: refund.id,
          refundStatus: refund.status,
          resolution: `Stripe refund ${refund.id}: ${refund.status ?? 'pending'}`,
        },
      });
      if (refund.status !== 'succeeded') return;
      const refundedAmount = payment.refundedAmount.plus(request.refundAmount);
      if (refundedAmount.greaterThan(payment.amount))
        throw new BadRequestException('Refund exceeds the payment amount');
      const fullyRefunded = refundedAmount.equals(payment.amount);
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          refundedAmount,
          stripeRefundId: refund.id,
          status: fullyRefunded
            ? PaymentStatus.REFUNDED
            : PaymentStatus.PARTIALLY_REFUNDED,
        },
      });
      await tx.returnRequest.update({
        where: { id: request.id },
        data: { status: ReturnStatus.REFUNDED },
      });
      if (fullyRefunded) {
        await tx.order.update({
          where: { id: request.orderId },
          data: { status: OrderStatus.REFUNDED },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: request.orderId,
            status: OrderStatus.REFUNDED,
            actorId,
            note: `Stripe refund ${refund.id}`,
          },
        });
      }
      await tx.notification.create({
        data: {
          userId: payment.userId,
          title: fullyRefunded
            ? 'Order refund issued'
            : 'Partial order refund issued',
          body: `A refund of ${Number(request.refundAmount).toFixed(2)} ${payment.currency.toUpperCase()} has been issued.`,
          data: {
            orderId: request.orderId,
            paymentId: payment.id,
            refundId: refund.id,
          },
        },
      });
    });
    this.notifications.notifyUser(
      (
        await this.prisma.payment.findUniqueOrThrow({
          where: { id: paymentId },
        })
      ).userId,
    );
  }

  async paymentForUser(user: AuthUser, id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { order: true, quotation: { include: { request: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (user.role !== UserRole.ADMIN && payment.userId !== user.id)
      throw new ForbiddenException();
    const reconciled = await this.reconcileOpenCheckoutPayment(payment);
    return reconciled ?? payment;
  }

  /**
   * Order list/detail must not wait on the webhook. If Checkout already
   * collected payment, mark the order paid before returning it.
   */
  async syncPendingOrderPayment(orderId: string): Promise<boolean> {
    const payment = await this.prisma.payment.findFirst({
      where: {
        orderId,
        purpose: PaymentPurpose.ORDER,
        status: {
          in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING],
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!payment) return false;
    const reconciled = await this.reconcileOpenCheckoutPayment(payment);
    return Boolean(reconciled);
  }

  /**
   * Success-page polling must not depend on the webhook arriving first.
   * If Checkout already finished, apply the same completion path here.
   */
  private async reconcileOpenCheckoutPayment(payment: {
    id: string;
    purpose: PaymentPurpose;
    status: PaymentStatus;
    stripeCheckoutSessionId: string | null;
  }) {
    const awaitingConfirmation =
      payment.status === PaymentStatus.PENDING ||
      payment.status === PaymentStatus.PROCESSING;
    if (!awaitingConfirmation || !payment.stripeCheckoutSessionId) return null;

    try {
      const session = await this.client().checkout.sessions.retrieve(
        payment.stripeCheckoutSessionId,
        { expand: ['payment_intent'] },
      );

      if (payment.purpose === PaymentPurpose.QUOTATION) {
        if (session.status !== 'complete') return null;
        await this.attachServiceCheckoutSession(session);
      } else if (payment.purpose === PaymentPurpose.ORDER) {
        if (session.payment_status !== 'paid') return null;
        await this.completeOrderPayment(session);
      } else {
        return null;
      }

      return this.prisma.payment.findUnique({
        where: { id: payment.id },
        include: { order: true, quotation: { include: { request: true } } },
      });
    } catch {
      return null;
    }
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
      event.type === 'refund.created' ||
      event.type === 'refund.updated' ||
      event.type === 'refund.failed'
    ) {
      const refund = await this.client().refunds.retrieve(event.data.object.id);
      await this.reconcileRefund(refund);
      return;
    }

    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const session = event.data.object;
      if (
        session.metadata?.purpose !== PaymentPurpose.ORDER &&
        session.metadata?.purpose !== PaymentPurpose.QUOTATION
      )
        return;

      if (session.metadata?.purpose === PaymentPurpose.QUOTATION) {
        await this.attachServiceCheckoutSession(session);
        return;
      }
      if (session.payment_status === 'paid')
        await this.completeOrderPayment(session);
      return;
    }
    if (
      event.type === 'checkout.session.expired' ||
      event.type === 'checkout.session.async_payment_failed'
    ) {
      const session = event.data.object;
      if (
        session.metadata?.purpose !== PaymentPurpose.ORDER &&
        session.metadata?.purpose !== PaymentPurpose.QUOTATION
      )
        return;

      const payment = await this.prisma.payment.findFirst({
        where: {
          OR: [
            { stripeCheckoutSessionId: session.id },
            ...(session.metadata?.paymentId
              ? [
                  {
                    id: session.metadata.paymentId,
                    stripeCheckoutSessionId: null,
                  },
                ]
              : []),
          ],
        },
      });
      if (!payment) return;
      const status = event.type.endsWith('expired')
        ? PaymentStatus.EXPIRED
        : PaymentStatus.FAILED;
      if (payment.orderId) {
        if (
          session.metadata?.paymentId !== payment.id ||
          session.metadata?.orderId !== payment.orderId
        ) {
          throw new BadRequestException(
            'Stripe session does not match the order',
          );
        }
        await this.releaseOrderInventory(payment.orderId, status, event.type);
      } else {
        await this.prisma.payment.updateMany({
          where: {
            id: payment.id,
            purpose: PaymentPurpose.QUOTATION,
            status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
            stripeCheckoutSessionId: payment.stripeCheckoutSessionId,
          },
          data: { status, stripeCheckoutSessionId: session.id },
        });
      }
      return;
    }
    if (event.type === 'payment_intent.amount_capturable_updated') {
      if (event.data.object.metadata.purpose !== PaymentPurpose.QUOTATION)
        return;
      const intent = await this.client().paymentIntents.retrieve(
        event.data.object.id,
      );
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
        where: {
          stripePaymentIntentId: intent.id,
          status: {
            in: [
              PaymentStatus.PENDING,
              PaymentStatus.PROCESSING,
              PaymentStatus.AUTHORIZED,
            ],
          },
        },
        data: {
          ...(event.type === 'payment_intent.canceled'
            ? { status: PaymentStatus.CANCELED }
            : {}),
          failureCode: intent.last_payment_error?.code ?? undefined,
          failureMessage: intent.last_payment_error?.message ?? undefined,
        },
      });
    }
  }

  private async completeOrderPayment(session: Stripe.Checkout.Session) {
    if (session.payment_status !== 'paid') return;
    await this.prisma.$transaction(async (tx) => {
      const reference = await tx.payment.findFirst({
        where: {
          OR: [
            { stripeCheckoutSessionId: session.id },
            ...(session.metadata?.paymentId
              ? [
                  {
                    id: session.metadata.paymentId,
                    stripeCheckoutSessionId: null,
                  },
                ]
              : []),
          ],
        },
      });
      if (!reference?.orderId)
        throw new NotFoundException('Order payment not found');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`order:${reference.orderId}`}))`;
      const payment = await tx.payment.findUnique({
        where: { id: reference.id },
        include: { order: { include: { items: true } } },
      });
      if (!payment?.orderId || payment.purpose !== PaymentPurpose.ORDER)
        throw new NotFoundException('Order payment not found');
      if (
        [
          PaymentStatus.SUCCEEDED,
          PaymentStatus.PARTIALLY_REFUNDED,
          PaymentStatus.REFUNDED,
        ].includes(
          payment.status as 'SUCCEEDED' | 'PARTIALLY_REFUNDED' | 'REFUNDED',
        )
      )
        return;
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
          stripeCheckoutSessionId: session.id,
          status: PaymentStatus.SUCCEEDED,
          failureCode: null,
          failureMessage: null,
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
      this.notifications.notifyUser(payment.userId);
      await this.notifications.fanOutToActiveAdmins(
        {
          title: 'Order paid',
          body: `Order ${payment.order?.orderNumber ?? payment.orderId} was paid.`,
          data: { orderId: payment.orderId, paymentId: payment.id },
        },
        tx,
      );
      if (payment.order?.items.length) {
        await this.removePurchasedItemsFromCart(
          tx,
          payment.userId,
          payment.order.items,
        );
      }
    });
  }

  private async removePurchasedItemsFromCart(
    tx: Pick<Prisma.TransactionClient, 'cart' | 'cartItem'>,
    userId: string,
    items: { productId: string; quantity: number }[],
  ) {
    const cart = await tx.cart.findUnique({ where: { customerId: userId } });
    if (!cart) return;
    for (const item of items) {
      const cartItem = await tx.cartItem.findUnique({
        where: {
          cartId_productId: { cartId: cart.id, productId: item.productId },
        },
      });
      if (!cartItem) continue;
      if (cartItem.quantity <= item.quantity) {
        await tx.cartItem.delete({ where: { id: cartItem.id } });
      } else {
        await tx.cartItem.update({
          where: { id: cartItem.id },
          data: { quantity: cartItem.quantity - item.quantity },
        });
      }
    }
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
      await this.prisma.payment.updateMany({
        where: {
          id: paymentId,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
        },
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
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`order:${orderId}`}))`;
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true, payments: true },
      });
      if (
        !order ||
        order.inventoryReleasedAt ||
        order.status !== OrderStatus.PAYMENT_PENDING
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
    if (intent.status !== 'requires_capture') return;
    const paymentId = intent.metadata.paymentId;
    if (!paymentId)
      throw new BadRequestException(
        'Stripe PaymentIntent has no payment reference',
      );
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
      });
      if (
        !payment ||
        payment.purpose !== PaymentPurpose.QUOTATION ||
        (payment.stripePaymentIntentId != null &&
          payment.stripePaymentIntentId !== intent.id) ||
        intent.currency !== payment.currency ||
        intent.amount !== this.toMinorUnit(payment.amount)
      ) {
        throw new BadRequestException(
          'Stripe authorization does not match the expected quote',
        );
      }
      const authorized = await tx.payment.updateMany({
        where: {
          id: payment.id,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
        },
        data: {
          status: PaymentStatus.AUTHORIZED,
          failureCode: null,
          failureMessage: null,
          authorizedAt: new Date(),
          stripePaymentIntentId: intent.id,
        },
      });
      if (authorized.count === 1) {
        await this.notifications.fanOutToActiveAdmins(
          {
            title: 'Service payment authorized',
            body: 'A customer payment authorization is ready for scheduling.',
            data: {
              paymentId: payment.id,
              quoteId: payment.quotationId,
              requestId: intent.metadata.requestId,
            },
          },
          tx,
        );
      }
    });
  }

  private async completeServicePaymentIntent(intent: Stripe.PaymentIntent) {
    if (intent.status !== 'succeeded') return;
    const paymentId = intent.metadata.paymentId;
    if (!paymentId) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payment:${paymentId}`}))`;
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
      this.notifications.notifyUser(payment.userId);
    });
  }

  private async attachServiceCheckoutSession(session: Stripe.Checkout.Session) {
    const paymentId = session.metadata?.paymentId;
    if (!paymentId) return;
    const paymentIntentId = this.checkoutPaymentIntentId(session);
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (
      !payment ||
      payment.purpose !== PaymentPurpose.QUOTATION ||
      session.metadata?.quotationId !== payment.quotationId ||
      session.currency !== payment.currency ||
      session.amount_total !== this.toMinorUnit(payment.amount) ||
      (payment.stripeCheckoutSessionId &&
        payment.stripeCheckoutSessionId !== session.id) ||
      (payment.stripePaymentIntentId &&
        payment.stripePaymentIntentId !== paymentIntentId)
    ) {
      throw new BadRequestException(
        'Stripe Checkout does not match the expected quotation',
      );
    }
    await this.prisma.payment.updateMany({
      where: { id: paymentId, purpose: PaymentPurpose.QUOTATION },
      data: {
        stripeCheckoutSessionId: session.id,
        ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
      },
    });
    if (!paymentIntentId) return;
    const intent = await this.client().paymentIntents.retrieve(paymentIntentId);
    if (intent.status === 'requires_capture') {
      await this.authorizeServicePaymentIntent(intent);
    }
  }

  private checkoutPaymentIntentId(session: Stripe.Checkout.Session) {
    const value = session.payment_intent;
    if (!value) return undefined;
    return typeof value === 'string' ? value : value.id;
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

  private refundAmountForReturn(
    order: {
      subtotal: unknown;
      tax: unknown;
      items: {
        id: string;
        quantity: number;
        unitPrice: unknown;
        taxAmount?: unknown;
      }[];
    },
    returnRequest: { orderItemId: string | null },
    remaining: number,
  ) {
    if (!returnRequest.orderItemId) {
      return remaining;
    }
    const item = order.items.find(
      (candidate) => candidate.id === returnRequest.orderItemId,
    );
    if (!item) {
      throw new BadRequestException(
        'The return item is no longer on this order',
      );
    }
    const subtotal = Number(order.subtotal);
    const itemSubtotal = Number(item.unitPrice) * item.quantity;
    const proportionalTax =
      subtotal > 0 ? (itemSubtotal / subtotal) * Number(order.tax) : 0;
    return Math.min(
      remaining,
      Number(
        (itemSubtotal + Number(item.taxAmount ?? proportionalTax)).toFixed(2),
      ),
    );
  }

  private toMinorUnit(amount: unknown): number {
    const result = Math.round(Number(amount) * 100);
    if (!Number.isSafeInteger(result) || result < 0)
      throw new BadRequestException('Payment amount is invalid');
    return result;
  }
  private eventObjectId(event: Stripe.Event): string | undefined {
    const object = event.data.object;
    return 'id' in object && typeof object.id === 'string'
      ? object.id
      : undefined;
  }
  private isDefiniteProviderRejection(error: unknown): boolean {
    return (
      error instanceof Stripe.errors.StripeInvalidRequestError &&
      error.statusCode === 400
    );
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
