import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MediaKind,
  QuoteCounterofferStatus,
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

export class QuoteCounterofferStatusHistoryResponseDto {
  @ApiProperty({
    enum: QuoteCounterofferStatus,
    enumName: 'QuoteCounterofferStatus',
  })
  status!: QuoteCounterofferStatus;
  @ApiPropertyOptional({ nullable: true }) actorId!: string | null;
  @ApiPropertyOptional({ nullable: true }) note!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}

export class QuoteCounterofferResponseDto {
  @ApiProperty({ example: 'counteroffer-id' }) id!: string;
  @ApiProperty({ example: 'quote-id' }) quotationId!: string;
  @ApiProperty({ example: 'customer-user-id' }) customerId!: string;
  @ApiProperty({ example: 175 }) requestedTotal!: number;
  @ApiPropertyOptional({ nullable: true }) note!: string | null;
  @ApiProperty({
    enum: QuoteCounterofferStatus,
    enumName: 'QuoteCounterofferStatus',
  })
  status!: QuoteCounterofferStatus;
  @ApiPropertyOptional({ nullable: true }) decidedById!: string | null;
  @ApiPropertyOptional({ nullable: true }) decisionNote!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  decidedAt!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  supersededAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: [QuoteCounterofferStatusHistoryResponseDto] })
  statusHistory!: QuoteCounterofferStatusHistoryResponseDto[];
}

export class QuotePaymentResponseDto {
  @ApiProperty({ example: 'payment-id' }) id!: string;
  @ApiProperty({ example: 'QUOTATION' }) purpose!: string;
  @ApiProperty({ example: 'AUTHORIZED' }) status!: string;
  @ApiProperty({ example: 180 }) amount!: number;
  @ApiProperty({ example: 'cad' }) currency!: string;
  @ApiPropertyOptional({ nullable: true, example: 'cs_test_...' })
  stripeCheckoutSessionId?: string | null;
  @ApiPropertyOptional({ nullable: true, example: 'pi_...' })
  stripePaymentIntentId?: string | null;
}

export class QuoteResponseDto {
  @ApiProperty({ example: 'quote-id' }) id!: string;
  @ApiProperty({ example: 'QT-AB12CD34' }) quoteNumber!: string;
  @ApiProperty({ example: 192.1 }) totalAmount!: number;
  @ApiPropertyOptional({
    nullable: true,
    example: 175,
    description:
      'Approved negotiated total; effective only after customer quote acceptance.',
  })
  negotiatedTotal!: number | null;
  @ApiProperty({ enum: QuoteStatus, enumName: 'QuoteStatus' })
  status!: QuoteStatus;
  @ApiProperty({ type: String, format: 'date-time' }) validUntil!: string;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  acceptedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) notes!: string | null;
  @ApiPropertyOptional({ type: [QuoteCounterofferResponseDto] })
  counteroffers?: QuoteCounterofferResponseDto[];
  @ApiPropertyOptional({ type: [QuotePaymentResponseDto] })
  payments?: QuotePaymentResponseDto[];
}

export class InletCountResponseDto {
  @ApiProperty({ example: 'inlet-id' }) id!: string;
  @ApiProperty({ example: 'Basement' }) floor!: string;
  @ApiProperty({ example: 'Standard inlet' }) type!: string;
  @ApiProperty({ example: 3 }) quantity!: number;
}

export class EquipmentMediaResponseDto {
  @ApiProperty({ example: 'media-id' }) id!: string;
  @ApiProperty({ format: 'uri' }) url!: string;
  @ApiPropertyOptional({ nullable: true }) mimeType!: string | null;
  @ApiPropertyOptional({ nullable: true }) caption!: string | null;
}

export class EquipmentResponseDto {
  @ApiProperty({ example: 'equipment-id' }) id!: string;
  @ApiProperty({ example: 'customer-user-id' }) customerId!: string;
  @ApiPropertyOptional({ nullable: true }) requestId!: string | null;
  @ApiProperty({ example: 'Unit 24' }) unitNumber!: string;
  @ApiPropertyOptional({ nullable: true }) manufacturer!: string | null;
  @ApiPropertyOptional({ nullable: true }) model!: string | null;
  @ApiPropertyOptional({ nullable: true }) serialNumber!: string | null;
  @ApiPropertyOptional({ nullable: true }) location!: string | null;
  @ApiPropertyOptional({ nullable: true }) condition!: string | null;
  @ApiProperty({ type: [String] }) additionalFeatures!: string[];
  @ApiProperty({ type: [InletCountResponseDto] })
  inlets!: InletCountResponseDto[];
  @ApiProperty({ type: [EquipmentMediaResponseDto] })
  media!: EquipmentMediaResponseDto[];
}

export class ServiceReportResponseDto {
  @ApiProperty({ example: 'report-id' }) id!: string;
  @ApiProperty({ example: 'request-id' }) requestId!: string;
  @ApiProperty({ example: 'Repaired' }) repairStatus!: string;
  @ApiProperty({ example: 'Filter replaced and unit tested.' })
  workPerformed!: string;
  @ApiPropertyOptional({ nullable: true }) technicianNotes!: string | null;
  @ApiPropertyOptional({ nullable: true }) partsUsed!: unknown;
  @ApiProperty({ example: false }) followUpRequired!: boolean;
  @ApiPropertyOptional({ nullable: true }) followUpNotes!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  arrivalTime!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  departureTime!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  customerConfirmedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) submittedAt!: string;
}

export class ServiceRequestStatusHistoryResponseDto {
  @ApiProperty({ enum: RequestStatus, enumName: 'RequestStatus' })
  status!: RequestStatus;
  @ApiPropertyOptional({ nullable: true }) note!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}

export class ServiceRequestCustomerResponseDto {
  @ApiProperty({ example: 'customer-user-id' }) id!: string;
  @ApiProperty({ example: 'Sarah' }) firstName!: string;
  @ApiProperty({ example: 'Thompson' }) lastName!: string;
  @ApiProperty({ example: 'sarah@example.com' }) email!: string;
  @ApiPropertyOptional({ nullable: true, example: '+15145550188' })
  phone!: string | null;
}

export class ServiceRequestAddressResponseDto {
  @ApiProperty({ example: 'address-id' }) id!: string;
  @ApiProperty({ example: '1842 Maplewood Drive' }) line1!: string;
  @ApiPropertyOptional({ nullable: true, example: 'Apt 4' })
  apartment!: string | null;
  @ApiProperty({ example: 'Westmount' }) city!: string;
  @ApiProperty({ example: 'QC' }) state!: string;
  @ApiProperty({ example: 'H3Z 2A4' }) zipCode!: string;
  @ApiProperty({ example: 'Canada' }) country!: string;
  @ApiProperty({ example: false }) isPrimary!: boolean;
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
  @ApiProperty({ type: ServiceRequestCustomerResponseDto })
  customer!: ServiceRequestCustomerResponseDto;
  @ApiProperty({ type: ServiceRequestAddressResponseDto })
  address!: ServiceRequestAddressResponseDto;
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
