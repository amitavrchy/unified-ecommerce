import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TechnicianLocationResponseDto {
  @ApiProperty({ example: 'location-id' }) id!: string;
  @ApiProperty({ example: 'technician-user-id' }) technicianId!: string;
  @ApiProperty({ example: 'service-request-id' }) requestId!: string;
  @ApiProperty({ example: 43.6426 }) latitude!: number;
  @ApiProperty({ example: -79.3871 }) longitude!: number;
  @ApiPropertyOptional({ nullable: true, example: 180 }) heading!:
    number | null;
  @ApiProperty({ type: String, format: 'date-time' }) capturedAt!: string;
}
