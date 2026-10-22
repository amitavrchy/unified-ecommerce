import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
  PaymentPurpose,
  PaymentStatus,
} from '../../../../../generated/prisma/enums';
import {
  AdminDateRangeQueryDto,
  AdminPaginationQueryDto,
  AdminSearchQueryDto,
} from '../../common/dto/admin-query.dto';

export class AdminPaymentQueryDto extends IntersectionType(
  AdminPaginationQueryDto,
  IntersectionType(AdminSearchQueryDto, AdminDateRangeQueryDto),
) {
  @ApiPropertyOptional({ enum: PaymentStatus, enumName: 'PaymentStatus' })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ enum: PaymentPurpose, enumName: 'PaymentPurpose' })
  @IsOptional()
  @IsEnum(PaymentPurpose)
  purpose?: PaymentPurpose;

  @ApiPropertyOptional({ description: 'Paying user ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Order ID' })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({ description: 'Service request ID' })
  @IsOptional()
  @IsString()
  requestId?: string;
}
