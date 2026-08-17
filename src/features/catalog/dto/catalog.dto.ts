import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

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
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiProperty({ minimum: 0, example: 20 })
  @IsInt()
  @Min(0)
  stock!: number;

  @ApiProperty({
    type: [String],
    format: 'uri',
    example: ['https://cdn.example.com/products/hepa-filter.jpg'],
  })
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
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { compatibility: 'H700 series', dimensions: '15 × 8 cm' },
  })
  @IsOptional()
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
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProductDto extends PartialType(ProductDto) {}

export class ProductQueryDto {
  @ApiPropertyOptional({ example: 'filter' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'Filters' })
  @IsOptional()
  @IsString()
  category?: string;

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
  pageSize?: number;
}
