/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Prisma } from '../../../generated/prisma/client';
import {
  PaymentPurpose,
  PaymentStatus,
  QuoteStatus,
  ReturnStatus,
  UserRole,
} from '../../../generated/prisma/enums';
import type { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StripeService } from './stripe.service';

describe('StripeService service authorization totals', () => {
  const customer: AuthUser = {
    id: 'customer-1',
    email: 'customer@example.com',
    role: UserRole.CUSTOMER,
  };
  const payment = {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };
  const transactionClient = { payment, $executeRaw: jest.fn() };
  const prisma = {
    $transaction: jest.fn(
      (callback: (client: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
    ),
    serviceRequest: { findFirst: jest.fn() },
    payment,
    order: { findUnique: jest.fn() },
    returnRequest: {
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };
  const notifications = {
    fanOutToActiveAdmins: jest.fn(),
    notifyUser: jest.fn(),
  };
  const sessions = {
    create: jest.fn(),
    retrieve: jest.fn(),
  };
  let service: StripeService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FRONTEND_PAYMENT_SUCCESS_URL =
      'https://arye-sd.vercel.app/payment/success';
    process.env.FRONTEND_PAYMENT_CANCEL_URL =
      'https://arye-sd.vercel.app/payment/failed';
    service = new StripeService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
    jest
      .spyOn(service as unknown as { client: () => unknown }, 'client')
      .mockReturnValue({ checkout: { sessions } });
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.payment.create.mockResolvedValue({
      id: 'payment-1',
      idempotencyKey: 'key-1',
    });
    prisma.payment.update.mockResolvedValue({
      id: 'payment-1',
      amount: 175,
      currency: 'cad',
    });
    sessions.create.mockResolvedValue({
      id: 'cs-1',
      url: 'https://checkout.stripe.com/c/pay/cs-1',
      payment_intent: 'pi-1',
    });
  });

  it('authorizes negotiatedTotal after customer quote acceptance', async () => {
    prisma.serviceRequest.findFirst.mockResolvedValue({
      quotation: {
        id: 'quote-1',
        quoteNumber: 'QT-1',
        status: QuoteStatus.ACCEPTED,
        validUntil: new Date('2099-01-01T00:00:00.000Z'),
        negotiatedTotal: 175,
        totalAmount: 192.1,
      },
    });

    await service.createServiceAuthorization(customer, 'request-1');

    expect(prisma.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: 175 }),
    });
    expect(sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        payment_intent_data: expect.objectContaining({
          capture_method: 'manual',
        }),
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({ unit_amount: 17500 }),
          }),
        ],
      }),
      expect.any(Object),
    );
  });

  it('falls back to totalAmount when no negotiation was approved', async () => {
    prisma.serviceRequest.findFirst.mockResolvedValue({
      quotation: {
        id: 'quote-1',
        quoteNumber: 'QT-1',
        status: QuoteStatus.ACCEPTED,
        validUntil: new Date('2099-01-01T00:00:00.000Z'),
        negotiatedTotal: null,
        totalAmount: 192.1,
      },
    });

    await service.createServiceAuthorization(customer, 'request-1');

    expect(prisma.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: 192.1 }),
    });
    expect(sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({ unit_amount: 19210 }),
          }),
        ],
      }),
      expect.any(Object),
    );
  });

  it('retries an uncertain Stripe request with the same claimed payment key', async () => {
    prisma.serviceRequest.findFirst.mockResolvedValue({
      quotation: {
        id: 'quote-1',
        quoteNumber: 'QT-1',
        status: QuoteStatus.ACCEPTED,
        validUntil: new Date('2099-01-01'),
        totalAmount: 175,
      },
    });
    const claimed = {
      id: 'payment-1',
      idempotencyKey: 'stable-key',
      status: PaymentStatus.PROCESSING,
      amount: 175,
      currency: 'cad',
    };
    prisma.payment.create.mockResolvedValue(claimed);
    sessions.create.mockRejectedValueOnce(new Error('network timeout'));
    await expect(
      service.createServiceAuthorization(customer, 'request-1'),
    ).rejects.toThrow('network timeout');
    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'payment-1', stripeCheckoutSessionId: null },
      data: {
        failureMessage: 'Stripe authorization creation is pending a safe retry',
      },
    });
    prisma.payment.findFirst.mockResolvedValue(claimed);
    await service.createServiceAuthorization(customer, 'request-1');
    expect(prisma.payment.create).toHaveBeenCalledTimes(1);
    expect(transactionClient.$executeRaw).toHaveBeenCalledTimes(2);
    for (const attempt of [1, 2]) {
      expect(sessions.create).toHaveBeenNthCalledWith(
        attempt,
        expect.any(Object),
        { idempotencyKey: 'stable-key' },
      );
    }
  });

  it('does not create another authorization while a completed checkout is being confirmed', async () => {
    prisma.serviceRequest.findFirst.mockResolvedValue({
      quotation: {
        id: 'quote-1',
        status: QuoteStatus.ACCEPTED,
        validUntil: new Date('2099-01-01'),
        totalAmount: 175,
      },
    });
    prisma.payment.findFirst.mockResolvedValue({
      id: 'payment-1',
      idempotencyKey: 'stable-key',
      stripeCheckoutSessionId: 'cs-complete',
      status: PaymentStatus.PROCESSING,
    });
    sessions.retrieve.mockResolvedValue({
      id: 'cs-complete',
      status: 'complete',
    });
    await expect(
      service.createServiceAuthorization(customer, 'request-1'),
    ).rejects.toThrow('Authorization is being confirmed');
    expect(sessions.create).not.toHaveBeenCalled();
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('reconciles a completed service checkout when the webhook is late', async () => {
    const paymentIntents = {
      retrieve: jest.fn().mockResolvedValue({
        id: 'pi-1',
        status: 'requires_capture',
        amount: 18000,
        currency: 'cad',
        metadata: { paymentId: 'payment-1', requestId: 'request-1' },
      }),
    };
    jest
      .spyOn(service as unknown as { client: () => unknown }, 'client')
      .mockReturnValue({
        checkout: { sessions },
        paymentIntents,
      });
    sessions.retrieve.mockResolvedValue({
      id: 'cs_test_1',
      status: 'complete',
      payment_intent: 'pi-1',
      metadata: { paymentId: 'payment-1', purpose: PaymentPurpose.QUOTATION },
    });
    prisma.payment.findUnique
      .mockResolvedValueOnce({
        id: 'payment-1',
        userId: 'customer-1',
        purpose: PaymentPurpose.QUOTATION,
        status: PaymentStatus.PROCESSING,
        stripeCheckoutSessionId: 'cs_test_1',
        stripePaymentIntentId: null,
        currency: 'cad',
        amount: 180,
        quotationId: 'quote-1',
        order: null,
        quotation: { request: { id: 'request-1' } },
      })
      .mockResolvedValueOnce({
        id: 'payment-1',
        purpose: PaymentPurpose.QUOTATION,
        stripePaymentIntentId: 'pi-1',
        currency: 'cad',
        amount: 180,
        quotationId: 'quote-1',
      })
      .mockResolvedValueOnce({
        id: 'payment-1',
        userId: 'customer-1',
        purpose: PaymentPurpose.QUOTATION,
        status: PaymentStatus.AUTHORIZED,
        stripeCheckoutSessionId: 'cs_test_1',
        stripePaymentIntentId: 'pi-1',
        amount: 180,
        currency: 'cad',
        order: null,
        quotation: { request: { id: 'request-1' } },
      });
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.paymentForUser(customer, 'payment-1');

    expect(sessions.retrieve).toHaveBeenCalledWith(
      'cs_test_1',
      expect.objectContaining({ expand: ['payment_intent'] }),
    );
    expect(paymentIntents.retrieve).toHaveBeenCalledWith('pi-1');
    expect(result).toEqual(
      expect.objectContaining({ status: PaymentStatus.AUTHORIZED }),
    );
  });

  it('atomically persists authorization and its admin notification', async () => {
    prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      purpose: PaymentPurpose.QUOTATION,
      stripePaymentIntentId: 'pi-1',
      currency: 'cad',
      amount: 175,
      quotationId: 'quote-1',
    });
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });

    await (
      service as unknown as {
        authorizeServicePaymentIntent(intent: {
          id: string;
          amount: number;
          currency: string;
          metadata: { paymentId: string; requestId: string };
        }): Promise<void>;
      }
    ).authorizeServicePaymentIntent({
      id: 'pi-1',
      amount: 17500,
      currency: 'cad',
      metadata: { paymentId: 'payment-1', requestId: 'request-1' },
    });

    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PaymentStatus.AUTHORIZED }),
      }),
    );
    expect(notifications.fanOutToActiveAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paymentId: 'payment-1' }),
      }),
      transactionClient,
    );
  });

  it('refunds only the item share for an item-scoped return', async () => {
    const admin: AuthUser = {
      id: 'admin-1',
      email: 'admin@example.com',
      role: UserRole.ADMIN,
    };
    const refunds = { create: jest.fn() };
    jest
      .spyOn(service as unknown as { client: () => unknown }, 'client')
      .mockReturnValue({ refunds });
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      customerId: 'customer-1',
      orderNumber: 'CC-1',
      subtotal: 100,
      tax: 13,
      items: [{ id: 'item-1', quantity: 1, unitPrice: 40 }],
      returnRequests: [
        {
          id: 'return-1',
          status: ReturnStatus.APPROVED,
          orderItemId: 'item-1',
        },
      ],
      payments: [
        {
          id: 'payment-1',
          purpose: PaymentPurpose.ORDER,
          status: PaymentStatus.SUCCEEDED,
          stripePaymentIntentId: 'pi-1',
          amount: new Prisma.Decimal('113'),
          refundedAmount: new Prisma.Decimal('0'),
          currency: 'cad',
        },
      ],
    });
    refunds.create.mockResolvedValue({
      id: 're-1',
      status: 'succeeded',
      amount: 4520,
    });
    prisma.returnRequest.findUniqueOrThrow.mockResolvedValue({
      id: 'return-1',
    });
    const tx = {
      payment: { update: jest.fn() },
      returnRequest: { update: jest.fn() },
      order: { update: jest.fn() },
      orderStatusHistory: { create: jest.fn() },
      notification: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementationOnce(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    await service.refundDeliveredOrder(admin, 'order-1', 'return-1');

    expect(refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 4520 }),
      expect.objectContaining({
        idempotencyKey: 'refund-payment-1-return-1',
      }),
    );
    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PaymentStatus.PARTIALLY_REFUNDED,
          refundedAmount: 45.2,
        }),
      }),
    );
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('syncs a pending shop order when Checkout already collected payment', async () => {
    prisma.payment.findFirst.mockResolvedValue({
      id: 'payment-1',
      purpose: PaymentPurpose.ORDER,
      status: PaymentStatus.PROCESSING,
      stripeCheckoutSessionId: 'cs_test_1',
    });
    sessions.retrieve.mockResolvedValue({
      id: 'cs_test_1',
      payment_status: 'paid',
    });
    const completeOrderPayment = jest
      .spyOn(
        service as unknown as {
          completeOrderPayment: (session: unknown) => Promise<void>;
        },
        'completeOrderPayment',
      )
      .mockResolvedValue(undefined);
    prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      status: PaymentStatus.SUCCEEDED,
    });

    await expect(service.syncPendingOrderPayment('order-1')).resolves.toBe(
      true,
    );

    expect(sessions.retrieve).toHaveBeenCalledWith(
      'cs_test_1',
      expect.objectContaining({ expand: ['payment_intent'] }),
    );
    expect(completeOrderPayment).toHaveBeenCalled();
  });
});
