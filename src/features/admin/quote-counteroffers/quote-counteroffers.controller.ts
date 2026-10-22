import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { QuoteCounterofferStatus } from '../../../../generated/prisma/enums';
import type { AuthUser } from '../../../common/auth/auth.types';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { ApiErrorResponseDto } from '../../../common/dto/api-response.dto';
import { DecideQuoteCounterofferDto } from '../../service-requests/dto/quote-counteroffer.dto';
import { QuoteCounterofferResponseDto } from '../../service-requests/dto/service-request-response.dto';
import { QuoteCounterofferService } from '../../service-requests/quote-counteroffer.service';
import { AdminGuard } from '../admin.guard';
import { AdminPaginationQueryDto } from '../common/dto/admin-query.dto';
import { AdminPendingCounterofferQueueResponseDto } from './dto/quote-counteroffers-response.dto';

@ApiTags('Admin Quote Counteroffers')
@ApiBearerAuth()
@Controller('admin/quote-counteroffers')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
export class AdminQuoteCounteroffersController {
  constructor(private readonly counteroffers: QuoteCounterofferService) {}

  @Get('pending')
  @ApiOperation({
    summary: 'List pending customer quote counteroffers (admin only)',
  })
  @ApiOkResponse({ type: AdminPendingCounterofferQueueResponseDto })
  pending(@Query() query: AdminPaginationQueryDto) {
    return this.counteroffers.pending(query.page, query.pageSize);
  }

  @Post(':id/approve')
  @ApiOperation({
    summary: 'Approve a pending counteroffer without accepting the quote',
    description:
      'Sets the negotiated quote total only. The customer must still accept terms through the quotation acceptance endpoint; Stripe is not called.',
  })
  @ApiParam({ name: 'id', description: 'Quote counteroffer ID' })
  @ApiCreatedResponse({ type: QuoteCounterofferResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DecideQuoteCounterofferDto,
  ) {
    return this.counteroffers.decide(
      user,
      id,
      QuoteCounterofferStatus.APPROVED,
      dto,
    );
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a pending quote counteroffer (admin only)' })
  @ApiParam({ name: 'id', description: 'Quote counteroffer ID' })
  @ApiCreatedResponse({ type: QuoteCounterofferResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DecideQuoteCounterofferDto,
  ) {
    return this.counteroffers.decide(
      user,
      id,
      QuoteCounterofferStatus.REJECTED,
      dto,
    );
  }
}
