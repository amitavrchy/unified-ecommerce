import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InvoicePartyDto {
  @ApiProperty({ example: 'Elite Central Vacuum' })
  name!: string;

  @ApiProperty({ type: [String], example: ['123 Elite Plaza', 'Greenwich, CT 06830'] })
  addressLines!: string[];

  @ApiPropertyOptional({ nullable: true, example: 'support@elitecentralvacuum.com' })
  email!: string | null;

  @ApiPropertyOptional({ nullable: true })
  logoUrl!: string | null;
}

export class InvoiceServiceOverviewDto {
  @ApiProperty({ example: 'Full System Installation' })
  serviceType!: string;

  @ApiProperty({ example: 'Marcus Reed' })
  technician!: string;

  @ApiProperty({ example: 'Oct 24, 2024' })
  serviceDate!: string;

  @ApiProperty({ example: '4h 30m' })
  duration!: string;
}

export class InvoiceLineItemDto {
  @ApiProperty({ example: 'Power Unit (Aura Flow X1)' })
  name!: string;

  @ApiPropertyOptional({ nullable: true, example: 'Primary vacuum power unit' })
  description!: string | null;

  @ApiProperty({ example: '1' })
  quantity!: string;

  @ApiProperty({ example: 750 })
  price!: number;
}

export class InvoiceResponseDto {
  @ApiProperty({ example: 'clx-payment-id' })
  paymentId!: string;

  @ApiProperty({ example: 'INV-2026-089' })
  invoiceNumber!: string;

  @ApiProperty({ example: 'April 24, 2026' })
  date!: string;

  @ApiProperty({ example: 'PAID' })
  statusLabel!: string;

  @ApiProperty({ example: 'SUCCEEDED' })
  paymentStatus!: string;

  @ApiProperty({ example: 'ORDER', enum: ['ORDER', 'QUOTATION'] })
  purpose!: string;

  @ApiProperty({ example: 'cad' })
  currency!: string;

  @ApiProperty({ type: InvoicePartyDto })
  vendor!: InvoicePartyDto;

  @ApiProperty({ type: InvoicePartyDto })
  billTo!: InvoicePartyDto;

  @ApiPropertyOptional({ type: InvoiceServiceOverviewDto, nullable: true })
  service!: InvoiceServiceOverviewDto | null;

  @ApiProperty({ type: [InvoiceLineItemDto] })
  lineItems!: InvoiceLineItemDto[];

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiProperty({ example: 1240 })
  subtotal!: number;

  @ApiProperty({ example: 0 })
  serviceCharges!: number;

  @ApiProperty({ example: 105.4 })
  tax!: number;

  @ApiProperty({ example: 8.5 })
  taxPercent!: number;

  @ApiProperty({ example: 1345.4 })
  total!: number;
}
