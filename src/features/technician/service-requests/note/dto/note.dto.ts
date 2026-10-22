import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TechnicianNoteDto {
  @ApiProperty({
    example: 'Customer asked to check the garage inlet on the next visit.',
    maxLength: 5000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  text!: string;
}
