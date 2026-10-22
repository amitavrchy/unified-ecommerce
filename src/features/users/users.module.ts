import { Module } from '@nestjs/common';
import { CloudinaryModule } from '../../service/cloudinary/cloudinary.module';
import { UsersController } from './users.controller';
@Module({
  imports: [CloudinaryModule],
  controllers: [UsersController],
})
export class UsersModule {}
