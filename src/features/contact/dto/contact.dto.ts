import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitContactDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ example: '+1 416 555 0100' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ example: 'installation' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  service?: string;

  @ApiProperty({ example: 'I need a quote for a new central vacuum.' })
  @IsString()
  @MaxLength(4000)
  message!: string;
}
