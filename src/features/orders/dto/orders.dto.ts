import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus, ReturnStatus } from '../../../../generated/prisma/enums';

export class RequestReturnDto {
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
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  returnLabelUrl?: string;
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
  @ApiProperty({ enum: ReturnStatus, enumName: 'ReturnStatus' })
  status!: ReturnStatus;
  @ApiProperty({ example: 'Product arrived damaged.' }) reason!: string;
  @ApiPropertyOptional({ nullable: true }) comments!: string | null;
  @ApiPropertyOptional({ nullable: true }) resolution!: string | null;
  @ApiPropertyOptional({ nullable: true }) adminNotes!: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'uri' }) returnLabelUrl!:
    string | null;
}

export class OrderResponseDto {
  @ApiProperty({ example: 'order-id' }) id!: string;
  @ApiProperty({ example: 'CC-AB12CD34' }) orderNumber!: string;
  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' })
  status!: OrderStatus;
  @ApiProperty({ example: 99.98 }) subtotal!: number;
  @ApiProperty({ example: 14.97 }) tax!: number;
  @ApiProperty({ example: 114.95 }) total!: number;
  @ApiPropertyOptional({ nullable: true }) trackingNumber!: string | null;
  @ApiPropertyOptional({ nullable: true }) carrier!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  estimatedDelivery!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  paidAt!: string | null;
  @ApiProperty({ type: [OrderItemResponseDto] }) items!: OrderItemResponseDto[];
  @ApiProperty({ type: [OrderStatusHistoryResponseDto] })
  statusHistory!: OrderStatusHistoryResponseDto[];
  @ApiPropertyOptional({ type: ReturnRequestResponseDto, nullable: true })
  returnRequest!: ReturnRequestResponseDto | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}
