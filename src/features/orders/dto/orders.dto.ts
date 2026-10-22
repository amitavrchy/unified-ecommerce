import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiBinaryFile } from '../../../common/dto/api-file.decorator';
import {
  OrderStatus,
  PaymentStatus,
  ReturnStatus,
} from '../../../../generated/prisma/enums';

export enum CustomerOrderGroup {
  ALL = 'all',
  ACTIVE = 'active',
  COMPLETE = 'complete',
}

export class CustomerOrderQueryDto {
  @ApiPropertyOptional({
    enum: CustomerOrderGroup,
    default: CustomerOrderGroup.ALL,
    description:
      'Figma My Orders tabs: all, active (in progress), or complete (delivered, cancelled, refunded, failed).',
  })
  @IsOptional()
  @IsEnum(CustomerOrderGroup)
  group?: CustomerOrderGroup;

  @ApiPropertyOptional({ enum: OrderStatus, enumName: 'OrderStatus' })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ example: 'CC-AB12CD34' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 25;
}

export class RefundOrderDto {
  @ApiPropertyOptional({
    description:
      'Required when the order has more than one approved or received return.',
  })
  @IsOptional()
  @IsString()
  returnRequestId?: string;
}

export class RequestReturnDto {
  @ApiPropertyOptional({
    description:
      'Optional order item ID when returning one specific item from the order.',
  })
  @IsOptional()
  @IsString()
  orderItemId?: string;

  @ApiProperty({ example: 'Product arrived damaged.' })
  @IsString()
  @MaxLength(1000)
  reason!: string;

  @ApiPropertyOptional({ example: 'The outer box was crushed on delivery.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comments?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({
    enum: OrderStatus,
    enumName: 'OrderStatus',
    example: OrderStatus.PROCESSING,
  })
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @ApiPropertyOptional({ example: '1Z999AA10123456784' })
  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @ApiPropertyOptional({ example: 'UPS' })
  @IsOptional()
  @IsString()
  carrier?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    example: '2026-09-06T18:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  estimatedDelivery?: string;

  @ApiPropertyOptional({ example: 'Handed to carrier.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class UpdateReturnStatusDto {
  @ApiProperty({
    enum: ReturnStatus,
    enumName: 'ReturnStatus',
    example: ReturnStatus.APPROVED,
  })
  @IsEnum(ReturnStatus)
  status!: ReturnStatus;

  @ApiPropertyOptional({ example: 'Approved after damage review.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNotes?: string;

  @ApiPropertyOptional({
    example: 'Refund will be issued after warehouse receipt.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolution?: string;

  @ApiPropertyOptional({
    format: 'uri',
    example: 'https://carrier.example.com/labels/return-123.pdf',
    description: 'Alternative to uploading a file on the returnLabel field.',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  returnLabelUrl?: string;
}

/** Documents the multipart variant of `UpdateReturnStatusDto` for Swagger. */
export class UpdateReturnStatusFormDto extends UpdateReturnStatusDto {
  @ApiBinaryFile('Return shipping label as a PDF or image file.')
  returnLabel?: unknown;
}

export class ProductOrderItemResponseDto {
  @ApiProperty({ example: 'product-id' }) id!: string;
  @ApiProperty({ example: 'Central Vacuum Filter' }) name!: string;
  @ApiProperty({ type: [String] }) imageUrls!: string[];
  @ApiPropertyOptional({ nullable: true }) slug!: string | null;
}

export class OrderItemResponseDto {
  @ApiProperty({ example: 'order-item-id' }) id!: string;
  @ApiProperty({ example: 'product-id' }) productId!: string;
  @ApiProperty({ example: 2 }) quantity!: number;
  @ApiProperty({ example: 49.99 }) unitPrice!: number;
  @ApiProperty({ type: ProductOrderItemResponseDto })
  product!: ProductOrderItemResponseDto;
}

export class OrderStatusHistoryResponseDto {
  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' })
  status!: OrderStatus;
  @ApiPropertyOptional({ nullable: true }) note!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}

export class ReturnRequestResponseDto {
  @ApiProperty({ example: 'return-id' }) id!: string;
  @ApiProperty({ example: 'order-id' }) orderId!: string;
  @ApiProperty({ enum: ReturnStatus, enumName: 'ReturnStatus' })
  status!: ReturnStatus;
  @ApiPropertyOptional({ nullable: true }) orderItemId!: string | null;
  @ApiProperty({ example: 'Product arrived damaged.' }) reason!: string;
  @ApiPropertyOptional({ nullable: true }) comments!: string | null;
  @ApiPropertyOptional({ nullable: true }) resolution!: string | null;
  @ApiPropertyOptional({ nullable: true }) adminNotes!: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'uri' }) returnLabelUrl!:
    string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}

export class CustomerReturnResponseDto extends ReturnRequestResponseDto {
  @ApiProperty({ example: 'CC-90422' }) orderNumber!: string;
  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' })
  orderStatus!: OrderStatus;
}

export class OrderShippingAddressDto {
  @ApiProperty({ example: '128 Pristine Way' }) line1!: string;
  @ApiPropertyOptional({ nullable: true }) apartment!: string | null;
  @ApiProperty({ example: 'Clean Valley' }) city!: string;
  @ApiProperty({ example: 'CA' }) state!: string;
  @ApiProperty({ example: '90210' }) zipCode!: string;
  @ApiPropertyOptional({ example: 'US' }) country?: string;
}

export class OrderTimelineStepDto {
  @ApiProperty({
    example: 'PROCESSING',
    enum: ['PLACED', 'PAYMENT_CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'],
  })
  key!: string;

  @ApiProperty({ example: 'Processing' }) label!: string;

  @ApiProperty() completed!: boolean;
  @ApiProperty() current!: boolean;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'date-time',
  })
  at!: Date | null;
}

export class OrderResponseDto {
  @ApiProperty({ example: 'order-id' }) id!: string;
  @ApiProperty({ example: 'CC-AB12CD34' }) orderNumber!: string;
  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' })
  status!: OrderStatus;
  @ApiProperty({ example: 99.98 }) subtotal!: number;
  @ApiProperty({ example: 14.97 }) tax!: number;
  @ApiProperty({
    example: 0,
    description:
      'Derived as total - subtotal - tax when shipping is persisted.',
  })
  shippingFee!: number;
  @ApiProperty({ example: 114.95 }) total!: number;
  @ApiPropertyOptional({ nullable: true }) trackingNumber!: string | null;
  @ApiPropertyOptional({ nullable: true }) carrier!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  estimatedDelivery!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  paidAt!: string | null;
  @ApiPropertyOptional({
    enum: PaymentStatus,
    nullable: true,
  })
  paymentStatus!: PaymentStatus | null;
  @ApiProperty({ type: OrderShippingAddressDto })
  shippingAddress!: OrderShippingAddressDto;
  @ApiProperty({ type: [OrderTimelineStepDto] })
  timeline!: OrderTimelineStepDto[];
  @ApiProperty() canCancel!: boolean;
  @ApiProperty() canReturn!: boolean;
  @ApiProperty({ type: [OrderItemResponseDto] }) items!: OrderItemResponseDto[];
  @ApiProperty({ type: [OrderStatusHistoryResponseDto] })
  statusHistory!: OrderStatusHistoryResponseDto[];
  @ApiProperty({ type: [ReturnRequestResponseDto] })
  returnRequests!: ReturnRequestResponseDto[];
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}

export class OrderPageResponseDto {
  @ApiProperty({ type: [OrderResponseDto] })
  items!: OrderResponseDto[];
  @ApiProperty({ example: 8 }) total!: number;
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 25 }) pageSize!: number;
}
