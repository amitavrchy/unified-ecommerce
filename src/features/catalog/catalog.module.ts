import { Module } from '@nestjs/common';
import { CloudinaryModule } from '../../service/cloudinary/cloudinary.module';
import { CatalogController } from './catalog.controller';
@Module({
  imports: [CloudinaryModule],
  controllers: [CatalogController],
})
export class CatalogModule {}
