import { ApiProperty } from '@nestjs/swagger';

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

export class BroadcastNotificationResponseDto {
  @ApiProperty({ example: 124 }) recipients!: number;
}
