import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '../../../generated/prisma/client';
import {
  QuoteCounterofferStatus,
  QuoteStatus,
  RequestStatus,
  UserRole,
} from '../../../generated/prisma/enums';
import type { QuotationModel } from '../../../generated/prisma/models/Quotation';
import type { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  CreateQuoteCounterofferDto,
  DecideQuoteCounterofferDto,
} from './dto/quote-counteroffer.dto';
import type {
  AcceptQuoteDto,
  CreateQuoteDto,
  RejectQuoteDto,
} from './dto/service-request.dto';

const RESPONDABLE_QUOTES: QuoteStatus[] = [
  QuoteStatus.SENT,
  QuoteStatus.VIEWED,
];
const UNRESOLVED_COUNTEROFFERS: QuoteCounterofferStatus[] = [
  QuoteCounterofferStatus.PENDING,
  QuoteCounterofferStatus.APPROVED,
];

const counterofferInclude = {
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  quotation: {
    include: {
      request: {
        select: {
          id: true,
          requestNumber: true,
          customerId: true,
          status: true,
        },
      },
    },
  },
} as const;

@Injectable()
export class QuoteCounterofferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async createOrReviseQuote(
    user: AuthUser,
    requestId: string,
    dto: CreateQuoteDto,
  ) {
    this.requireRole(user, UserRole.ADMIN);
    const validUntil = new Date(dto.validUntil);
    if (validUntil <= new Date())
      throw new BadRequestException('Quote expiry must be in the future');
    const total = Number(
      (
        dto.laborAmount +
        dto.partsAmount +
        dto.taxAmount -
        (dto.discountAmount ?? 0)
      ).toFixed(2),
    );
    if (total < 0)
      throw new BadRequestException('Quote total cannot be negative');

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.serviceRequest.findUnique({
        where: { id: requestId },
        include: { quotation: true },
      });
      if (!request) throw new NotFoundException('Service request not found');
      if (
        request.status === RequestStatus.CANCELLED ||
        request.status === RequestStatus.COMPLETED
      ) {
        throw new BadRequestException('Cannot quote a closed request');
      }
      if (request.quotation?.status === QuoteStatus.ACCEPTED)
        throw new ConflictException('Accepted quotations cannot be changed');

      let quote: QuotationModel;
      if (request.quotation) {
        const claimed = await tx.quotation.updateMany({
          where: {
            id: request.quotation.id,
            status: { not: QuoteStatus.ACCEPTED },
          },
          data: {
            laborAmount: dto.laborAmount,
            partsAmount: dto.partsAmount,
            taxAmount: dto.taxAmount,
            discountAmount: dto.discountAmount ?? 0,
            totalAmount: total,
            negotiatedTotal: null,
            notes: dto.notes,
            status: QuoteStatus.SENT,
            validUntil,
            viewedAt: null,
            rejectedAt: null,
            cancelledAt: null,
          },
        });
        if (claimed.count !== 1)
          throw new ConflictException('Quotation changed concurrently');
        await this.supersedeUnresolved(
          tx,
          request.quotation.id,
          user.id,
          'Superseded by a revised quotation',
        );
        quote = await tx.quotation.findUniqueOrThrow({
          where: { id: request.quotation.id },
        });
      } else {
        quote = await tx.quotation.create({
          data: {
            requestId,
            quoteNumber: this.quoteNumber(),
            ...dto,
            discountAmount: dto.discountAmount ?? 0,
            totalAmount: total,
            status: QuoteStatus.SENT,
            validUntil,
          },
        });
      }
      await tx.serviceRequest.update({
        where: { id: requestId },
        data: { status: RequestStatus.QUOTE_SENT },
      });
      await tx.serviceRequestStatusHistory.create({
        data: {
          requestId,
          status: RequestStatus.QUOTE_SENT,
          actorId: user.id,
          note: 'Quotation sent',
        },
      });
      await this.notifications.createForUser(
        request.customerId,
        {
          title: 'Your service quote is ready',
          body: `Quote ${quote.quoteNumber} is ready to review.`,
          data: { requestId, quoteId: quote.id },
        },
        tx,
      );
      return quote;
    });
  }

  async submit(
    user: AuthUser,
    requestId: string,
    dto: CreateQuoteCounterofferDto,
  ) {
    this.requireRole(user, UserRole.CUSTOMER);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const request = await tx.serviceRequest.findFirst({
          where: { id: requestId, customerId: user.id },
          include: { quotation: true },
        });
        if (!request) throw new NotFoundException('Service request not found');
        const quote = request.quotation;
        if (!quote)
          throw new BadRequestException('An active quotation is required');
        if (
          !RESPONDABLE_QUOTES.includes(quote.status) ||
          quote.validUntil <= new Date()
        ) {
          throw new BadRequestException(
            'Counteroffers require an unexpired sent or viewed quotation',
          );
        }
        if (quote.negotiatedTotal !== null)
          throw new ConflictException(
            'An approved counteroffer is awaiting customer acceptance',
          );

        // Touch and conditionally claim the quote row so submission cannot race
        // with requoting, expiry, or customer acceptance.
        const claimed = await tx.quotation.updateMany({
          where: {
            id: quote.id,
            status: { in: RESPONDABLE_QUOTES },
            validUntil: { gt: new Date() },
            negotiatedTotal: null,
            request: { customerId: user.id },
          },
          data: { negotiatedTotal: null },
        });
        if (claimed.count !== 1)
          throw new ConflictException('Quotation changed concurrently');

        const counteroffer = await tx.quoteCounteroffer.create({
          data: {
            quotationId: quote.id,
            customerId: user.id,
            requestedTotal: dto.requestedTotal,
            note: dto.note,
            statusHistory: {
              create: {
                status: QuoteCounterofferStatus.PENDING,
                actorId: user.id,
                note: dto.note ?? 'Counteroffer submitted',
              },
            },
          },
          include: counterofferInclude,
        });
        await this.notifications.fanOutToActiveAdmins(
          {
            title: 'New quote counteroffer',
            body: `A customer submitted a counteroffer for quote ${quote.quoteNumber}.`,
            data: {
              requestId,
              quoteId: quote.id,
              counterofferId: counteroffer.id,
            },
          },
          tx,
        );
        return counteroffer;
      });
    } catch (error: unknown) {
      if (this.isUniqueConstraint(error))
        throw new ConflictException(
          'A pending counteroffer already exists for this quotation',
        );
      throw error;
    }
  }

  async decide(
    user: AuthUser,
    counterofferId: string,
    status: QuoteCounterofferStatus,
    dto: DecideQuoteCounterofferDto,
  ) {
    this.requireRole(user, UserRole.ADMIN);
    if (
      status !== QuoteCounterofferStatus.APPROVED &&
      status !== QuoteCounterofferStatus.REJECTED
    ) {
      throw new BadRequestException('Invalid counteroffer decision');
    }
    return this.prisma.$transaction(async (tx) => {
      const counteroffer = await tx.quoteCounteroffer.findUnique({
        where: { id: counterofferId },
        include: {
          quotation: { include: { request: true } },
        },
      });
      if (!counteroffer)
        throw new NotFoundException('Quote counteroffer not found');
      if (counteroffer.status !== QuoteCounterofferStatus.PENDING)
        throw new ConflictException('This counteroffer is no longer pending');

      if (status === QuoteCounterofferStatus.APPROVED) {
        const quoteUpdated = await tx.quotation.updateMany({
          where: {
            id: counteroffer.quotationId,
            status: { in: RESPONDABLE_QUOTES },
            validUntil: { gt: new Date() },
            request: { status: RequestStatus.QUOTE_SENT },
          },
          data: { negotiatedTotal: counteroffer.requestedTotal },
        });
        if (quoteUpdated.count !== 1)
          throw new ConflictException(
            'The quotation is no longer eligible for approval',
          );
      }

      const decidedAt = new Date();
      const updated = await tx.quoteCounteroffer.updateMany({
        where: {
          id: counterofferId,
          status: QuoteCounterofferStatus.PENDING,
        },
        data: {
          status,
          decidedById: user.id,
          decisionNote: dto.note,
          decidedAt,
        },
      });
      if (updated.count !== 1)
        throw new ConflictException('Counteroffer changed concurrently');
      await tx.quoteCounterofferStatusHistory.create({
        data: {
          counterofferId,
          status,
          actorId: user.id,
          note:
            dto.note ??
            (status === QuoteCounterofferStatus.APPROVED
              ? 'Counteroffer approved'
              : 'Counteroffer rejected'),
        },
      });
      await this.notifications.createForUser(
        counteroffer.customerId,
        {
          title: `Counteroffer ${status.toLowerCase()}`,
          body:
            status === QuoteCounterofferStatus.APPROVED
              ? 'Your proposed total was approved. Accept the quotation with the displayed terms to continue.'
              : 'Your proposed total was not approved.',
          data: {
            requestId: counteroffer.quotation.requestId,
            quoteId: counteroffer.quotationId,
            counterofferId,
          },
        },
        tx,
      );
      return tx.quoteCounteroffer.findUniqueOrThrow({
        where: { id: counterofferId },
        include: counterofferInclude,
      });
    });
  }

  async acceptQuote(user: AuthUser, requestId: string, dto: AcceptQuoteDto) {
    this.requireRole(user, UserRole.CUSTOMER);
    if (!dto.acceptTerms)
      throw new BadRequestException(
        'Terms consent is required to accept a quotation',
      );
    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.quotation.findFirst({
        where: { requestId, request: { customerId: user.id } },
      });
      if (!quote) throw new NotFoundException('Service quotation not found');
      if (!RESPONDABLE_QUOTES.includes(quote.status))
        throw new BadRequestException('This quotation cannot be accepted');
      if (quote.validUntil <= new Date()) {
        await tx.quotation.updateMany({
          where: { id: quote.id, status: { in: RESPONDABLE_QUOTES } },
          data: { status: QuoteStatus.EXPIRED },
        });
        throw new BadRequestException('This quotation has expired');
      }

      const acceptedAt = new Date();
      const accepted = await tx.quotation.updateMany({
        where: {
          id: quote.id,
          status: { in: RESPONDABLE_QUOTES },
          validUntil: { gt: acceptedAt },
          request: {
            customerId: user.id,
            status: RequestStatus.QUOTE_SENT,
          },
        },
        data: {
          status: QuoteStatus.ACCEPTED,
          acceptedAt,
          acceptanceTermsAt: acceptedAt,
          acceptanceTermsVersion: dto.termsVersion,
        },
      });
      if (accepted.count !== 1)
        throw new ConflictException('Quotation changed concurrently');
      await this.supersedePending(
        tx,
        quote.id,
        user.id,
        'Superseded when the customer accepted the quotation',
      );
      const requestUpdated = await tx.serviceRequest.updateMany({
        where: {
          id: requestId,
          customerId: user.id,
          status: RequestStatus.QUOTE_SENT,
        },
        data: { status: RequestStatus.ACCEPTED },
      });
      if (requestUpdated.count !== 1)
        throw new ConflictException('Service request changed concurrently');
      await tx.serviceRequestStatusHistory.create({
        data: {
          requestId,
          status: RequestStatus.ACCEPTED,
          actorId: user.id,
          note: `Quote accepted; terms ${dto.termsVersion}`,
        },
      });
      await this.notifications.fanOutToActiveAdmins(
        {
          title: 'Service quote accepted',
          body: `A customer accepted quote ${quote.quoteNumber}.`,
          data: { requestId, quoteId: quote.id },
        },
        tx,
      );
      return tx.quotation.findUniqueOrThrow({ where: { id: quote.id } });
    });
  }

  async rejectQuote(user: AuthUser, requestId: string, dto: RejectQuoteDto) {
    this.requireRole(user, UserRole.CUSTOMER);
    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.quotation.findFirst({
        where: { requestId, request: { customerId: user.id } },
      });
      if (!quote) throw new NotFoundException('Service quotation not found');

      const rejectedAt = new Date();
      const rejected = await tx.quotation.updateMany({
        where: {
          id: quote.id,
          status: { in: RESPONDABLE_QUOTES },
          request: {
            customerId: user.id,
            status: RequestStatus.QUOTE_SENT,
          },
        },
        data: {
          status: QuoteStatus.REJECTED,
          rejectedAt,
          negotiatedTotal: null,
          notes: dto.reason ?? quote.notes,
        },
      });
      if (rejected.count !== 1)
        throw new ConflictException('Quotation changed concurrently');

      await this.supersedeUnresolved(
        tx,
        quote.id,
        user.id,
        'Superseded when the customer rejected the quotation',
      );
      const requestUpdated = await tx.serviceRequest.updateMany({
        where: {
          id: requestId,
          customerId: user.id,
          status: RequestStatus.QUOTE_SENT,
        },
        data: { status: RequestStatus.UNDER_REVIEW },
      });
      if (requestUpdated.count !== 1)
        throw new ConflictException('Service request changed concurrently');
      await tx.serviceRequestStatusHistory.create({
        data: {
          requestId,
          status: RequestStatus.UNDER_REVIEW,
          actorId: user.id,
          note: dto.reason ?? 'Quote rejected',
        },
      });
      await this.notifications.fanOutToActiveAdmins(
        {
          title: 'Service quote rejected',
          body: `A customer rejected quote ${quote.quoteNumber}.`,
          data: { requestId, quoteId: quote.id },
        },
        tx,
      );
      return tx.quotation.findUniqueOrThrow({ where: { id: quote.id } });
    });
  }

  async history(user: AuthUser, requestId: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id: requestId },
      select: { customerId: true, technicianId: true, quotation: true },
    });
    if (!request) throw new NotFoundException('Service request not found');
    if (user.role !== UserRole.ADMIN && request.customerId !== user.id) {
      throw new ForbiddenException('You cannot access this service request');
    }
    if (!request.quotation) return [];
    return this.prisma.quoteCounteroffer.findMany({
      where: { quotationId: request.quotation.id },
      include: counterofferInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async pending(page: number, pageSize: number) {
    const where = { status: QuoteCounterofferStatus.PENDING };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.quoteCounteroffer.findMany({
        where,
        include: {
          ...counterofferInclude,
          customer: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.quoteCounteroffer.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  private async supersedeUnresolved(
    tx: Prisma.TransactionClient,
    quotationId: string,
    actorId: string,
    note: string,
  ) {
    const unresolved = await tx.quoteCounteroffer.findMany({
      where: { quotationId, status: { in: UNRESOLVED_COUNTEROFFERS } },
      select: { id: true },
    });
    for (const counteroffer of unresolved) {
      const changed = await tx.quoteCounteroffer.updateMany({
        where: {
          id: counteroffer.id,
          status: { in: UNRESOLVED_COUNTEROFFERS },
        },
        data: {
          status: QuoteCounterofferStatus.SUPERSEDED,
          supersededAt: new Date(),
        },
      });
      if (changed.count === 1) {
        await tx.quoteCounterofferStatusHistory.create({
          data: {
            counterofferId: counteroffer.id,
            status: QuoteCounterofferStatus.SUPERSEDED,
            actorId,
            note,
          },
        });
      }
    }
  }

  private async supersedePending(
    tx: Prisma.TransactionClient,
    quotationId: string,
    actorId: string,
    note: string,
  ) {
    const pending = await tx.quoteCounteroffer.findMany({
      where: { quotationId, status: QuoteCounterofferStatus.PENDING },
      select: { id: true },
    });
    for (const counteroffer of pending) {
      const changed = await tx.quoteCounteroffer.updateMany({
        where: {
          id: counteroffer.id,
          status: QuoteCounterofferStatus.PENDING,
        },
        data: {
          status: QuoteCounterofferStatus.SUPERSEDED,
          supersededAt: new Date(),
        },
      });
      if (changed.count === 1) {
        await tx.quoteCounterofferStatusHistory.create({
          data: {
            counterofferId: counteroffer.id,
            status: QuoteCounterofferStatus.SUPERSEDED,
            actorId,
            note,
          },
        });
      }
    }
  }

  private requireRole(user: AuthUser, role: UserRole) {
    if (user.role !== role)
      throw new ForbiddenException(
        role === UserRole.ADMIN
          ? 'Only administrators can use this action'
          : 'Only customers can use this action',
      );
  }

  private quoteNumber() {
    return `QT-${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
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
