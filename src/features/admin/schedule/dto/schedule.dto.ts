import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { RequestStatus } from '../../../../../generated/prisma/enums';
import { ISO_DATE_PATTERN } from '../../common/dto/admin-query.dto';

export class AdminScheduleQueryDto {
  @ApiProperty({
    example: '2026-08-01',
    description: 'Inclusive local start date in YYYY-MM-DD format.',
  })
  @Matches(ISO_DATE_PATTERN)
  from!: string;

  @ApiProperty({
    example: '2026-08-31',
    description: 'Inclusive local end date in YYYY-MM-DD format.',
  })
  @Matches(ISO_DATE_PATTERN)
  to!: string;

  @ApiPropertyOptional({
    example: 'America/Toronto',
    default: 'UTC',
    description: 'IANA timezone used to interpret date boundaries.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() technicianId?: string;

  @ApiPropertyOptional({ enum: RequestStatus, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(RequestStatus, { each: true })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((item: unknown) => String(item))
      : String(value).split(',').filter(Boolean),
  )
  status?: RequestStatus[];
}
