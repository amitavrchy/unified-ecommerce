import { ApiProperty } from '@nestjs/swagger';

export class TechnicianNoteResponseDto {
  @ApiProperty({ example: 'note-id' })
  id!: string;

  @ApiProperty({ example: 'request-id' })
  requestId!: string;

  @ApiProperty({
    example: 'Customer asked to check the garage inlet on the next visit.',
  })
  text!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}
