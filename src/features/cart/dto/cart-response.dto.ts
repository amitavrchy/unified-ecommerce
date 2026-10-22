import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CartProductResponseDto {
  @ApiProperty({ example: 'product-id' }) id!: string;
  @ApiProperty({ example: 'Central Vacuum Filter' }) name!: string;
  @ApiProperty({ example: 49.99 }) price!: number;
  @ApiProperty({ example: 20 }) stock!: number;
  @ApiProperty({
    type: [String],
    example: ['https://cdn.example.com/filter.jpg'],
  })
  imageUrls!: string[];
  @ApiPropertyOptional({ nullable: true, example: 'central-vacuum-filter' })
  slug!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    example: 'HEPA filtration for whole-home systems',
  })
  tagline!: string | null;
  @ApiProperty({ example: true }) inStock!: boolean;
  @ApiProperty({ example: true }) taxable!: boolean;
}

export class CartItemResponseDto {
  @ApiProperty({ example: 'cart-item-id' }) id!: string;
  @ApiProperty({ example: 'product-id' }) productId!: string;
  @ApiProperty({ example: 2 }) quantity!: number;
  @ApiProperty({ example: 49.99 }) unitPrice!: number;
  @ApiProperty({ example: 99.98 }) lineTotal!: number;
  @ApiProperty({ type: CartProductResponseDto })
  product!: CartProductResponseDto;
}

export class CartResponseDto {
  @ApiProperty({ example: 'cart-id' }) id!: string;
  @ApiProperty({ example: 'customer-id' }) customerId!: string;
  @ApiProperty({ type: [CartItemResponseDto] }) items!: CartItemResponseDto[];
  @ApiProperty({ example: 2, description: 'Sum of item quantities.' })
  itemCount!: number;
  @ApiProperty({ example: 'cad' }) currency!: string;
  @ApiProperty({
    example: 99.98,
    description: 'Current subtotal calculated from live catalog prices.',
  })
  subtotal!: number;
  @ApiProperty({
    example: 14.97,
    description: 'Estimated tax using TAX_RATE on taxable items.',
  })
  tax!: number;
  @ApiProperty({
    example: 0,
    description:
      'Shipping is not billed separately today; included for the cart summary UI.',
  })
  shippingFee!: number;
  @ApiProperty({ example: 114.95 }) total!: number;
  @ApiProperty({ example: 0.14975 }) taxRate!: number;
}
