import { ApiProperty } from '@nestjs/swagger';

export class DatabaseHealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: string;
}
