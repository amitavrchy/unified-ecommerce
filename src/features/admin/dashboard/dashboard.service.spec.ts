import { BadRequestException } from '@nestjs/common';
import {
  OrderStatus,
  PaymentStatus,
  RequestStatus,
} from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../database/prisma.service';
import { AdminDashboardService } from './dashboard.service';

describe('AdminDashboardService', () => {
  const prisma = {
    serviceRequest: {
      count: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    quotation: { count: jest.fn() },
    payment: { count: jest.fn(), findMany: jest.fn() },
    order: { count: jest.fn(), findMany: jest.fn() },
    user: { count: jest.fn(), findMany: jest.fn() },
    serviceIssue: { findMany: jest.fn() },
  };
  let service: AdminDashboardService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminDashboardService(prisma as unknown as PrismaService);
  });

  it('builds dashboard summary metrics with technician visit and report counts', async () => {
    prisma.serviceRequest.count
      .mockResolvedValueOnce(24)
      .mockResolvedValueOnce(11)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2);
    prisma.quotation.count.mockResolvedValue(8);
    prisma.payment.findMany.mockResolvedValue([
      {
        amount: 9000,
        refundedAmount: 580,
        currency: 'cad',
        capturedAt: new Date('2026-08-10T12:00:00.000Z'),
        paidAt: new Date('2026-08-10T12:00:00.000Z'),
      },
    ]);
    prisma.order.count.mockResolvedValue(16);
    prisma.payment.count.mockResolvedValue(3);
    prisma.user.count.mockResolvedValue(12);
    prisma.user.findMany.mockResolvedValue([{ id: 'tech-1' }, { id: 'tech-2' }]);
    prisma.serviceRequest.findMany.mockResolvedValue([{ technicianId: 'tech-1' }]);

    await expect(
      service.summary({
        date: '2026-08-20',
        timezone: 'America/Toronto',
      }),
    ).resolves.toEqual({
      newServiceRequests: 24,
      quotationsAwaitingResponse: 8,
      servicesScheduledToday: 11,
      servicesInProgress: 4,
      reportsAwaitingReview: 2,
      monthlyServiceRevenue: 8420,
      ordersAwaitingShipment: 16,
      paymentIssues: 3,
      totalTechnicians: 12,
      techniciansOnAssignmentToday: 1,
      techniciansFreeToday: 1,
      date: '2026-08-20',
      timezone: 'America/Toronto',
      periodStart: '2026-08-20T04:00:00.000Z',
      periodEnd: '2026-08-21T04:00:00.000Z',
    });
  });

  it('returns recent requests without exposing Prisma user objects', async () => {
    prisma.serviceRequest.findMany.mockResolvedValue([
      {
        id: 'request-1',
        requestNumber: 'SR-1048',
        status: RequestStatus.NEW,
        createdAt: new Date('2026-08-20T12:15:00.000Z'),
        customer: { firstName: 'Sarah', lastName: 'Johnson' },
        category: { name: 'Central vacuum repair' },
        issue: { name: 'Low suction' },
      },
    ]);

    await expect(service.recentServiceRequests({ limit: 3 })).resolves.toEqual([
      {
        id: 'request-1',
        requestNumber: 'SR-1048',
        customerName: 'Sarah Johnson',
        serviceName: 'Central vacuum repair',
        issueName: 'Low suction',
        status: RequestStatus.NEW,
        createdAt: new Date('2026-08-20T12:15:00.000Z'),
      },
    ]);
  });

  it('returns the daily schedule with assigned technician details', async () => {
    prisma.serviceRequest.findMany.mockResolvedValue([
      {
        id: 'request-1',
        requestNumber: 'SR-1048',
        status: RequestStatus.SCHEDULED,
        scheduledStart: new Date('2026-08-20T13:00:00.000Z'),
        scheduledEnd: new Date('2026-08-20T15:00:00.000Z'),
        customer: { firstName: 'Sarah', lastName: 'Thompson' },
        technician: { firstName: 'Marc', lastName: 'Anderson' },
        category: { name: 'Central vacuum repair' },
      },
    ]);

    const result = await service.schedule({
      date: '2026-08-20',
      timezone: 'UTC',
    });

    expect(result[0]).toMatchObject({
      customerName: 'Sarah Thompson',
      technicianName: 'Marc Anderson',
      serviceName: 'Central vacuum repair',
    });
  });

  it('fills missing revenue months and subtracts refunds', async () => {
    prisma.payment.findMany.mockResolvedValue([
      {
        amount: 100,
        refundedAmount: 20,
        currency: 'cad',
        capturedAt: new Date('2026-01-15T12:00:00.000Z'),
        paidAt: null,
      },
      {
        amount: 50,
        refundedAmount: 0,
        currency: 'cad',
        capturedAt: new Date('2026-03-15T12:00:00.000Z'),
        paidAt: null,
      },
    ]);

    await expect(
      service.revenue({
        from: '2026-01-01',
        to: '2026-03-31',
        timezone: 'UTC',
      }),
    ).resolves.toEqual({
      from: '2026-01-01',
      to: '2026-03-31',
      timezone: 'UTC',
      currency: 'cad',
      total: 130,
      items: [
        { period: '2026-01', revenue: 80 },
        { period: '2026-02', revenue: 0 },
        { period: '2026-03', revenue: 50 },
      ],
    });
  });

  it('returns top service issues with the remainder grouped as Others', async () => {
    prisma.serviceRequest.groupBy.mockResolvedValue([
      { issueId: 'issue-a', _count: { _all: 28 } },
      { issueId: 'issue-b', _count: { _all: 21 } },
      { issueId: 'issue-c', _count: { _all: 17 } },
      { issueId: null, _count: { _all: 34 } },
    ]);
    prisma.serviceIssue.findMany.mockResolvedValue([
      { id: 'issue-a', name: 'Low suction' },
      { id: 'issue-b', name: 'Blockage removal' },
    ]);

    const result = await service.serviceDistribution({
      from: '2026-01-01',
      to: '2026-12-31',
      timezone: 'UTC',
      limit: 2,
    });

    expect(result.total).toBe(100);
    expect(result.items).toEqual([
      {
        issueId: 'issue-a',
        name: 'Low suction',
        count: 28,
        percentage: 28,
      },
      {
        issueId: 'issue-b',
        name: 'Blockage removal',
        count: 21,
        percentage: 21,
      },
      { issueId: null, name: 'Others', count: 51, percentage: 51 },
    ]);
  });

  it('returns recent orders with payment status kept separate', async () => {
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'order-1',
        orderNumber: 'CC-3084',
        total: 349,
        status: OrderStatus.SHIPPED,
        createdAt: new Date('2026-08-20T12:00:00.000Z'),
        customer: { firstName: 'Sarah', lastName: 'Johnson' },
        payments: [{ status: PaymentStatus.SUCCEEDED, currency: 'cad' }],
      },
    ]);

    await expect(service.recentOrders({ limit: 3 })).resolves.toEqual([
      {
        id: 'order-1',
        orderNumber: 'CC-3084',
        customerName: 'Sarah Johnson',
        amount: 349,
        currency: 'cad',
        status: OrderStatus.SHIPPED,
        paymentStatus: PaymentStatus.SUCCEEDED,
        createdAt: new Date('2026-08-20T12:00:00.000Z'),
      },
    ]);
  });

  it('rejects invalid timezones and reversed date ranges', async () => {
    await expect(
      service.summary({ timezone: 'not-a-timezone' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.revenue({ from: '2026-08-21', to: '2026-08-20' }),
    ).rejects.toThrow('from must be on or before to');
  });
});
