import {
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiBinaryFiles } from '../../../common/dto/api-file.decorator';
import { JsonArray } from '../../../common/dto/multipart.transform';

export class ChatAttachmentDto {
  @ApiProperty({
    format: 'uri',
    example: 'https://uploads.example.com/chat/photo.jpg',
  })
  @IsUrl({ require_tld: false })
  url!: string;
}

export class SendMessageDto {
  @ApiPropertyOptional({
    example: 'I will arrive within 20 minutes.',
    maxLength: 4000,
    description: 'Optional when the message includes attachments.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @ApiPropertyOptional({
    type: [ChatAttachmentDto],
    maxItems: 5,
    description:
      'Already-hosted attachment URLs. On multipart requests send this as a JSON string.',
  })
  @IsOptional()
  @JsonArray(ChatAttachmentDto)
  @IsArray()
  @ValidateNested({ each: true })
  attachments?: ChatAttachmentDto[];
}

/**
 * Documents the multipart variant of `SendMessageDto` for Swagger. The file
 * fields are consumed by the upload interceptor, never by the validation pipe.
 */
export class SendMessageFormDto extends SendMessageDto {
  @ApiBinaryFiles('Image attachments. Each file must be an image/* type.')
  images?: unknown[];

  @ApiBinaryFiles('Video attachments. Each file must be a video/* type.')
  videos?: unknown[];
}
