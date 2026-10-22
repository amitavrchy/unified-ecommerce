import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PaymentPurpose,
  PaymentStatus,
} from '../../../../../generated/prisma/enums';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { AdminPersonSummaryDto } from '../../common/dto/person-summary.dto';

export class AdminPaymentActionEligibilityDto {
  @ApiProperty() canCapture!: boolean;
  @ApiProperty() canRefundOrder!: boolean;
}

export class AdminPaymentDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: PaymentStatus }) status!: PaymentStatus;
  @ApiProperty({ enum: PaymentPurpose }) purpose!: PaymentPurpose;
  @ApiProperty({ example: 'stripe' }) provider!: string;
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Stripe payment method type when persisted in provider metadata; otherwise null.',
  })
  paymentMethod!: string | null;
  @ApiProperty() amount!: number;
  @ApiProperty() refundedAmount!: number;
  @ApiProperty() currency!: string;
  @ApiProperty({ type: AdminPersonSummaryDto }) user!: AdminPersonSummaryDto;
  @ApiPropertyOptional({ nullable: true }) orderId!: string | null;
  @ApiPropertyOptional({ nullable: true }) orderNumber!: string | null;
  @ApiPropertyOptional({ nullable: true }) requestId!: string | null;
  @ApiPropertyOptional({ nullable: true }) requestNumber!: string | null;
  @ApiPropertyOptional({ nullable: true }) providerReference!: string | null;
  @ApiProperty({ type: AdminPaymentActionEligibilityDto })
  actionEligibility!: AdminPaymentActionEligibilityDto;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class AdminPaymentPageDto extends PaginatedResponseDto<AdminPaymentDto> {
  @ApiProperty({ type: [AdminPaymentDto] })
  declare items: AdminPaymentDto[];
}
