import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class AdminPaginationQueryDto {
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

export class AdminSearchQueryDto {
  @ApiPropertyOptional({
    example: 'SR-1048',
    description: 'Case-insensitive search text interpreted by the resource.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class AdminDateRangeQueryDto {
  @ApiPropertyOptional({
    example: '2026-08-01',
    description: 'Inclusive local start date in YYYY-MM-DD format.',
  })
  @IsOptional()
  @Matches(ISO_DATE_PATTERN)
  from?: string;

  @ApiPropertyOptional({
    example: '2026-08-31',
    description: 'Inclusive local end date in YYYY-MM-DD format.',
  })
  @IsOptional()
  @Matches(ISO_DATE_PATTERN)
  to?: string;

  @ApiPropertyOptional({
    example: 'America/Toronto',
    default: 'UTC',
    description: 'IANA timezone used to interpret date boundaries.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;
}

export class AdminListQueryDto extends IntersectionType(
  AdminPaginationQueryDto,
  IntersectionType(AdminSearchQueryDto, AdminDateRangeQueryDto),
) {}
