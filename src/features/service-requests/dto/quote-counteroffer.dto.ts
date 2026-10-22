import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateQuoteCounterofferDto {
  @ApiProperty({
    example: 175,
    minimum: 0.01,
    description: 'Customer-proposed total for the quoted service.',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  requestedTotal!: number;

  @ApiPropertyOptional({
    example: 'Could you complete the service for this amount?',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class DecideQuoteCounterofferDto {
  @ApiPropertyOptional({
    example: 'Approved after reviewing the parts allowance.',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
