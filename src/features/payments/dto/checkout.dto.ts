import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CheckoutItemDto {
  @ApiProperty({ example: 'clx-product-id' })
  @IsString()
  productId!: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateOrderCheckoutDto {
  @ApiProperty({ type: [CheckoutItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];

  @ApiProperty({
    description: 'A saved customer address ID used for shipping.',
    example: 'clx-address-id',
  })
  @IsString()
  shippingAddressId!: string;

  @ApiProperty({
    description:
      'Client-generated stable UUID. Reuse it for a retry of this exact checkout, and generate a new one only for a new checkout.',
    format: 'uuid',
    example: 'a644413e-03cd-45a3-b2b9-0295d2a9f8ea',
  })
  @IsUUID()
  idempotencyKey!: string;
}

export class PreviewCheckoutDto {
  @ApiPropertyOptional({
    type: [CheckoutItemDto],
    description:
      'Buy Now / explicit items. Omit this field to preview the saved cart.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items?: CheckoutItemDto[];

  @ApiPropertyOptional({
    description:
      'Saved address to attach to the preview. When omitted, the primary address is returned if one exists.',
    example: 'clx-address-id',
  })
  @IsOptional()
  @IsString()
  shippingAddressId?: string;
}

export class CheckoutPreviewItemDto {
  @ApiProperty({ example: 'clx-product-id' }) productId!: string;
  @ApiProperty({ example: 'Elite 500 Power Unit' }) name!: string;
  @ApiProperty({ example: 2 }) quantity!: number;
  @ApiProperty({ example: 299 }) unitPrice!: number;
  @ApiProperty({ example: 598 }) lineTotal!: number;
  @ApiProperty({ example: true }) taxable!: boolean;
  @ApiProperty({ example: true }) inStock!: boolean;
  @ApiProperty({ example: 4 }) availableStock!: number;
  @ApiPropertyOptional({ nullable: true, example: 'Quiet-flow technology' })
  tagline!: string | null;
  @ApiProperty({ type: [String] }) imageUrls!: string[];
}

export class CheckoutPreviewAddressDto {
  @ApiProperty({ example: 'clx-address-id' }) id!: string;
  @ApiProperty({ example: '123 Main Street' }) line1!: string;
  @ApiPropertyOptional({ nullable: true }) apartment!: string | null;
  @ApiProperty({ example: 'Toronto' }) city!: string;
  @ApiProperty({ example: 'ON' }) state!: string;
  @ApiProperty({ example: 'M5V 2T6' }) zipCode!: string;
  @ApiProperty({ example: 'Canada' }) country!: string;
  @ApiProperty({ example: true }) isPrimary!: boolean;
}

export class CheckoutPreviewResponseDto {
  @ApiProperty({ enum: ['cart', 'items'] }) source!: 'cart' | 'items';
  @ApiProperty({ type: [CheckoutPreviewItemDto] })
  items!: CheckoutPreviewItemDto[];
  @ApiProperty({ example: 2 }) itemCount!: number;
  @ApiProperty({ example: 598 }) subtotal!: number;
  @ApiProperty({ example: 89.55 }) tax!: number;
  @ApiProperty({ example: 0 }) shippingFee!: number;
  @ApiProperty({ example: 687.55 }) total!: number;
  @ApiProperty({ example: 0.14975 }) taxRate!: number;
  @ApiProperty({ example: 'cad' }) currency!: string;
  @ApiPropertyOptional({
    type: CheckoutPreviewAddressDto,
    nullable: true,
  })
  shippingAddress!: CheckoutPreviewAddressDto | null;
}

export class CreateCartCheckoutDto {
  @ApiProperty({
    description: 'A saved customer address ID used for shipping.',
    example: 'clx-address-id',
  })
  @IsString()
  shippingAddressId!: string;

  @ApiProperty({
    description:
      'Client-generated stable UUID. Reuse it for a retry of this exact checkout, and generate a new one only for a new checkout.',
    format: 'uuid',
    example: 'a644413e-03cd-45a3-b2b9-0295d2a9f8ea',
  })
  @IsUUID()
  idempotencyKey!: string;
}

export class CheckoutSessionResponseDto {
  @ApiProperty({ example: 'clx-payment-id' })
  paymentId!: string;

  @ApiProperty({ example: 'clx-order-id' })
  orderId!: string;

  @ApiProperty({ example: 'cs_test_...' })
  checkoutSessionId!: string;

  @ApiProperty({ example: 'https://checkout.stripe.com/c/pay/cs_test_...' })
  checkoutUrl!: string;

  @ApiProperty({ example: 'cad' })
  currency!: string;

  @ApiProperty({ example: 402.42 })
  amount!: number;
}

export class ServiceAuthorizationResponseDto {
  @ApiProperty({ example: 'clx-payment-id' })
  paymentId!: string;

  @ApiProperty({ example: 'clx-request-id' })
  requestId!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 'https://checkout.stripe.com/c/pay/cs_test_...',
    description:
      'Open this URL immediately. Null when the quote is already authorized.',
  })
  checkoutUrl!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'cs_test_...' })
  checkoutSessionId!: string | null;

  @ApiProperty({ example: 180 })
  amount!: number;

  @ApiProperty({ example: 'cad' })
  currency!: string;
}

export class StripePaymentResponseDto {
  @ApiProperty({ example: 'clx-payment-id' }) id!: string;
  @ApiProperty({ example: 'ORDER', enum: ['ORDER', 'QUOTATION'] })
  purpose!: string;
  @ApiProperty({ example: 'PENDING' }) status!: string;
  @ApiProperty({ example: 402.42 }) amount!: number;
  @ApiProperty({ example: 'cad' }) currency!: string;
  @ApiPropertyOptional({ example: 'cs_test_...' })
  stripeCheckoutSessionId?: string;
  @ApiPropertyOptional({ example: 'pi_...' }) stripePaymentIntentId?: string;
}

export class StripeWebhookReceiptDto {
  @ApiProperty({ example: true })
  received!: boolean;

  @ApiPropertyOptional({ example: true })
  duplicate?: boolean;
}
