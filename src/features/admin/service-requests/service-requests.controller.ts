import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../../../common/auth/auth.types';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { ApiErrorResponseDto } from '../../../common/dto/api-response.dto';
import {
  AssignTechnicianDto,
  CancelRequestDto,
  CreateQuoteDto,
  MediaDto,
  MediaFormDto,
  UpdateRequestStatusDto,
} from '../../service-requests/dto/service-request.dto';
import {
  QuoteResponseDto,
  ServiceMediaResponseDto,
  ServiceRequestResponseDto,
} from '../../service-requests/dto/service-request-response.dto';
import { QuoteCounterofferService } from '../../service-requests/quote-counteroffer.service';
import { RequestsService } from '../../service-requests/requests.service';
import { AdminGuard } from '../admin.guard';
import { AdminServiceRequestQueryDto } from './dto/service-requests.dto';
import { AdminServiceRequestPageDto } from './dto/service-requests-response.dto';
import { AdminServiceRequestsService } from './service-requests.service';

@ApiTags('Admin Service Requests')
@ApiBearerAuth()
@Controller('admin/service-requests')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
export class AdminServiceRequestsController {
  constructor(
    private readonly serviceRequests: AdminServiceRequestsService,
    private readonly requests: RequestsService,
    private readonly counteroffers: QuoteCounterofferService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List and filter service requests for administration',
    description:
      'Use GET /admin/service-requests/:id for detail. Review, assignment, quotation, cancel, and media writes also live here. Technician start, report, and equipment live on /technician/service-requests.',
  })
  @ApiOkResponse({ type: AdminServiceRequestPageDto })
  list(@Query() query: AdminServiceRequestQueryDto) {
    return this.serviceRequests.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get one service request with quote, report, equipment, and history',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiOkResponse({ type: ServiceRequestResponseDto })
  one(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requests.withDetails(id, user);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Advance a new service request to under review',
    description:
      'Admin may only advance a new request to under review here. Technician start lives on /technician/service-requests/:id/status.',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiOkResponse({ type: ServiceRequestResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  status(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRequestStatusDto,
  ) {
    return this.requests.review(user, id, dto);
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
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AssignTechnicianDto,
  ) {
    return this.requests.assign(user, id, dto);
  }

  @Post(':id/quotation')
  @ApiOperation({
    summary: 'Create or revise a service quotation (admin only)',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiCreatedResponse({ type: QuoteResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  quote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateQuoteDto,
  ) {
    return this.counteroffers.createOrReviseQuote(user, id, dto);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a service request before work has started' })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiOkResponse({ type: ServiceRequestResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CancelRequestDto,
  ) {
    return this.requests.cancel(user, id, dto);
  }

  @Post(':id/media')
  @ApiOperation({
    summary: 'Add media to a service request',
    description:
      'Send as multipart form data. Upload an image or video on the file field, or pass an already-hosted url.',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: MediaFormDto })
  @ApiCreatedResponse({ type: ServiceMediaResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @UseInterceptors(FileInterceptor('file'))
  media(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: MediaDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.requests.addMedia(user, id, dto, file);
  }
}
