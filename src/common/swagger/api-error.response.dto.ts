import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'Bad Request' })
  error!: string;

  @ApiProperty({ example: ['email must be an email'] })
  message!: string | string[];

  @ApiPropertyOptional({ example: '2026-08-17T12:00:00.000Z' })
  timestamp?: string;
}
