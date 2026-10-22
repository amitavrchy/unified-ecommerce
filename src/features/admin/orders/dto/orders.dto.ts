import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '../../../../../generated/prisma/enums';
import {
  AdminDateRangeQueryDto,
  AdminPaginationQueryDto,
  AdminSearchQueryDto,
} from '../../common/dto/admin-query.dto';

export class AdminOrderQueryDto extends IntersectionType(
  AdminPaginationQueryDto,
  IntersectionType(AdminSearchQueryDto, AdminDateRangeQueryDto),
) {
  @ApiPropertyOptional({ enum: OrderStatus, enumName: 'OrderStatus' })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ description: 'Customer user ID' })
  @IsOptional()
  @IsString()
  customerId?: string;
}
