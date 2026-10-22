import { Module } from '@nestjs/common';
import { ServiceRequestsModule } from '../../../service-requests/service-requests.module';
import { TechnicianSharedModule } from '../../technician-shared.module';
import { TechnicianMediaController } from './media.controller';

@Module({
  imports: [ServiceRequestsModule, TechnicianSharedModule],
  controllers: [TechnicianMediaController],
})
export class TechnicianMediaModule {}
