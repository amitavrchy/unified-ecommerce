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
  Query,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Prisma } from '../../../generated/prisma/client';
import {
  MediaKind,
  PaymentStatus,
  QuoteStatus,
  RequestStatus,
  UserRole,
} from '../../../generated/prisma/enums';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { PrismaService } from '../../database/prisma.service';
import { StripeService } from '../payments/stripe.service';
import {
  AcceptQuoteDto,
  AssignTechnicianDto,
  CancelRequestDto,
  CreateQuoteDto,
  CreateRequestDto,
  EquipmentDto,
  MediaDto,
  RejectQuoteDto,
  ReportDto,
  UpdateRequestStatusDto,
} from './dto/service-request.dto';
import {
  EquipmentResponseDto,
  QuoteResponseDto,
  ServiceRequestCatalogCategoryResponseDto,
  ServiceMediaResponseDto,
  ServiceReportResponseDto,
  ServiceRequestResponseDto,
} from './dto/service-request-response.dto';

const detailInclude = {
  customer: { omit: { passwordHash: true } },
  technician: { omit: { passwordHash: true } },
  category: { include: { issues: true } },
  issue: true,
  address: true,
  media: true,
  quotation: true,
  report: true,
  equipment: { include: { inlets: true } },
  statusHistory: { orderBy: { createdAt: 'asc' } },
} as const;

const CUSTOMER_CANCELLABLE = new Set<RequestStatus>([
  RequestStatus.NEW,
  RequestStatus.UNDER_REVIEW,
  RequestStatus.QUOTE_SENT,
  RequestStatus.ACCEPTED,
  RequestStatus.SCHEDULED,
]);

const CLOSED_REQUESTS = new Set<RequestStatus>([
  RequestStatus.CANCELLED,
  RequestStatus.COMPLETED,
]);
const RESPONDABLE_QUOTES = new Set<QuoteStatus>([
  QuoteStatus.SENT,
  QuoteStatus.VIEWED,
]);

