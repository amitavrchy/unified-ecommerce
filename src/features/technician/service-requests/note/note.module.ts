import { Module } from '@nestjs/common';
import { ServiceRequestsModule } from '../../../service-requests/service-requests.module';
import { TechnicianSharedModule } from '../../technician-shared.module';
import { TechnicianNoteController } from './note.controller';

@Module({
  imports: [ServiceRequestsModule, TechnicianSharedModule],
  controllers: [TechnicianNoteController],
})
export class TechnicianNoteModule {}
