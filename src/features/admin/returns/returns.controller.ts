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
import { AdminReturnQueryDto } from './dto/returns.dto';
import {
  AdminReturnPageDto,
  AdminReturnRequestDto,
} from './dto/returns-response.dto';
import { AdminReturnsService } from './returns.service';

@ApiTags('Admin Returns')
@ApiBearerAuth()
@Controller('admin/return-requests')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
export class AdminReturnsController {
  constructor(private readonly returns: AdminReturnsService) {}

  @Get()
  @ApiOperation({
    summary: 'List return requests with order, item, product, and eligibility',
    description:
      'Use /orders/returns/:id/status for review notes/status and /orders/:id/refund for Stripe refunds.',
  })
  @ApiOkResponse({ type: AdminReturnPageDto })
  list(@Query() query: AdminReturnQueryDto) {
    return this.returns.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one return request with action eligibility' })
  @ApiParam({ name: 'id', description: 'Return request ID' })
  @ApiOkResponse({ type: AdminReturnRequestDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  get(@Param('id') id: string) {
    return this.returns.get(id);
  }
}
