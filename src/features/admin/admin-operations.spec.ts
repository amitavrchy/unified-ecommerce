/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import {
  QuoteCounterofferStatus,
  RequestStatus,
  UserRole,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../database/prisma.service';
import { AdminGuard } from './admin.guard';
import { AdminCustomersService } from './customers/customers.service';
import { MediaUploadService } from '../../service/cloudinary/media-upload.service';
import { AdminEquipmentService } from './equipment/equipment.service';
import { AdminQuotationsService } from './quotations/quotations.service';
import { AdminServiceRequestsService } from './service-requests/service-requests.service';
import { AdminTechniciansService } from './technicians/technicians.service';

describe('Admin operations contracts', () => {
  const prisma = {
    $transaction: jest.fn((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    ),
    serviceRequest: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    quotation: { findMany: jest.fn(), count: jest.fn() },
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    technicianProfile: {
      update: jest.fn(),
    },
    equipment: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    equipmentMedia: { create: jest.fn() },
  };

  beforeEach(() => jest.clearAllMocks());

  it('builds a paginated service-request query with all domain filters', async () => {
    prisma.serviceRequest.findMany.mockResolvedValue([]);
    prisma.serviceRequest.count.mockResolvedValue(0);
    const service = new AdminServiceRequestsService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.list({
        page: 2,
        pageSize: 10,
        status: RequestStatus.SCHEDULED,
        customerId: 'customer-1',
        technicianId: 'tech-1',
        categoryId: 'category-1',
        issueId: 'issue-1',
        search: 'SR-1048',
        from: '2026-08-20',
        to: '2026-08-20',
        timezone: 'America/Toronto',
      }),
    ).resolves.toEqual({ items: [], total: 0, page: 2, pageSize: 10 });

    expect(prisma.serviceRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: expect.objectContaining({
          status: RequestStatus.SCHEDULED,
          customerId: 'customer-1',
          technicianId: 'tech-1',
          categoryId: 'category-1',
          issueId: 'issue-1',
          createdAt: {
            gte: new Date('2026-08-20T04:00:00.000Z'),
            lt: new Date('2026-08-21T04:00:00.000Z'),
          },
        }),
      }),
    );
  });

  it('returns only the latest pending negotiation with each quotation', async () => {
    prisma.quotation.findMany.mockResolvedValue([
      {
        id: 'quote-1',
        quoteNumber: 'QT-1',
        request: {
          id: 'request-1',
          requestNumber: 'SR-1',
          status: RequestStatus.QUOTE_SENT,
          customer: { id: 'customer-1' },
        },
        counteroffers: [{ id: 'counter-1' }],
      },
    ]);
    prisma.quotation.count.mockResolvedValue(1);
    const service = new AdminQuotationsService(
      prisma as unknown as PrismaService,
    );

    const result = await service.list({ page: 1, pageSize: 25 });

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        customer: { id: 'customer-1' },
        pendingNegotiation: { id: 'counter-1' },
      }),
    );
    expect(prisma.quotation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          counteroffers: expect.objectContaining({
            where: { status: QuoteCounterofferStatus.PENDING },
            take: 1,
          }),
        }),
      }),
    );
  });

  it('stores equipment media as a pre-uploaded URL record', async () => {
    prisma.equipment.findFirst.mockResolvedValue({ id: 'equipment-1' });
    prisma.equipmentMedia.create.mockResolvedValue({ id: 'media-1' });
    const service = new AdminEquipmentService(
      prisma as unknown as PrismaService,
      {} as MediaUploadService,
    );

    await service.addMedia('customer-1', 'equipment-1', {
      url: 'https://uploads.example.com/equipment.jpg',
      mimeType: 'image/jpeg',
      caption: 'Main unit',
    });

    expect(prisma.equipmentMedia.create).toHaveBeenCalledWith({
      data: {
        equipmentId: 'equipment-1',
        url: 'https://uploads.example.com/equipment.jpg',
        mimeType: 'image/jpeg',
        caption: 'Main unit',
      },
    });
  });

  it('includes customer addresses in admin people search', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);
    const service = new AdminCustomersService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.list({ page: 1, pageSize: 25, search: 'Toronto' }),
    ).resolves.toEqual({ items: [], total: 0, page: 1, pageSize: 25 });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              addresses: expect.objectContaining({
                some: expect.objectContaining({ OR: expect.any(Array) }),
              }),
            }),
          ]),
        }),
      }),
    );
  });

  it('preserves the technician user id instead of the profile id', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      firstName: 'Riley',
      lastName: 'Chen',
      email: 'tech@example.com',
      phone: null,
      technician: {
        id: 'profile-1',
        serviceArea: 'Toronto',
        skills: [],
        rating: 4.5,
        isAvailable: true,
        verificationStatus: 'VERIFIED',
      },
      _count: { assignedRequests: 2 },
      assignedRequests: [
        { id: 'request-1', status: 'REPORT_SUBMITTED' },
        { id: 'request-2', status: 'IN_PROGRESS' },
      ],
    });
    const service = new AdminTechniciansService(
      prisma as unknown as PrismaService,
      { createForUser: jest.fn() } as never,
    );

    await expect(service.get('user-1', 'UTC')).resolves.toEqual(
      expect.objectContaining({
        id: 'user-1',
        profileId: 'profile-1',
        jobsToday: 2,
        jobsInProgress: 1,
        reportsAwaitingReview: 1,
      }),
    );
  });

  it('rejects every non-admin before controller handlers execute', () => {
    const guard = new AdminGuard();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: 'customer-1',
            email: 'c@example.com',
            role: UserRole.CUSTOMER,
          },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('approves a pending technician and notifies them', async () => {
    const technicianRow = {
      id: 'user-1',
      firstName: 'Riley',
      lastName: 'Chen',
      email: 'tech@example.com',
      phone: null,
      isActive: true,
      technician: {
        id: 'profile-1',
        serviceArea: 'Toronto',
        skills: [],
        rating: 4.5,
        isAvailable: true,
        verificationStatus: 'VERIFIED',
      },
      _count: { assignedRequests: 0 },
      assignedRequests: [],
    };
    prisma.user.findFirst
      .mockResolvedValueOnce({ id: 'user-1' })
      .mockResolvedValueOnce(technicianRow);
    prisma.technicianProfile.update.mockResolvedValue({});
    const notifications = { createForUser: jest.fn().mockResolvedValue({}) };
    const service = new AdminTechniciansService(
      prisma as unknown as PrismaService,
      notifications as never,
    );

    await expect(
      service.verify('user-1', { status: 'VERIFIED' as never }),
    ).resolves.toEqual(expect.objectContaining({ id: 'user-1' }));

    expect(prisma.technicianProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        data: expect.objectContaining({ verificationStatus: 'VERIFIED' }),
      }),
    );
    expect(notifications.createForUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ title: 'Technician account approved' }),
    );
  });
});
