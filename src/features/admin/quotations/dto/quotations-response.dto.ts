import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  QuoteCounterofferStatus,
  QuoteStatus,
  RequestStatus,
} from '../../../../../generated/prisma/enums';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { AdminPersonSummaryDto } from '../../common/dto/person-summary.dto';

export class AdminNegotiationSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() requestedTotal!: number;
  @ApiPropertyOptional({ nullable: true }) note!: string | null;
  @ApiProperty({ enum: QuoteCounterofferStatus })
  status!: QuoteCounterofferStatus;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}

export class AdminQuotationRequestSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() requestNumber!: string;
  @ApiProperty({ enum: RequestStatus }) status!: RequestStatus;
}

export class AdminQuotationItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() quoteNumber!: string;
  @ApiProperty({ enum: QuoteStatus }) status!: QuoteStatus;
  @ApiProperty() totalAmount!: number;
  @ApiPropertyOptional({ nullable: true }) negotiatedTotal!: number | null;
  @ApiProperty({ type: String, format: 'date-time' }) validUntil!: Date;
  @ApiProperty({ type: AdminQuotationRequestSummaryDto })
  request!: AdminQuotationRequestSummaryDto;
  @ApiProperty({ type: AdminPersonSummaryDto })
  customer!: AdminPersonSummaryDto;
  @ApiPropertyOptional({ type: AdminNegotiationSummaryDto, nullable: true })
  pendingNegotiation!: AdminNegotiationSummaryDto | null;
}

export class AdminQuotationPageDto extends PaginatedResponseDto<AdminQuotationItemDto> {
  @ApiProperty({ type: [AdminQuotationItemDto] })
  declare items: AdminQuotationItemDto[];
}
