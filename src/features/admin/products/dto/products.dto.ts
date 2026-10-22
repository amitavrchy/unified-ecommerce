import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ToBoolean } from '../../../../common/dto/multipart.transform';
import {
  CreateProductDto,
  CreateProductFormDto,
  UpdateProductDto,
  UpdateProductFormDto,
} from '../../../catalog/dto/catalog.dto';
import {
  AdminPaginationQueryDto,
  AdminSearchQueryDto,
} from '../../common/dto/admin-query.dto';

export class AdminProductQueryDto extends IntersectionType(
  AdminPaginationQueryDto,
  AdminSearchQueryDto,
) {
  @ApiPropertyOptional({ example: 'Filters' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Omit to include active and inactive products.',
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: Boolean, default: false })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  lowStock?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 100000, default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  lowStockThreshold: number = 5;
}

export class AdminCreateProductDto extends CreateProductDto {}

export class AdminUpdateProductDto extends UpdateProductDto {}

/** Documents the multipart variant of the create payload for Swagger. */
export class AdminCreateProductFormDto extends CreateProductFormDto {}

/** Documents the multipart variant of the update payload for Swagger. */
export class AdminUpdateProductFormDto extends UpdateProductFormDto {}
