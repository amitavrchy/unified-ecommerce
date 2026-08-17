import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MediaKind,
  QuoteStatus,
  RequestStatus,
} from '../../../../generated/prisma/enums';

export class ServiceMediaResponseDto {
  @ApiProperty({ example: 'media-id' }) id!: string;
  @ApiProperty({ enum: MediaKind, enumName: 'MediaKind' }) kind!: MediaKind;
  @ApiProperty({ format: 'uri' }) url!: string;
  @ApiPropertyOptional({ nullable: true }) mimeType!: string | null;
}

export class ServiceRequestCatalogIssueResponseDto {
  @ApiProperty({ example: 'issue-id' }) id!: string;
  @ApiProperty({ example: 'Low suction' }) name!: string;
}

export class ServiceRequestCatalogCategoryResponseDto {
  @ApiProperty({ example: 'category-id' }) id!: string;
  @ApiProperty({ example: 'Central vacuum repair' }) name!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty({ type: [ServiceRequestCatalogIssueResponseDto] })
  issues!: ServiceRequestCatalogIssueResponseDto[];
}

export class QuoteResponseDto {
  @ApiProperty({ example: 'quote-id' }) id!: string;
  @ApiProperty({ example: 'QT-AB12CD34' }) quoteNumber!: string;
  @ApiProperty({ example: 192.1 }) totalAmount!: number;
  @ApiProperty({ enum: QuoteStatus, enumName: 'QuoteStatus' })
  status!: QuoteStatus;
  @ApiProperty({ type: String, format: 'date-time' }) validUntil!: string;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  acceptedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) notes!: string | null;
}

export class InletCountResponseDto {
  @ApiProperty({ example: 'inlet-id' }) id!: string;
  @ApiProperty({ example: 'Basement' }) floor!: string;
  @ApiProperty({ example: 'Standard inlet' }) type!: string;
  @ApiProperty({ example: 3 }) quantity!: number;
}

export class EquipmentResponseDto {
  @ApiProperty({ example: 'equipment-id' }) id!: string;
  @ApiProperty({ example: 'Unit 24' }) unitNumber!: string;
  @ApiPropertyOptional({ nullable: true }) manufacturer!: string | null;
  @ApiPropertyOptional({ nullable: true }) model!: string | null;
  @ApiPropertyOptional({ nullable: true }) serialNumber!: string | null;
  @ApiPropertyOptional({ nullable: true }) location!: string | null;
  @ApiPropertyOptional({ nullable: true }) condition!: string | null;
  @ApiProperty({ type: [InletCountResponseDto] })
  inlets!: InletCountResponseDto[];
}

export class ServiceReportResponseDto {
  @ApiProperty({ example: 'report-id' }) id!: string;
  @ApiProperty({ example: 'Repaired' }) repairStatus!: string;
  @ApiProperty({ example: 'Filter replaced and unit tested.' })
  workPerformed!: string;
  @ApiPropertyOptional({ nullable: true }) technicianNotes!: string | null;
  @ApiProperty({ example: false }) followUpRequired!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) submittedAt!: string;
}

export class ServiceRequestStatusHistoryResponseDto {
  @ApiProperty({ enum: RequestStatus, enumName: 'RequestStatus' })
  status!: RequestStatus;
  @ApiPropertyOptional({ nullable: true }) note!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}

export class ServiceRequestResponseDto {
  @ApiProperty({ example: 'request-id' }) id!: string;
  @ApiProperty({ example: 'SR-AB12CD34' }) requestNumber!: string;
  @ApiProperty({ example: 'customer-user-id' }) customerId!: string;
  @ApiPropertyOptional({ nullable: true }) technicianId!: string | null;
  @ApiProperty({ example: 'category-id' }) categoryId!: string;
  @ApiPropertyOptional({ nullable: true }) issueId!: string | null;
  @ApiProperty({ example: 'address-id' }) addressId!: string;
  @ApiProperty({ example: 'Low suction and rattling noise.' })
  description!: string;
  @ApiProperty({ enum: RequestStatus, enumName: 'RequestStatus' })
  status!: RequestStatus;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  scheduledStart!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  scheduledEnd!: string | null;
  @ApiPropertyOptional({ nullable: true }) cancellationReason!: string | null;
  @ApiProperty({ type: [ServiceMediaResponseDto] })
  media!: ServiceMediaResponseDto[];
  @ApiPropertyOptional({ type: QuoteResponseDto, nullable: true })
  quotation!: QuoteResponseDto | null;
  @ApiPropertyOptional({ type: ServiceReportResponseDto, nullable: true })
  report!: ServiceReportResponseDto | null;
  @ApiProperty({ type: [EquipmentResponseDto] })
  equipment!: EquipmentResponseDto[];
  @ApiProperty({ type: [ServiceRequestStatusHistoryResponseDto] })
  statusHistory!: ServiceRequestStatusHistoryResponseDto[];
}
