import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '../../../../../generated/prisma/enums';
import { OrderResponseDto } from '../../../orders/dto/orders.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { AdminPersonSummaryDto } from '../../common/dto/person-summary.dto';

export class AdminOrderActionEligibilityDto {
  @ApiProperty({ enum: OrderStatus, isArray: true })
  allowedStatusTransitions!: OrderStatus[];
  @ApiProperty() canCancel!: boolean;
}

export class AdminOrderListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderNumber!: string;
  @ApiProperty({ enum: OrderStatus }) status!: OrderStatus;
  @ApiProperty() total!: number;
  @ApiProperty() itemCount!: number;
  @ApiProperty({ type: AdminPersonSummaryDto })
  customer!: AdminPersonSummaryDto;
  @ApiProperty({ type: AdminOrderActionEligibilityDto })
  actionEligibility!: AdminOrderActionEligibilityDto;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}

export class AdminOrderPageDto extends PaginatedResponseDto<AdminOrderListItemDto> {
  @ApiProperty({ type: [AdminOrderListItemDto] })
  declare items: AdminOrderListItemDto[];
}

export class AdminOrderDetailDto extends OrderResponseDto {
  @ApiProperty({ type: AdminPersonSummaryDto })
  customer!: AdminPersonSummaryDto;
  @ApiProperty({ type: AdminOrderActionEligibilityDto })
  actionEligibility!: AdminOrderActionEligibilityDto;
}
