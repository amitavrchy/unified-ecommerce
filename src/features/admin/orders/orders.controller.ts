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
import { AdminOrderQueryDto } from './dto/orders.dto';
import {
  AdminOrderDetailDto,
  AdminOrderPageDto,
} from './dto/orders-response.dto';
import { AdminOrdersService } from './orders.service';

@ApiTags('Admin Orders')
@ApiBearerAuth()
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
export class AdminOrdersController {
  constructor(private readonly orders: AdminOrdersService) {}

  @Get()
  @ApiOperation({
    summary: 'List orders for admin commerce tabs',
    description:
      'Status values are the persisted order workflow states. Existing /orders/:id/status and /orders/:id/cancel routes own all order writes.',
  })
  @ApiOkResponse({ type: AdminOrderPageDto })
  list(@Query() query: AdminOrderQueryDto) {
    return this.orders.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get an order using the shared order-detail relation contract',
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiOkResponse({ type: AdminOrderDetailDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  get(@Param('id') id: string) {
    return this.orders.get(id);
  }
}
