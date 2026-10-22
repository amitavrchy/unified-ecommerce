import { Module } from '@nestjs/common';
import { CloudinaryModule } from '../../service/cloudinary/cloudinary.module';
import { ChatController } from './chat.controller';

@Module({ imports: [CloudinaryModule], controllers: [ChatController] })
export class ChatModule {}
