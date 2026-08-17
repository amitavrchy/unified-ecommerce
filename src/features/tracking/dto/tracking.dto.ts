import {
  IsDateString,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLocationDto {
  @ApiProperty({ example: 43.6426, minimum: -90, maximum: 90 })
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: -79.3871, minimum: -180, maximum: 180 })
  @IsLongitude()
  longitude!: number;

  @ApiPropertyOptional({ example: 180, minimum: 0, maximum: 360 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(360)
  heading?: number;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  capturedAt?: string;
}
