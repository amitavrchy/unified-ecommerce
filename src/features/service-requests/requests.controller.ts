import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  FileFieldsInterceptor,
  FileInterceptor,
} from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
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
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { MediaKind, RequestStatus } from '../../../generated/prisma/enums';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { PrismaService } from '../../database/prisma.service';
import { MediaUploadService } from '../../service/cloudinary/media-upload.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CustomerGuard } from './customer.guard';
import { CreateQuoteCounterofferDto } from './dto/quote-counteroffer.dto';
import {
  AcceptQuoteDto,
  CancelRequestDto,
  CreateRequestDto,
  CreateRequestFormDto,
  MediaDto,
  MediaFormDto,
  RejectQuoteDto,
} from './dto/service-request.dto';
import {
  QuoteResponseDto,
  QuoteCounterofferResponseDto,
  ServiceRequestCatalogCategoryResponseDto,
  ServiceMediaResponseDto,
  ServiceReportResponseDto,
  ServiceRequestResponseDto,
} from './dto/service-request-response.dto';
import { QuoteCounterofferService } from './quote-counteroffer.service';
import {
  MAX_REQUEST_MEDIA,
  REQUEST_MEDIA_FOLDER,
  RequestsService,
} from './requests.service';

@ApiTags('Customer Service Requests')
@ApiBearerAuth()
@Controller('service-requests')
@UseGuards(JwtAuthGuard, CustomerGuard)
export class RequestsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly counteroffers: QuoteCounterofferService,
    private readonly notifications: NotificationsService,
    private readonly mediaUploads: MediaUploadService,
    private readonly requests: RequestsService,
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
  @ApiOperation({
    summary: 'Submit a service request as a customer',
    description:
      'Send as multipart form data. Upload issue photos on the images field and clips on the videos field. At most 10 media items in total.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateRequestFormDto })
  @ApiCreatedResponse({ type: ServiceRequestResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'images', maxCount: MAX_REQUEST_MEDIA },
      { name: 'videos', maxCount: MAX_REQUEST_MEDIA },
    ]),
  )
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRequestDto,
    @UploadedFiles()
    uploads: {
      images?: Express.Multer.File[];
      videos?: Express.Multer.File[];
    } = {},
  ) {
    const files = [...(uploads.images ?? []), ...(uploads.videos ?? [])];
    if (files.length > MAX_REQUEST_MEDIA)
      throw new ConflictException(
        `A service request can contain at most ${MAX_REQUEST_MEDIA} attachments`,
      );
    this.mediaUploads.assertKind(uploads.images ?? [], 'image');
    this.mediaUploads.assertKind(uploads.videos ?? [], 'video');
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
    // Uploads run only after the request payload is known to be valid so a
    // rejected submission never leaves orphaned files in Cloudinary.
    const media = await this.mediaUploads.upload(files, REQUEST_MEDIA_FOLDER);
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
        media: media.length
          ? {
              create: media.map((attachment) => ({
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
    await Promise.all([
      this.notifications.createForUser(user.id, {
        title: 'Service request received',
        body: `Request ${request.requestNumber} has been submitted for review.`,
        data: { requestId: request.id },
      }),
      this.notifications.fanOutToActiveAdmins({
        title: 'New service request',
        body: `Request ${request.requestNumber} was submitted for review.`,
        data: { requestId: request.id },
      }),
    ]);
    return this.requests.withDetails(request.id, user);
  }

  @Get()
  @ApiOperation({
    summary: 'List service requests owned by the authenticated customer',
  })
  @ApiQuery({ name: 'status', required: false, enum: RequestStatus })
  @ApiOkResponse({ type: ServiceRequestResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  list(@CurrentUser() user: AuthUser, @Query('status') status?: RequestStatus) {
    return this.requests.listOwned(user, status);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get one owned service request with quote, report, equipment, and history',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiOkResponse({ type: ServiceRequestResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  one(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requests.viewAsCustomer(user, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a service request before work has started' })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiOkResponse({ type: ServiceRequestResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CancelRequestDto,
  ) {
    return this.requests.cancel(user, id, dto);
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
  acceptQuote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AcceptQuoteDto,
  ) {
    return this.counteroffers.acceptQuote(user, id, dto);
  }

  @Post(':id/quotation/counteroffers')
  @ApiOperation({
    summary: 'Submit a counteroffer for an owned unexpired quotation',
    description:
      'Creates one pending counteroffer. It does not accept the quotation or initiate Stripe.',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiCreatedResponse({ type: QuoteCounterofferResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  submitCounteroffer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateQuoteCounterofferDto,
  ) {
    return this.counteroffers.submit(user, id, dto);
  }

  @Get(':id/quotation/counteroffers')
  @ApiOperation({
    summary: 'Get counteroffer history for an owned service request',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiOkResponse({ type: QuoteCounterofferResponseDto, isArray: true })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  counterofferHistory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.counteroffers.history(user, id);
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
  rejectQuote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectQuoteDto,
  ) {
    return this.counteroffers.rejectQuote(user, id, dto);
  }

  @Post(':id/media')
  @ApiOperation({
    summary: 'Add issue media to an owned service request',
    description:
      'Send as multipart form data. Upload an image or video on the file field, or pass an already-hosted url.',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: MediaFormDto })
  @ApiCreatedResponse({ type: ServiceMediaResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @UseInterceptors(FileInterceptor('file'))
  media(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: MediaDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.requests.addMedia(user, id, dto, file);
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
    const request = await this.requests.getAuthorized(user, id);
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

  private requestNumber() {
    return `SR-${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
  }
}
