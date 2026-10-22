import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../../../../generated/prisma/enums';
import { ISO_DATE_PATTERN } from '../../common/dto/admin-query.dto';

export class AdminNotificationQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: 100,
    default: 25,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unreadOnly?: boolean;

  @ApiPropertyOptional({ example: '2026-08-20' })
  @IsOptional()
  @Matches(ISO_DATE_PATTERN)
  date?: string;

  @ApiPropertyOptional({ example: 'America/Toronto', default: 'UTC' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class BroadcastNotificationDto {
  @ApiProperty({ example: 'Holiday service hours' })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: 'Our office will be closed on Monday.' })
  @IsString()
  @MaxLength(2000)
  body!: string;

  @ApiPropertyOptional({
    type: [String],
    enum: UserRole,
    example: [UserRole.CUSTOMER],
  })
  @IsOptional()
  @IsArray()
  roles?: UserRole[];
}
