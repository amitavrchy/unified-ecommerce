import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatAttachmentDto {
  @ApiProperty({
    format: 'uri',
    example: 'https://uploads.example.com/chat/photo.jpg',
  })
  @IsUrl({ require_tld: false })
  url!: string;
}

export class SendMessageDto {
  @ApiProperty({ example: 'I will arrive within 20 minutes.', maxLength: 4000 })
  @IsString()
  @MaxLength(4000)
  body!: string;

  @ApiPropertyOptional({ type: [ChatAttachmentDto], maxItems: 5 })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatAttachmentDto)
  attachments?: ChatAttachmentDto[];
}
