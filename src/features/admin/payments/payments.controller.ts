import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { ApiErrorResponseDto } from '../../../common/dto/api-response.dto';
import { AdminGuard } from '../admin.guard';
import { AdminPaymentQueryDto } from './dto/payments.dto';
import {
  AdminPaymentDto,
  AdminPaymentPageDto,
} from './dto/payments-response.dto';
import { AdminPaymentsService } from './payments.service';

@ApiTags('Admin Payments')
@ApiBearerAuth()
@Controller('admin/payments')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
export class AdminPaymentsController {
  constructor(private readonly payments: AdminPaymentsService) {}

  @Get()
  @ApiOperation({
    summary: 'List Stripe payments for admin payment tabs',
    description:
      'Provider and payment method are reported only from persisted data. Use /payments/:id/capture for eligible service captures and /orders/:id/refund for order refunds.',
  })
  @ApiOkResponse({ type: AdminPaymentPageDto })
  list(@Query() query: AdminPaymentQueryDto) {
    return this.payments.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one Stripe payment with action eligibility' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiOkResponse({ type: AdminPaymentDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  get(@Param('id') id: string) {
    return this.payments.get(id);
  }
}
