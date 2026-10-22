import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentStatus } from '../../../../../generated/prisma/enums';

export class AdminReportSeriesPointDto {
  @ApiProperty({ example: '2026-08' }) period!: string;
  @ApiProperty({ example: 12450.25 }) value!: number;
}

export class AdminReportDistributionItemDto {
  @ApiProperty({ example: 'Repair' }) name!: string;
  @ApiProperty({ example: 18 }) count!: number;
  @ApiProperty({ example: 42.86 }) percentage!: number;
}

export class AdminReportFiltersDto {
  @ApiProperty({ example: '2026-01-01' }) from!: string;
  @ApiProperty({ example: '2026-08-20' }) to!: string;
  @ApiProperty({ example: 'America/Toronto' }) timezone!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  technicianId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  categoryId!: string | null;
  @ApiPropertyOptional({ enum: PaymentStatus, nullable: true })
  paymentStatus!: PaymentStatus | null;
}

export class AdminStoreMetricsDto {
  @ApiProperty() orders!: number;
  @ApiProperty() grossRevenue!: number;
  @ApiProperty() refunds!: number;
  @ApiProperty() netRevenue!: number;
  @ApiProperty() averageOrderValue!: number;
}

export class AdminServiceMetricsDto {
  @ApiProperty() requests!: number;
  @ApiProperty() completed!: number;
  @ApiProperty() acceptedQuotes!: number;
  @ApiProperty() serviceRevenue!: number;
  @ApiProperty() averageServiceValue!: number;
}

export class AdminReportKpiTrendDto {
  @ApiProperty() current!: number;
  @ApiProperty() previous!: number;
  @ApiProperty() delta!: number;
  @ApiProperty() deltaPercent!: number;
}

export class AdminReportTrendsDto {
  @ApiProperty({ type: AdminReportKpiTrendDto })
  averageQuoteAcceptance!: AdminReportKpiTrendDto;
  @ApiProperty({ type: AdminReportKpiTrendDto })
  averageServiceValue!: AdminReportKpiTrendDto;
  @ApiProperty({ type: AdminReportKpiTrendDto })
  technicianUtilization!: AdminReportKpiTrendDto;
  @ApiProperty({ type: AdminReportKpiTrendDto })
  storeNetRevenue!: AdminReportKpiTrendDto;
  @ApiProperty({ type: AdminReportKpiTrendDto })
  serviceRevenue!: AdminReportKpiTrendDto;
}

export class AdminPaymentActivityDto {
  @ApiPropertyOptional({ enum: PaymentStatus, nullable: true })
  status!: PaymentStatus | null;
  @ApiProperty() count!: number;
  @ApiProperty() amount!: number;
}

export class AdminReportOverviewResponseDto {
  @ApiProperty({ type: AdminReportFiltersDto })
  filters!: AdminReportFiltersDto;
  @ApiProperty({ example: 'cad' }) currency!: string;
  @ApiProperty({ type: [AdminReportSeriesPointDto] })
  revenueSeries!: AdminReportSeriesPointDto[];
  @ApiProperty({ type: [AdminReportDistributionItemDto] })
  serviceDistribution!: AdminReportDistributionItemDto[];
  @ApiProperty({ type: [AdminReportSeriesPointDto] })
  monthlyOrders!: AdminReportSeriesPointDto[];
  @ApiProperty({ example: 71.43 }) averageQuoteAcceptance!: number;
  @ApiProperty({ example: 428.5 }) averageServiceValue!: number;
  @ApiProperty({ example: 63.25 }) technicianUtilization!: number;
  @ApiProperty({ type: AdminPaymentActivityDto })
  paymentActivity!: AdminPaymentActivityDto;
  @ApiProperty({ type: AdminStoreMetricsDto })
  store!: AdminStoreMetricsDto;
  @ApiProperty({ type: AdminServiceMetricsDto })
  services!: AdminServiceMetricsDto;
  @ApiProperty({ type: AdminReportTrendsDto })
  trends!: AdminReportTrendsDto;
}
