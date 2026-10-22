import { Module } from '@nestjs/common';
import { TechnicianSharedModule } from '../technician-shared.module';
import { TechnicianHomeController } from './home.controller';
import { TechnicianHomeService } from './home.service';

@Module({
  imports: [TechnicianSharedModule],
  controllers: [TechnicianHomeController],
  providers: [TechnicianHomeService],
})
export class TechnicianHomeModule {}
