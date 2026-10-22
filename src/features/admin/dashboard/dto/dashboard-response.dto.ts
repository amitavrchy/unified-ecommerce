import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  OrderStatus,
  PaymentStatus,
  RequestStatus,
} from '../../../../../generated/prisma/enums';

export class AdminDashboardResponseDto {
  @ApiProperty({ example: 124 }) customers!: number;
  @ApiProperty({ example: 12 }) technicians!: number;
  @ApiProperty({ example: 3 }) techniciansPendingVerification!: number;
  @ApiProperty({ example: 18 }) activeServiceRequests!: number;
  @ApiProperty({ example: 7 }) pendingOrders!: number;
  @ApiProperty({ example: 42 }) products!: number;
  @ApiProperty({ example: 14582.42 }) capturedRevenue!: number;
  @ApiProperty({ example: 18 }) completedPayments!: number;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { NEW: 4, SCHEDULED: 6, IN_PROGRESS: 2 },
  })
  requestStatusCounts!: Record<string, number>;
}

export class AdminDashboardSummaryResponseDto {
  @ApiProperty({ example: 24 }) newServiceRequests!: number;
  @ApiProperty({ example: 8 }) quotationsAwaitingResponse!: number;
  @ApiProperty({ example: 11 }) servicesScheduledToday!: number;
  @ApiProperty({
    example: 4,
    description: 'Assigned jobs the technician has marked in progress.',
  })
  servicesInProgress!: number;
  @ApiProperty({
    example: 2,
    description: 'Technician reports waiting for office review.',
  })
  reportsAwaitingReview!: number;
  @ApiProperty({ example: 8420 }) monthlyServiceRevenue!: number;
  @ApiProperty({ example: 16 }) ordersAwaitingShipment!: number;
  @ApiProperty({ example: 3 }) paymentIssues!: number;
  @ApiProperty({
    example: 12,
    description: 'Active technician accounts.',
  })
  totalTechnicians!: number;
  @ApiProperty({
    example: 5,
    description: 'Technicians with a scheduled or in-progress job today.',
  })
  techniciansOnAssignmentToday!: number;
  @ApiProperty({
    example: 7,
    description:
      'Verified available technicians with no scheduled or in-progress job today.',
  })
  techniciansFreeToday!: number;
  @ApiProperty({ example: '2026-08-20' }) date!: string;
  @ApiProperty({ example: 'America/Toronto' }) timezone!: string;
  @ApiProperty({ example: '2026-08-20T04:00:00.000Z' })
  periodStart!: string;
  @ApiProperty({ example: '2026-08-21T04:00:00.000Z' })
  periodEnd!: string;
}

export class AdminRecentServiceRequestResponseDto {
  @ApiProperty({ example: 'request-id' }) id!: string;
  @ApiProperty({ example: 'SR-1048' }) requestNumber!: string;
  @ApiProperty({ example: 'Sarah Johnson' }) customerName!: string;
  @ApiProperty({ example: 'Central vacuum repair' }) serviceName!: string;
  @ApiPropertyOptional({ example: 'Low suction', nullable: true })
  issueName!: string | null;
  @ApiProperty({ enum: RequestStatus, example: RequestStatus.NEW })
  status!: RequestStatus;
  @ApiProperty({ example: '2026-08-20T12:15:00.000Z' })
  createdAt!: Date;
}

export class AdminDashboardScheduleItemResponseDto {
  @ApiProperty({ example: 'request-id' }) id!: string;
  @ApiProperty({ example: 'SR-1048' }) requestNumber!: string;
  @ApiProperty({ example: 'Sarah Thompson' }) customerName!: string;
  @ApiProperty({ example: 'Central vacuum repair' }) serviceName!: string;
  @ApiPropertyOptional({ example: 'Marc Anderson', nullable: true })
  technicianName!: string | null;
  @ApiProperty({ enum: RequestStatus, example: RequestStatus.SCHEDULED })
  status!: RequestStatus;
  @ApiProperty({ example: '2026-08-20T13:00:00.000Z' })
  scheduledStart!: Date;
  @ApiPropertyOptional({
    example: '2026-08-20T15:00:00.000Z',
    nullable: true,
  })
  scheduledEnd!: Date | null;
}

export class AdminRevenuePointResponseDto {
  @ApiProperty({ example: '2026-08' }) period!: string;
  @ApiProperty({ example: 8420 }) revenue!: number;
}

export class AdminRevenueSeriesResponseDto {
  @ApiProperty({ example: '2025-09-01' }) from!: string;
  @ApiProperty({ example: '2026-08-20' }) to!: string;
  @ApiProperty({ example: 'America/Toronto' }) timezone!: string;
  @ApiProperty({ example: 'cad' }) currency!: string;
  @ApiProperty({ example: 68420 }) total!: number;
  @ApiProperty({ type: [AdminRevenuePointResponseDto] })
  items!: AdminRevenuePointResponseDto[];
}

export class AdminServiceDistributionItemResponseDto {
  @ApiPropertyOptional({ example: 'issue-id', nullable: true })
  issueId!: string | null;
  @ApiProperty({ example: 'Low suction' }) name!: string;
  @ApiProperty({ example: 28 }) count!: number;
  @ApiProperty({ example: 28 }) percentage!: number;
}

export class AdminServiceDistributionResponseDto {
  @ApiProperty({ example: '2025-09-01' }) from!: string;
  @ApiProperty({ example: '2026-08-20' }) to!: string;
  @ApiProperty({ example: 'America/Toronto' }) timezone!: string;
  @ApiProperty({ example: 100 }) total!: number;
  @ApiProperty({ type: [AdminServiceDistributionItemResponseDto] })
  items!: AdminServiceDistributionItemResponseDto[];
}

export class AdminRecentOrderResponseDto {
  @ApiProperty({ example: 'order-id' }) id!: string;
  @ApiProperty({ example: 'CC-3084' }) orderNumber!: string;
  @ApiProperty({ example: 'Sarah Johnson' }) customerName!: string;
  @ApiProperty({ example: 349 }) amount!: number;
  @ApiProperty({ example: 'cad' }) currency!: string;
  @ApiProperty({ enum: OrderStatus, example: OrderStatus.SHIPPED })
  status!: OrderStatus;
  @ApiPropertyOptional({
    enum: PaymentStatus,
    example: PaymentStatus.SUCCEEDED,
    nullable: true,
  })
  paymentStatus!: PaymentStatus | null;
  @ApiProperty({ example: '2026-08-20T12:15:00.000Z' })
  createdAt!: Date;
}
