import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MediaKind } from '../../../../../../generated/prisma/enums';
import { ApiRequiredBinaryFile } from '../../../../../common/dto/api-file.decorator';

export const TECHNICIAN_MEDIA_KINDS = [
  MediaKind.BEFORE,
  MediaKind.AFTER,
  MediaKind.EQUIPMENT,
  MediaKind.INLET,
] as const;

export class TechnicianMediaDto {
  @ApiProperty({
    enum: TECHNICIAN_MEDIA_KINDS,
    example: MediaKind.BEFORE,
    description: 'Issue photos are customer-only.',
  })
  @IsIn(TECHNICIAN_MEDIA_KINDS)
  kind!: (typeof TECHNICIAN_MEDIA_KINDS)[number];
}

export class TechnicianMediaFormDto extends TechnicianMediaDto {
  @ApiRequiredBinaryFile(
    'Image or video file. Uploaded to Cloudinary; a URL is not accepted.',
  )
  file!: unknown;
}
