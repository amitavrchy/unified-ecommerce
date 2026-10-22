import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { AdminPersonSummaryDto } from '../../common/dto/person-summary.dto';

export class AdminCustomerItemDto extends AdminPersonSummaryDto {
  @ApiPropertyOptional({ nullable: true }) company!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() requestCount!: number;
  @ApiProperty() orderCount!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}

export class AdminCustomerPageDto extends PaginatedResponseDto<AdminCustomerItemDto> {
  @ApiProperty({ type: [AdminCustomerItemDto] })
  declare items: AdminCustomerItemDto[];
}

export class AdminCustomerAddressDto {
  @ApiProperty() id!: string;
  @ApiProperty() line1!: string;
  @ApiPropertyOptional({ nullable: true }) apartment!: string | null;
  @ApiProperty() city!: string;
  @ApiProperty() state!: string;
  @ApiProperty() zipCode!: string;
  @ApiProperty() isPrimary!: boolean;
}

export class AdminCustomerDetailDto extends AdminCustomerItemDto {
  @ApiPropertyOptional({ nullable: true }) avatarUrl!: string | null;
  @ApiProperty() notificationEmail!: boolean;
  @ApiProperty() notificationPush!: boolean;
  @ApiProperty({ type: [AdminCustomerAddressDto] })
  addresses!: AdminCustomerAddressDto[];
}
