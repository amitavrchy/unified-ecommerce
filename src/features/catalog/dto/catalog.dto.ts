import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiBinaryFiles } from '../../../common/dto/api-file.decorator';
import {
  JsonObject,
  StringArray,
  ToBoolean,
} from '../../../common/dto/multipart.transform';

export enum ProductSort {
  POPULARITY = 'popularity',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  NEWEST = 'newest',
  NAME = 'name',
}

export class CategoryDto {
  @ApiProperty({ example: 'Central Vacuum Repair' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({
    example: 'Diagnosis and repair for central vacuum systems.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['Low suction', 'Unit will not start'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  issues?: string[];
}

export class ProductDto {
  @ApiPropertyOptional({ example: 'FILTER-HEPA-H700' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiProperty({ example: 'HEPA Replacement Filter' })
  @IsString()
  name!: string;

  @ApiProperty({
    example: 'High-efficiency replacement filter for compatible systems.',
  })
  @IsString()
  description!: string;

  @ApiProperty({ example: 'Filters' })
  @IsString()
  category!: string;

  @ApiProperty({ minimum: 0, example: 39.99 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiProperty({ minimum: 0, example: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock!: number;

  @ApiProperty({
    type: [String],
    format: 'uri',
    example: ['https://cdn.example.com/products/hepa-filter.jpg'],
  })
  @StringArray()
  @IsArray()
  @IsString({ each: true })
  imageUrls!: string[];

  @ApiPropertyOptional({ example: 'hepa-replacement-filter' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['HEPA-grade filtration', 'Tool-free installation'],
  })
  @IsOptional()
  @StringArray()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { compatibility: 'H700 series', dimensions: '15 × 8 cm' },
    description: 'On form requests send this as a JSON string.',
  })
  @IsOptional()
  @JsonObject()
  @IsObject()
  specifications?: Record<string, string | number | boolean>;

  @ApiPropertyOptional({ example: '2-year manufacturer warranty' })
  @IsOptional()
  @IsString()
  warranty?: string;

  @ApiPropertyOptional({ example: 'Ships within 1–2 business days.' })
  @IsOptional()
  @IsString()
  shippingInfo?: string;

  @ApiPropertyOptional({ default: true, example: true })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: true, example: true })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  taxable?: boolean;
}

export class UpdateProductDto extends PartialType(ProductDto) {}

/**
 * Create payload for the upload endpoints: images normally arrive as files, so
 * `imageUrls` carries already-hosted URLs only and is optional.
 */
export class CreateProductDto extends OmitType(ProductDto, [
  'imageUrls',
] as const) {
  @ApiPropertyOptional({
    type: [String],
    format: 'uri',
    example: ['https://cdn.example.com/products/hepa-filter.jpg'],
    description: 'Already-hosted image URLs, kept alongside uploaded files.',
  })
  @IsOptional()
  @StringArray()
  imageUrls?: string[];
}

/** Documents the multipart create payload for Swagger. */
export class CreateProductFormDto extends CreateProductDto {
  @ApiBinaryFiles('Product images uploaded to Cloudinary.')
  images?: unknown[];
}

/** Documents the multipart update payload for Swagger. */
export class UpdateProductFormDto extends UpdateProductDto {
  @ApiBinaryFiles('Product images uploaded to Cloudinary.')
  images?: unknown[];
}

export class ProductQueryDto {
  @ApiPropertyOptional({
    example: 'FILTER-HEPA',
    description: 'Search name, SKU, description, or category.',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'Filters' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['Vacuum', 'Accessories'],
    description: 'One or more store categories. Comma-separated values work.',
  })
  @IsOptional()
  @StringArray()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiPropertyOptional({ minimum: 0, example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ minimum: 0, example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'When true, only products with stock greater than zero.',
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  inStockOnly?: boolean;

  @ApiPropertyOptional({
    enum: ProductSort,
    default: ProductSort.POPULARITY,
  })
  @IsOptional()
  @IsEnum(ProductSort)
  sort?: ProductSort;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
