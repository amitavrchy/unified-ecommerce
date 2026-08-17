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
}

export class CartItemResponseDto {
  @ApiProperty({ example: 'cart-item-id' }) id!: string;
  @ApiProperty({ example: 'product-id' }) productId!: string;
  @ApiProperty({ example: 2 }) quantity!: number;
  @ApiProperty({ type: CartProductResponseDto })
  product!: CartProductResponseDto;
}

export class CartResponseDto {
  @ApiProperty({ example: 'cart-id' }) id!: string;
  @ApiProperty({ example: 'customer-id' }) customerId!: string;
  @ApiProperty({ type: [CartItemResponseDto] }) items!: CartItemResponseDto[];
  @ApiProperty({
    example: 99.98,
    description: 'Current subtotal calculated from live catalog prices.',
  })
  subtotal!: number;
}
