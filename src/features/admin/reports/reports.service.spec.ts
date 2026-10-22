import { Prisma } from '../../../../generated/prisma/client';
import {
  OrderStatus,
  PaymentPurpose,
  PaymentStatus,
  QuoteStatus,
  RequestStatus,
} from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../database/prisma.service';
import { AdminReportsService } from './reports.service';

describe('AdminReportsService', () => {
  const prisma = {
    payment: { findMany: jest.fn() },
    serviceRequest: { findMany: jest.fn() },
    order: { findMany: jest.fn() },
    user: { count: jest.fn() },
    notification: { findMany: jest.fn(), count: jest.fn() },
    businessSettings: { upsert: jest.fn() },
    $transaction: jest.fn((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    ),
  };
  let service: AdminReportsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminReportsService(prisma as unknown as PrismaService);
  });

  it('normalizes Decimal revenue, services, orders, and utilization', async () => {
    prisma.payment.findMany.mockResolvedValue([
      {
        amount: new Prisma.Decimal('125.55'),
        refundedAmount: new Prisma.Decimal('5.55'),
        status: PaymentStatus.CAPTURED,
        purpose: PaymentPurpose.QUOTATION,
        currency: 'cad',
        createdAt: new Date('2026-08-02T12:00:00Z'),
        paidAt: null,
        capturedAt: new Date('2026-08-03T12:00:00Z'),
        order: null,
        quotation: {},
      },
    ]);
    prisma.serviceRequest.findMany.mockResolvedValue([
      {
        status: RequestStatus.COMPLETED,
        createdAt: new Date('2026-08-01T12:00:00Z'),
        scheduledStart: new Date('2026-08-03T09:00:00Z'),
        scheduledEnd: new Date('2026-08-03T13:00:00Z'),
        category: { name: 'Repair' },
        quotation: { status: QuoteStatus.ACCEPTED },
      },
    ]);
    prisma.order.findMany.mockResolvedValue([
      {
        status: OrderStatus.DELIVERED,
        createdAt: new Date('2026-08-04T12:00:00Z'),
      },
    ]);
    prisma.user.count.mockResolvedValue(1);

    const result = await service.overview({
      from: '2026-08-01',
      to: '2026-08-31',
      timezone: 'UTC',
    });

    expect(result.revenueSeries).toEqual([{ period: '2026-08', value: 120 }]);
    expect(result.averageQuoteAcceptance).toBe(100);
    expect(result.averageServiceValue).toBe(120);
    expect(result.services).toEqual(
      expect.objectContaining({
        requests: 1,
        completed: 1,
        serviceRevenue: 120,
      }),
    );
    expect(result.monthlyOrders[0].value).toBe(1);
    expect(result.technicianUtilization).toBeGreaterThan(0);
    expect(result.trends.serviceRevenue.current).toBe(120);
    expect(result.paymentActivity).toEqual({
      status: null,
      count: 0,
      amount: 0,
    });
  });

  it('never counts unsettled payments as revenue when filtering by status', async () => {
    const failed = {
      amount: new Prisma.Decimal('500'),
      refundedAmount: new Prisma.Decimal('0'),
      status: PaymentStatus.FAILED,
      purpose: PaymentPurpose.ORDER,
      currency: 'cad',
      createdAt: new Date('2026-08-02T12:00:00Z'),
    };
    prisma.payment.findMany.mockImplementation(
      (args: { where?: { status?: unknown } }) => {
        if (args.where?.status === PaymentStatus.FAILED) {
          return Promise.resolve([failed]);
        }
        return Promise.resolve([]);
      },
    );
    prisma.serviceRequest.findMany.mockResolvedValue([]);
    prisma.order.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(1);

    const result = await service.overview({
      from: '2026-08-01',
      to: '2026-08-31',
      timezone: 'UTC',
      paymentStatus: PaymentStatus.FAILED,
    });

    expect(result.revenueSeries[0].value).toBe(0);
    expect(result.paymentActivity).toEqual({
      status: PaymentStatus.FAILED,
      count: 1,
      amount: 500,
    });
  });

  it('uses the overview dataset as the source for CSV and PDF exports', async () => {
    const overview = {
      filters: {
        from: '2026-08-01',
        to: '2026-08-31',
        timezone: 'UTC',
        technicianId: null,
        categoryId: null,
        paymentStatus: null,
      },
      currency: 'cad',
      revenueSeries: [{ period: '2026-08', value: 42 }],
      serviceDistribution: [{ name: 'Repair', count: 1, percentage: 100 }],
      monthlyOrders: [{ period: '2026-08', value: 2 }],
      averageQuoteAcceptance: 50,
      averageServiceValue: 42,
      technicianUtilization: 25,
      paymentActivity: {
        status: null,
        count: 0,
        amount: 0,
      },
      store: {
        orders: 2,
        grossRevenue: 50,
        refunds: 8,
        netRevenue: 42,
        averageOrderValue: 21,
      },
      services: {
        requests: 1,
        completed: 1,
        acceptedQuotes: 1,
        serviceRevenue: 42,
        averageServiceValue: 42,
      },
      trends: {
        averageQuoteAcceptance: {
          current: 50,
          previous: 40,
          delta: 10,
          deltaPercent: 25,
        },
        averageServiceValue: {
          current: 42,
          previous: 40,
          delta: 2,
          deltaPercent: 5,
        },
        technicianUtilization: {
          current: 25,
          previous: 20,
          delta: 5,
          deltaPercent: 25,
        },
        storeNetRevenue: {
          current: 42,
          previous: 30,
          delta: 12,
          deltaPercent: 40,
        },
        serviceRevenue: {
          current: 42,
          previous: 30,
          delta: 12,
          deltaPercent: 40,
        },
      },
    };
    const overviewSpy = jest
      .spyOn(service, 'overview')
      .mockResolvedValue(overview);
    const query = { from: '2026-08-01', to: '2026-08-31' };

    await expect(service.csv(query)).resolves.toContain('"2026-08","42"');
    const pdf = await service.pdf(query);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(overviewSpy).toHaveBeenCalledTimes(2);
    expect(overviewSpy).toHaveBeenNthCalledWith(1, query);
    expect(overviewSpy).toHaveBeenNthCalledWith(2, query);
  });
});
