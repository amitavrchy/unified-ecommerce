import { Module } from '@nestjs/common';
import { ServiceRequestsModule } from '../../../service-requests/service-requests.module';
import { TechnicianSharedModule } from '../../technician-shared.module';
import { TechnicianEquipmentController } from './equipment.controller';

@Module({
  imports: [ServiceRequestsModule, TechnicianSharedModule],
  controllers: [TechnicianEquipmentController],
})
export class TechnicianEquipmentModule {}
