import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class TechnicianHomeStatsQueryDto {
  @ApiPropertyOptional({
    example: 'America/Toronto',
    default: 'UTC',
    description:
      'IANA timezone used for today, this-week, and this-month boundaries.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;
}
