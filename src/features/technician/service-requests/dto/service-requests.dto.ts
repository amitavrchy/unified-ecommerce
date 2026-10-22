import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum TechnicianJobStatus {
  IN_PROGRESS = 'IN_PROGRESS',
}

export class TechnicianUpdateStatusDto {
  @ApiProperty({
    enum: TechnicianJobStatus,
    enumName: 'TechnicianJobStatus',
    example: TechnicianJobStatus.IN_PROGRESS,
    description:
      'Technicians may only start an assigned SCHEDULED job. Report submission advances the request separately.',
  })
  @IsEnum(TechnicianJobStatus)
  status!: TechnicianJobStatus;

  @ApiPropertyOptional({ example: 'Arrived on site and started the visit.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
