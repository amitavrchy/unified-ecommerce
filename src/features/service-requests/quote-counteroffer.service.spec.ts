/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  QuoteCounterofferStatus,
  QuoteStatus,
  RequestStatus,
  UserRole,
} from '../../../generated/prisma/enums';
import type { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { QuoteCounterofferService } from './quote-counteroffer.service';

describe('QuoteCounterofferService', () => {
  const future = new Date('2099-01-01T00:00:00.000Z');
  const customer = {
    id: 'customer-1',
    email: 'customer@example.com',
    role: UserRole.CUSTOMER,
  } as AuthUser;
  const admin = {
    id: 'admin-1',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
  } as AuthUser;
  const technician = {
    id: 'technician-1',
    email: 'technician@example.com',
    role: UserRole.TECHNICIAN,
  } as AuthUser;
  const tx = {
    serviceRequest: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    serviceRequestStatusHistory: { create: jest.fn() },
    quotation: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
    quoteCounteroffer: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
    quoteCounterofferStatusHistory: { create: jest.fn() },
    notification: { create: jest.fn(), createMany: jest.fn() },
    user: { findMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
    serviceRequest: { findUnique: jest.fn() },
    quoteCounteroffer: { findMany: jest.fn() },
  };
  let service: QuoteCounterofferService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new QuoteCounterofferService(
      prisma as unknown as PrismaService,
      new NotificationsService(prisma as unknown as PrismaService),
    );
    tx.quotation.updateMany.mockResolvedValue({ count: 1 });
    tx.serviceRequest.updateMany.mockResolvedValue({ count: 1 });
    tx.quoteCounteroffer.updateMany.mockResolvedValue({ count: 1 });
    tx.quoteCounteroffer.findMany.mockResolvedValue([]);
    tx.user.findMany.mockResolvedValue([{ id: 'admin-1' }]);
    tx.notification.createMany.mockResolvedValue({ count: 1 });
  });

  it('submits one pending offer with initial history and admin notification', async () => {
    tx.serviceRequest.findFirst.mockResolvedValue({
      id: 'request-1',
      customerId: customer.id,
      quotation: {
        id: 'quote-1',
        quoteNumber: 'QT-1',
        status: QuoteStatus.SENT,
        validUntil: future,
        negotiatedTotal: null,
      },
    });
    tx.quoteCounteroffer.create.mockResolvedValue({
      id: 'offer-1',
      status: QuoteCounterofferStatus.PENDING,
    });

    await service.submit(customer, 'request-1', {
      requestedTotal: 175,
      note: 'Please review',
    });

    expect(tx.quoteCounteroffer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quotationId: 'quote-1',
          customerId: customer.id,
          requestedTotal: 175,
          statusHistory: {
            create: expect.objectContaining({
              status: QuoteCounterofferStatus.PENDING,
            }),
          },
        }),
      }),
    );
    expect(tx.notification.createMany).toHaveBeenCalled();
  });

  it('turns the partial unique-index race into a conflict', async () => {
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });

    await expect(
      service.submit(customer, 'request-1', { requestedTotal: 175 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('admin approval only sets negotiated total and counteroffer state', async () => {
    tx.quoteCounteroffer.findUnique.mockResolvedValue({
      id: 'offer-1',
      quotationId: 'quote-1',
      customerId: customer.id,
      requestedTotal: 175,
      status: QuoteCounterofferStatus.PENDING,
      quotation: {
        requestId: 'request-1',
        request: { status: RequestStatus.QUOTE_SENT },
      },
    });
    tx.quoteCounteroffer.findUniqueOrThrow.mockResolvedValue({
      id: 'offer-1',
      status: QuoteCounterofferStatus.APPROVED,
    });

    await service.decide(
      admin,
      'offer-1',
      QuoteCounterofferStatus.APPROVED,
      {},
    );

    expect(tx.quotation.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'quote-1' }),
      data: { negotiatedTotal: 175 },
    });
    expect(tx.serviceRequest.update).not.toHaveBeenCalled();
    expect(tx.serviceRequest.updateMany).not.toHaveBeenCalled();
    expect(tx.quoteCounteroffer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: QuoteCounterofferStatus.APPROVED,
          decidedById: admin.id,
        }),
      }),
    );
  });

  it('customer acceptance performs the only quote/request acceptance transition', async () => {
    tx.quotation.findFirst.mockResolvedValue({
      id: 'quote-1',
      status: QuoteStatus.VIEWED,
      validUntil: future,
      negotiatedTotal: 175,
    });
    tx.quotation.findUniqueOrThrow.mockResolvedValue({
      id: 'quote-1',
      status: QuoteStatus.ACCEPTED,
      negotiatedTotal: 175,
    });

    await service.acceptQuote(customer, 'request-1', {
      acceptTerms: true,
      termsVersion: '2026-08-20',
    });

    expect(tx.quotation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: QuoteStatus.ACCEPTED }),
      }),
    );
    expect(tx.serviceRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: RequestStatus.ACCEPTED },
      }),
    );
    expect(tx.serviceRequestStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: RequestStatus.ACCEPTED }),
    });
  });

  it('requotes by clearing negotiated total and superseding unresolved offers', async () => {
    tx.serviceRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      customerId: customer.id,
      status: RequestStatus.QUOTE_SENT,
      quotation: { id: 'quote-1', status: QuoteStatus.SENT },
    });
    tx.quoteCounteroffer.findMany.mockResolvedValue([
      { id: 'pending-1' },
      { id: 'approved-1' },
    ]);
    tx.quotation.findUniqueOrThrow.mockResolvedValue({
      id: 'quote-1',
      quoteNumber: 'QT-1',
    });

    await service.createOrReviseQuote(admin, 'request-1', {
      laborAmount: 100,
      partsAmount: 25,
      taxAmount: 10,
      validUntil: future.toISOString(),
    });

    expect(tx.quotation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ negotiatedTotal: null }),
      }),
    );
    expect(tx.quoteCounteroffer.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.quoteCounterofferStatusHistory.create).toHaveBeenCalledTimes(2);
  });

  it('clears negotiated pricing and supersedes offers when the customer rejects', async () => {
    tx.quotation.findFirst.mockResolvedValue({
      id: 'quote-1',
      quoteNumber: 'QT-1',
      status: QuoteStatus.VIEWED,
      notes: 'Original notes',
    });
    tx.quotation.findUniqueOrThrow.mockResolvedValue({
      id: 'quote-1',
      status: QuoteStatus.REJECTED,
      negotiatedTotal: null,
    });
    tx.quoteCounteroffer.findMany.mockResolvedValue([
      { id: 'pending-1' },
      { id: 'approved-1' },
    ]);

    await service.rejectQuote(customer, 'request-1', {
      reason: 'Not proceeding',
    });

    expect(tx.quotation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: QuoteStatus.REJECTED,
          negotiatedTotal: null,
        }),
      }),
    );
    expect(tx.quoteCounteroffer.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.quoteCounterofferStatusHistory.create).toHaveBeenCalledTimes(2);
  });

  it('does not expose negotiation history to assigned technicians', async () => {
    prisma.serviceRequest.findUnique.mockResolvedValue({
      customerId: customer.id,
      technicianId: technician.id,
      quotation: { id: 'quote-1' },
    });

    await expect(
      service.history(technician, 'request-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.quoteCounteroffer.findMany).not.toHaveBeenCalled();
  });

  it('rejects an admin decision that loses its conditional update', async () => {
    tx.quoteCounteroffer.findUnique.mockResolvedValue({
      id: 'offer-1',
      quotationId: 'quote-1',
      customerId: customer.id,
      requestedTotal: 175,
      status: QuoteCounterofferStatus.PENDING,
      quotation: {
        requestId: 'request-1',
        request: { status: RequestStatus.QUOTE_SENT },
      },
    });
    tx.quoteCounteroffer.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.decide(admin, 'offer-1', QuoteCounterofferStatus.REJECTED, {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
