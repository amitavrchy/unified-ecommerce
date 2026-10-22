import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import {
  AdminCustomerQueryDto,
  AdminUpdateCustomerDto,
} from './dto/customers.dto';
import {
  AdminCustomerDetailDto,
  AdminCustomerPageDto,
} from './dto/customers-response.dto';
import { AdminCustomersService } from './customers.service';

@ApiTags('Admin Customers')
@ApiBearerAuth()
@Controller('admin/customers')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
export class AdminCustomersController {
  constructor(private readonly customers: AdminCustomersService) {}

  @Get()
  @ApiOperation({ summary: 'List searchable customer operations profiles' })
  @ApiOkResponse({ type: AdminCustomerPageDto })
  list(@Query() query: AdminCustomerQueryDto) {
    return this.customers.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer profile detail and counts' })
  @ApiParam({ name: 'id', description: 'Customer user ID' })
  @ApiOkResponse({ type: AdminCustomerDetailDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  get(@Param('id') id: string) {
    return this.customers.get(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit limited non-credential customer profile fields',
  })
  @ApiOkResponse({ type: AdminCustomerDetailDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  update(@Param('id') id: string, @Body() dto: AdminUpdateCustomerDto) {
    return this.customers.update(id, dto);
  }
}
