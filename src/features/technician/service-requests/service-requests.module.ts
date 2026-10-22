import { Module } from '@nestjs/common';
import { ServiceRequestsModule } from '../../service-requests/service-requests.module';
import { TechnicianSharedModule } from '../technician-shared.module';
import { TechnicianEquipmentModule } from './equipment/equipment.module';
import { TechnicianMediaModule } from './media/media.module';
import { TechnicianNoteModule } from './note/note.module';
import { TechnicianReportModule } from './report/report.module';
import { TechnicianServiceRequestsController } from './service-requests.controller';

@Module({
  imports: [
    ServiceRequestsModule,
    TechnicianSharedModule,
    TechnicianNoteModule,
    TechnicianReportModule,
    TechnicianEquipmentModule,
    TechnicianMediaModule,
  ],
  controllers: [TechnicianServiceRequestsController],
})
export class TechnicianServiceRequestsModule {}