@ApiTags('Service Requests')
@ApiBearerAuth()
@Controller('service-requests')
@UseGuards(JwtAuthGuard)
export class RequestsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  @Get('catalog')
  @ApiOperation({
    summary: 'List service categories and their selectable issues',
  })
  @ApiOkResponse({
    type: ServiceRequestCatalogCategoryResponseDto,
    isArray: true,
  })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  catalog() {
    return this.prisma.serviceCategory.findMany({
      include: { issues: true },
      orderBy: { name: 'asc' },
    });
  }

  @Post()
  @ApiOperation({ summary: 'Submit a service request as a customer' })
  @ApiCreatedResponse({ type: ServiceRequestResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateRequestDto) {
    this.customer(user);
    if ((dto.attachments?.length ?? 0) > 10)
      throw new ConflictException(
        'A service request can contain at most 10 attachments',
      );
    this.validateIssueAttachments(dto.attachments ?? []);
    const [address, category] = await Promise.all([
      this.prisma.address.findFirst({
        where: { id: dto.addressId, userId: user.id },
      }),
      this.prisma.serviceCategory.findUnique({ where: { id: dto.categoryId } }),
    ]);
    if (!address)
      throw new ForbiddenException('Address does not belong to customer');
    if (!category) throw new NotFoundException('Service category not found');
    if (dto.issueId) {
      const issue = await this.prisma.serviceIssue.findFirst({
        where: { id: dto.issueId, categoryId: dto.categoryId },
      });
      if (!issue)
        throw new BadRequestException(
          'The issue must belong to the selected category',
        );
    }
    const request = await this.prisma.serviceRequest.create({
      data: {
        requestNumber: this.requestNumber(),
        customerId: user.id,
        categoryId: dto.categoryId,
        issueId: dto.issueId,
        addressId: dto.addressId,
        description: dto.description,
        preferredDate: dto.preferredDate
          ? new Date(dto.preferredDate)
          : undefined,
        preferredTime: dto.preferredTime,
        media: dto.attachments?.length
          ? {
              create: dto.attachments.map((attachment) => ({
                ...attachment,
                kind: MediaKind.ISSUE,
              })),
            }
          : undefined,
        statusHistory: {
          create: {
            status: RequestStatus.NEW,
            actorId: user.id,
            note: 'Request submitted',
          },
        },
      },
    });
    await this.prisma.notification.create({
      data: {
        userId: user.id,
        title: 'Service request received',
        body: `Request ${request.requestNumber} has been submitted for review.`,
        data: { requestId: request.id },
      },
    });
    return this.withDetails(request.id);
  }

  @Get()
  @ApiOperation({
    summary: 'List service requests available to the authenticated role',
  })
  @ApiQuery({ name: 'status', required: false, enum: RequestStatus })
  @ApiOkResponse({ type: ServiceRequestResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  list(@CurrentUser() user: AuthUser, @Query('status') status?: RequestStatus) {
    const scope =
      user.role === UserRole.CUSTOMER
        ? { customerId: user.id }
        : user.role === UserRole.TECHNICIAN
          ? { technicianId: user.id }
          : {};
    return this.prisma.serviceRequest.findMany({
      where: { ...scope, ...(status ? { status } : {}) },
      include: detailInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get one authorized service request with quote, report, equipment, and history',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiOkResponse({ type: ServiceRequestResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async one(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const request = await this.getAuthorized(user, id);
    if (
      user.role === UserRole.CUSTOMER &&
      request.status === RequestStatus.QUOTE_SENT
    ) {
      await this.prisma.quotation.updateMany({
        where: { requestId: id, status: QuoteStatus.SENT },
        data: { status: QuoteStatus.VIEWED, viewedAt: new Date() },
      });
    }
    return this.withDetails(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Advance the restricted service-request workflow',
    description:
      'Customer cancellation, quote actions, assignment, report submission, and final payment capture use their dedicated routes. This endpoint only permits safe role-specific transitions.',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiOkResponse({ type: ServiceRequestResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async status(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRequestStatusDto,
  ) {
    const request = await this.getAuthorized(user, id);
    if (user.role === UserRole.ADMIN) {
      if (
        request.status !== RequestStatus.NEW ||
        dto.status !== RequestStatus.UNDER_REVIEW
      )
        throw new BadRequestException(
          'Admin may only advance a new request to under review here',
        );
    } else if (user.role === UserRole.TECHNICIAN) {
      if (
        request.technicianId !== user.id ||
        request.status !== RequestStatus.SCHEDULED ||
        dto.status !== RequestStatus.IN_PROGRESS
      ) {
        throw new ForbiddenException(
          'Only the assigned technician can start a scheduled request',
        );
      }
    } else {
      throw new ForbiddenException(
        'Use the cancellation route for customer actions',
      );
    }
    await this.setRequestStatus(id, dto.status, user.id, dto.note, {
      startedAt:
        dto.status === RequestStatus.IN_PROGRESS ? new Date() : undefined,
    });
    return this.withDetails(id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a service request before work has started' })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiOkResponse({ type: ServiceRequestResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CancelRequestDto,
  ) {
    const request = await this.getAuthorized(user, id);
    if (!CUSTOMER_CANCELLABLE.has(request.status))
      throw new BadRequestException('This request can no longer be cancelled');
    if (user.role === UserRole.TECHNICIAN)
      throw new ForbiddenException(
        'Technicians cannot cancel a customer request',
      );
    if (request.status === RequestStatus.CANCELLED)
      throw new BadRequestException('This request is already cancelled');
    // Cancel Stripe's manual authorization before changing the request state.
    // That avoids retaining a card hold for a service the customer has cancelled.
    await this.stripe.voidServiceAuthorizationsForRequest(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.serviceRequest.update({
        where: { id },
        data: {
          status: RequestStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: dto.reason,
        },
      });
      await tx.serviceRequestStatusHistory.create({
        data: {
          requestId: id,
          status: RequestStatus.CANCELLED,
          note: dto.reason,
          actorId: user.id,
        },
      });
      if (request.quotation?.id) {
        await tx.quotation.updateMany({
          where: {
            id: request.quotation.id,
            status: {
              in: [QuoteStatus.SENT, QuoteStatus.VIEWED, QuoteStatus.ACCEPTED],
            },
          },
          data: { status: QuoteStatus.CANCELLED, cancelledAt: new Date() },
        });
      }
    });
    return this.withDetails(id);
  }

  @Post(':id/assign')
  @ApiOperation({
    summary:
      'Assign an authorized, accepted request to a technician (admin only)',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiOkResponse({ type: ServiceRequestResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'The technician is already scheduled for that time.',
  })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async assign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AssignTechnicianDto,
  ) {
    this.admin(user);
    const [request, technician] = await Promise.all([
      this.prisma.serviceRequest.findUnique({
        where: { id },
        include: { quotation: true },
      }),
      this.prisma.user.findFirst({
        where: {
          id: dto.technicianId,
          role: UserRole.TECHNICIAN,
          isActive: true,
          technician: {
            is: { isAvailable: true, verificationStatus: 'VERIFIED' },
          },
        },
      }),
    ]);
    if (!request) throw new NotFoundException('Service request not found');
    if (!technician)
      throw new NotFoundException('Verified available technician not found');
    if (request.status !== RequestStatus.ACCEPTED || !request.quotation)
      throw new BadRequestException(
        'Only an accepted quotation can be scheduled',
      );
    const authorization = await this.prisma.payment.findFirst({
      where: {
        quotationId: request.quotation.id,
        status: PaymentStatus.AUTHORIZED,
      },
    });
    if (!authorization)
      throw new BadRequestException(
        'A successful Stripe payment authorization is required before scheduling',
      );
    const start = new Date(dto.scheduledStart);
    const end = new Date(dto.scheduledEnd);
    if (end <= start)
      throw new BadRequestException(
        'scheduledEnd must be after scheduledStart',
      );
    const conflicting = await this.prisma.serviceRequest.findFirst({
      where: {
        id: { not: id },
        technicianId: technician.id,
        status: { in: [RequestStatus.SCHEDULED, RequestStatus.IN_PROGRESS] },
        scheduledStart: { lt: end },
        scheduledEnd: { gt: start },
      },
      select: { id: true },
    });
    if (conflicting)
      throw new ConflictException('Technician already has a conflicting job');
    await this.prisma.$transaction(async (tx) => {
      await tx.serviceRequest.update({
        where: { id },
        data: {
          technicianId: technician.id,
          scheduledStart: start,
          scheduledEnd: end,
          status: RequestStatus.SCHEDULED,
        },
      });
      await tx.serviceRequestStatusHistory.create({
        data: {
          requestId: id,
          status: RequestStatus.SCHEDULED,
          actorId: user.id,
          note: `Assigned to ${technician.firstName} ${technician.lastName}`,
        },
      });
      await tx.conversation.upsert({
        where: { requestId: id },
        create: {
          requestId: id,
          customerId: request.customerId,
          technicianId: technician.id,
        },
        update: { technicianId: technician.id },
      });
      await tx.notification.createMany({
        data: [
          {
            userId: request.customerId,
            title: 'Service appointment scheduled',
            body: 'Your technician and appointment window are confirmed.',
            data: { requestId: id },
          },
          {
            userId: technician.id,
            title: 'New assigned job',
            body: `You have been assigned request ${request.requestNumber}.`,
            data: { requestId: id },
          },
        ],
      });
    });
    return this.withDetails(id);
  }

  @Post(':id/quotation')
  @ApiOperation({
    summary: 'Create or revise a service quotation (admin only)',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiCreatedResponse({ type: QuoteResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async quote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateQuoteDto,
  ) {
    this.admin(user);
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: { quotation: true },
    });
    if (!request) throw new NotFoundException('Service request not found');
    if (CLOSED_REQUESTS.has(request.status))
      throw new BadRequestException('Cannot quote a closed request');
    if (request.quotation?.status === QuoteStatus.ACCEPTED)
      throw new ConflictException('Accepted quotations cannot be changed');
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
      const quote = await tx.quotation.upsert({
        where: { requestId: id },
        create: {
          requestId: id,
          quoteNumber: this.quoteNumber(),
          ...dto,
          totalAmount: total,
          status: QuoteStatus.SENT,
          validUntil,
        },
        update: {
          ...dto,
          totalAmount: total,
          status: QuoteStatus.SENT,
          validUntil,
          viewedAt: null,
          rejectedAt: null,
          cancelledAt: null,
        },
      });
      await tx.serviceRequest.update({
        where: { id },
        data: { status: RequestStatus.QUOTE_SENT },
      });
      await tx.serviceRequestStatusHistory.create({
        data: {
          requestId: id,
          status: RequestStatus.QUOTE_SENT,
          actorId: user.id,
          note: 'Quotation sent',
        },
      });
      await tx.notification.create({
        data: {
          userId: request.customerId,
          title: 'Your service quote is ready',
          body: `Quote ${quote.quoteNumber} is ready to review.`,
          data: { requestId: id, quoteId: quote.id },
        },
      });
      return quote;
    });
  }

  @Post(':id/quotation/accept')
  @ApiOperation({
    summary: 'Accept an unexpired quote with explicit terms consent',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiOkResponse({ type: QuoteResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async acceptQuote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AcceptQuoteDto,
  ) {
    this.customer(user);
    if (!dto.acceptTerms)
      throw new BadRequestException(
        'Terms consent is required to accept a quotation',
      );
    const request = await this.getAuthorized(user, id);
    if (request.customerId !== user.id) throw new ForbiddenException();
    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.quotation.findUnique({ where: { requestId: id } });
      if (!quote || !RESPONDABLE_QUOTES.has(quote.status))
        throw new BadRequestException('This quotation cannot be accepted');
      if (quote.validUntil <= new Date()) {
        await tx.quotation.update({
          where: { id: quote.id },
          data: { status: QuoteStatus.EXPIRED },
        });
        throw new BadRequestException('This quotation has expired');
      }
      const accepted = await tx.quotation.update({
        where: { id: quote.id },
        data: {
          status: QuoteStatus.ACCEPTED,
          acceptedAt: new Date(),
          acceptanceTermsAt: new Date(),
          acceptanceTermsVersion: dto.termsVersion,
        },
      });
      await tx.serviceRequest.update({
        where: { id },
        data: { status: RequestStatus.ACCEPTED },
      });
      await tx.serviceRequestStatusHistory.create({
        data: {
          requestId: id,
          status: RequestStatus.ACCEPTED,
          actorId: user.id,
          note: `Quote accepted; terms ${dto.termsVersion}`,
        },
      });
      return accepted;
    });
  }

  @Post(':id/quotation/reject')
  @ApiOperation({
    summary: 'Reject a sent quote and return the request to review',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiOkResponse({ type: QuoteResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async rejectQuote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectQuoteDto,
  ) {
    this.customer(user);
    const request = await this.getAuthorized(user, id);
    if (request.customerId !== user.id) throw new ForbiddenException();
    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.quotation.findUnique({ where: { requestId: id } });
      if (!quote || !RESPONDABLE_QUOTES.has(quote.status))
        throw new BadRequestException('This quotation cannot be rejected');
      const rejected = await tx.quotation.update({
        where: { id: quote.id },
        data: {
          status: QuoteStatus.REJECTED,
          rejectedAt: new Date(),
          notes: dto.reason ?? quote.notes,
        },
      });
      await tx.serviceRequest.update({
        where: { id },
        data: { status: RequestStatus.UNDER_REVIEW },
      });
      await tx.serviceRequestStatusHistory.create({
        data: {
          requestId: id,
          status: RequestStatus.UNDER_REVIEW,
          actorId: user.id,
          note: dto.reason ?? 'Quote rejected',
        },
      });
      return rejected;
    });
  }

  @Post(':id/media')
  @ApiOperation({ summary: 'Add a role-appropriate media URL to a request' })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiCreatedResponse({ type: ServiceMediaResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async media(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: MediaDto,
  ) {
    const request = await this.getAuthorized(user, id);
    this.validateMediaRole(user, request.technicianId, dto.kind);
    this.validateMime(dto.mimeType);
    return this.prisma.serviceMedia.create({ data: { requestId: id, ...dto } });
  }

  @Post(':id/report')
  @ApiOperation({ summary: 'Submit or update a technician service report' })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiCreatedResponse({ type: ServiceReportResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async report(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReportDto,
  ) {
    const request = await this.getAuthorized(user, id);
    if (user.role !== UserRole.TECHNICIAN || request.technicianId !== user.id)
      throw new ForbiddenException(
        'Only the assigned technician can submit a report',
      );
    if (
      request.status !== RequestStatus.IN_PROGRESS &&
      request.status !== RequestStatus.REPORT_SUBMITTED
    )
      throw new BadRequestException(
        'The request must be in progress before a report is submitted',
      );
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.serviceReport.upsert({
        where: { requestId: id },
        create: {
          requestId: id,
          ...dto,
          partsUsed: dto.partsUsed
            ? (JSON.parse(
                JSON.stringify(dto.partsUsed),
              ) as Prisma.InputJsonValue)
            : undefined,
          arrivalTime: dto.arrivalTime ? new Date(dto.arrivalTime) : undefined,
          departureTime: dto.departureTime
            ? new Date(dto.departureTime)
            : undefined,
        },
        update: {
          ...dto,
          partsUsed: dto.partsUsed
            ? (JSON.parse(
                JSON.stringify(dto.partsUsed),
              ) as Prisma.InputJsonValue)
            : undefined,
          arrivalTime: dto.arrivalTime ? new Date(dto.arrivalTime) : undefined,
          departureTime: dto.departureTime
            ? new Date(dto.departureTime)
            : undefined,
        },
      });
      if (request.status !== RequestStatus.REPORT_SUBMITTED) {
        await tx.serviceRequest.update({
          where: { id },
          data: { status: RequestStatus.REPORT_SUBMITTED },
        });
        await tx.serviceRequestStatusHistory.create({
          data: {
            requestId: id,
            status: RequestStatus.REPORT_SUBMITTED,
            actorId: user.id,
            note: 'Technician report submitted',
          },
        });
        await tx.notification.create({
          data: {
            userId: request.customerId,
            title: 'Service report submitted',
            body: 'Your technician has submitted the service report for review.',
            data: { requestId: id },
          },
        });
      }
      return report;
    });
  }

  @Post(':id/equipment')
  @ApiOperation({
    summary: 'Create or update technician equipment and inlet-count details',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiCreatedResponse({ type: EquipmentResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async equipment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: EquipmentDto,
  ) {
    const request = await this.getAuthorized(user, id);
    if (user.role !== UserRole.TECHNICIAN || request.technicianId !== user.id)
      throw new ForbiddenException(
        'Only the assigned technician can record equipment',
      );
    const existing = await this.prisma.equipment.findFirst({
      where: { requestId: id, unitNumber: dto.unitNumber },
    });
    const data = {
      manufacturer: dto.manufacturer,
      model: dto.model,
      serialNumber: dto.serialNumber,
      location: dto.location,
      condition: dto.condition,
      inlets: dto.inlets ? { deleteMany: {}, create: dto.inlets } : undefined,
    };
    return existing
      ? this.prisma.equipment.update({
          where: { id: existing.id },
          data,
          include: { inlets: true },
        })
      : this.prisma.equipment.create({
          data: { requestId: id, unitNumber: dto.unitNumber, ...data },
          include: { inlets: true },
        });
  }

  @Post(':id/report/customer-confirm')
  @ApiOperation({
    summary: 'Record customer confirmation of the completed service report',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiOkResponse({ type: ServiceReportResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async confirmReport(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.customer(user);
    const request = await this.getAuthorized(user, id);
    if (request.customerId !== user.id) throw new ForbiddenException();
    if (request.status !== RequestStatus.REPORT_SUBMITTED) {
      throw new BadRequestException(
        'A submitted technician report is required before confirmation',
      );
    }
    return this.prisma.serviceReport.update({
      where: { requestId: id },
      data: { customerConfirmedAt: new Date() },
    });
  }

  private async setRequestStatus(
    requestId: string,
    status: RequestStatus,
    actorId: string,
    note?: string,
    extra?: { startedAt?: Date },
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.serviceRequest.update({
        where: { id: requestId },
        data: { status, ...extra },
      });
      await tx.serviceRequestStatusHistory.create({
        data: { requestId, status, actorId, note },
      });
    });
  }

  private async withDetails(id: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!request) throw new NotFoundException('Service request not found');
    return request;
  }

  private async getAuthorized(user: AuthUser, id: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: { quotation: true },
    });
    if (!request) throw new NotFoundException('Service request not found');
    if (
      user.role !== UserRole.ADMIN &&
      request.customerId !== user.id &&
      request.technicianId !== user.id
    ) {
      throw new ForbiddenException('You cannot access this service request');
    }
    return request;
  }

  private validateIssueAttachments(attachments: { mimeType?: string }[]) {
    for (const attachment of attachments)
      this.validateMime(attachment.mimeType);
  }

  private validateMime(mimeType?: string) {
    if (mimeType && !/^(image|video)\/[a-z0-9.+-]+$/i.test(mimeType)) {
      throw new BadRequestException(
        'Only image and video attachments are supported',
      );
    }
  }

  private validateMediaRole(
    user: AuthUser,
    technicianId: string | null,
    kind: MediaKind,
  ) {
    if (user.role === UserRole.ADMIN) return;
    if (user.role === UserRole.CUSTOMER && kind === MediaKind.ISSUE) return;
    if (
      user.role === UserRole.TECHNICIAN &&
      technicianId === user.id &&
      kind !== MediaKind.ISSUE
    )
      return;
    throw new ForbiddenException(
      'This media type is not permitted for your role',
    );
  }

  private customer(user: AuthUser) {
    if (user.role !== UserRole.CUSTOMER)
      throw new ForbiddenException('Only customers can use this action');
  }

  private admin(user: AuthUser) {
    if (user.role !== UserRole.ADMIN)
      throw new ForbiddenException('Only administrators can use this action');
  }

  private requestNumber() {
    return `SR-${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
  }

  private quoteNumber() {
    return `QT-${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
  }
}
