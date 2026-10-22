import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReturnStatus } from '../../../../../generated/prisma/enums';
import { OrderItemResponseDto } from '../../../orders/dto/orders.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { AdminPersonSummaryDto } from '../../common/dto/person-summary.dto';

export class AdminReturnActionEligibilityDto {
  @ApiProperty({ enum: ReturnStatus, isArray: true })
  allowedStatusTransitions!: ReturnStatus[];
  @ApiProperty() canRefund!: boolean;
}

export class AdminReturnRequestDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ReturnStatus }) status!: ReturnStatus;
  @ApiProperty() reason!: string;
  @ApiPropertyOptional({ nullable: true }) comments!: string | null;
  @ApiPropertyOptional({ nullable: true }) adminNotes!: string | null;
  @ApiPropertyOptional({ nullable: true }) resolution!: string | null;
  @ApiProperty() orderId!: string;
  @ApiPropertyOptional({ nullable: true }) orderItemId!: string | null;
  @ApiProperty() orderNumber!: string;
  @ApiProperty({ type: AdminPersonSummaryDto })
  customer!: AdminPersonSummaryDto;
  @ApiPropertyOptional({ type: OrderItemResponseDto, nullable: true })
  item!: OrderItemResponseDto | null;
  @ApiProperty({ type: AdminReturnActionEligibilityDto })
  actionEligibility!: AdminReturnActionEligibilityDto;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}

export class AdminReturnPageDto extends PaginatedResponseDto<AdminReturnRequestDto> {
  @ApiProperty({ type: [AdminReturnRequestDto] })
  declare items: AdminReturnRequestDto[];
}
