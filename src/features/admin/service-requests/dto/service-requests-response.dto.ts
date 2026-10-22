import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequestStatus } from '../../../../../generated/prisma/enums';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import {
  AdminNamedEntityDto,
  AdminPersonSummaryDto,
} from '../../common/dto/person-summary.dto';
import { AdminNegotiationSummaryDto } from '../../quotations/dto/quotations-response.dto';

export class AdminServiceRequestQuotationDto {
  @ApiProperty() id!: string;
  @ApiProperty() totalAmount!: number;
  @ApiPropertyOptional({ nullable: true }) negotiatedTotal!: number | null;
  @ApiPropertyOptional({ type: AdminNegotiationSummaryDto, nullable: true })
  pendingNegotiation!: AdminNegotiationSummaryDto | null;
}

export class AdminServiceRequestItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() requestNumber!: string;
  @ApiProperty({ enum: RequestStatus }) status!: RequestStatus;
  @ApiProperty() description!: string;
  @ApiProperty({ type: AdminPersonSummaryDto })
  customer!: AdminPersonSummaryDto;
  @ApiPropertyOptional({ type: AdminPersonSummaryDto, nullable: true })
  technician!: AdminPersonSummaryDto | null;
  @ApiProperty({ type: AdminNamedEntityDto })
  category!: AdminNamedEntityDto;
  @ApiPropertyOptional({ type: AdminNamedEntityDto, nullable: true })
  issue!: AdminNamedEntityDto | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  scheduledStart!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiPropertyOptional({ type: AdminServiceRequestQuotationDto, nullable: true })
  quotation!: AdminServiceRequestQuotationDto | null;
}

export class AdminServiceRequestPageDto extends PaginatedResponseDto<AdminServiceRequestItemDto> {
  @ApiProperty({ type: [AdminServiceRequestItemDto] })
  declare items: AdminServiceRequestItemDto[];
}
