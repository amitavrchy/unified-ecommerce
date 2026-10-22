import { Module } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';
import { MediaUploadService } from './media-upload.service';

@Module({
  providers: [CloudinaryService, MediaUploadService],
  exports: [CloudinaryService, MediaUploadService],
})
export class CloudinaryModule {}
