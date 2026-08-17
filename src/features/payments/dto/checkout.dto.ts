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

  @ApiPropertyOptional({
    description: 'Stable UUID used to safely retry the same checkout request.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;
}

export class CreateCartCheckoutDto {
  @ApiProperty({
    description: 'A saved customer address ID used for shipping.',
    example: 'clx-address-id',
  })
  @IsString()
  shippingAddressId!: string;

  @ApiPropertyOptional({
    description: 'Stable UUID used to safely retry the same checkout request.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;
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

  @ApiProperty({ example: 'pi_...' })
  paymentIntentId!: string;

  @ApiProperty({ example: 'pi_..._secret_...' })
  clientSecret!: string;

  @ApiProperty({ example: 'requires_confirmation' })
  status!: string;

  @ApiProperty({ example: 245 })
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
