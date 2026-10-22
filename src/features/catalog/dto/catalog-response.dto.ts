import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ServiceIssueResponseDto {
  @ApiProperty({ example: 'cm6f4m0xw0007s1a2b3c4d5e6' })
  id!: string;

  @ApiProperty({ example: 'cm6f4m0xw0008s1a2b3c4d5e6' })
  categoryId!: string;

  @ApiProperty({ example: 'Low suction' })
  name!: string;
}

export class ServiceCategoryResponseDto {
  @ApiProperty({ example: 'cm6f4m0xw0008s1a2b3c4d5e6' })
  id!: string;

  @ApiProperty({ example: 'Central Vacuum Repair' })
  name!: string;

  @ApiProperty({
    nullable: true,
    example: 'Diagnosis and repair for central vacuum systems.',
  })
  description!: string | null;

  @ApiProperty({ type: () => [ServiceIssueResponseDto] })
  issues!: ServiceIssueResponseDto[];
}

export class ProductResponseDto {
  @ApiProperty({ example: 'cm6f4m0xw0009s1a2b3c4d5e6' })
  id!: string;

  @ApiPropertyOptional({ nullable: true, example: 'FILTER-HEPA-H700' })
  sku!: string | null;

  @ApiProperty({ example: 'HEPA Replacement Filter' })
  name!: string;

  @ApiProperty({
    example: 'High-efficiency replacement filter for compatible systems.',
  })
  description!: string;

  @ApiProperty({ example: 'Filters' })
  category!: string;

  @ApiProperty({ example: 39.99 })
  price!: number;

  @ApiProperty({ example: 20 })
  stock!: number;

  @ApiProperty({
    type: [String],
    example: ['https://cdn.example.com/products/hepa-filter.jpg'],
  })
  imageUrls!: string[];

  @ApiPropertyOptional({ nullable: true, example: 'hepa-replacement-filter' })
  slug!: string | null;

  @ApiProperty({
    type: [String],
    example: ['HEPA-grade filtration', 'Tool-free installation'],
  })
  features!: string[];

  @ApiPropertyOptional({
    nullable: true,
    type: 'object',
    additionalProperties: true,
  })
  specifications!: Record<string, unknown> | null;

  @ApiPropertyOptional({
    nullable: true,
    example: '2-year manufacturer warranty',
  })
  warranty!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 'Ships within 1–2 business days.',
  })
  shippingInfo!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: true })
  taxable!: boolean;

  @ApiPropertyOptional({
    nullable: true,
    example: 'Quiet-flow technology',
    description: 'Short storefront tagline taken from the first feature.',
  })
  tagline!: string | null;

  @ApiProperty({ example: true })
  inStock!: boolean;
}

export class ProductCategoryCountDto {
  @ApiProperty({ example: 'Vacuum' })
  name!: string;

  @ApiProperty({ example: 12 })
  count!: number;
}

export class ProductPageResponseDto {
  @ApiProperty({ type: [ProductResponseDto] })
  items!: ProductResponseDto[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 24 })
  pageSize!: number;
}

export class ProductDetailResponseDto extends ProductResponseDto {
  @ApiProperty({ type: [ProductResponseDto] })
  relatedProducts!: ProductResponseDto[];
}
