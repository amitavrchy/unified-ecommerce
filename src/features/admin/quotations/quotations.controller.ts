import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { ApiErrorResponseDto } from '../../../common/dto/api-response.dto';
import { AdminGuard } from '../admin.guard';
import { AdminQuotationQueryDto } from './dto/quotations.dto';
import { AdminQuotationPageDto } from './dto/quotations-response.dto';
import { AdminQuotationsService } from './quotations.service';

@ApiTags('Admin Quotations')
@ApiBearerAuth()
@Controller('admin/quotations')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
export class AdminQuotationsController {
  constructor(private readonly quotations: AdminQuotationsService) {}

  @Get()
  @ApiOperation({
    summary: 'List quotations with the current pending negotiation summary',
  })
  @ApiOkResponse({ type: AdminQuotationPageDto })
  list(@Query() query: AdminQuotationQueryDto) {
    return this.quotations.list(query);
  }
}
