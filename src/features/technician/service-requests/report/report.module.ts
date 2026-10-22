import { Module } from '@nestjs/common';
import { ServiceRequestsModule } from '../../../service-requests/service-requests.module';
import { TechnicianSharedModule } from '../../technician-shared.module';
import { TechnicianReportController } from './report.controller';

@Module({
  imports: [ServiceRequestsModule, TechnicianSharedModule],
  controllers: [TechnicianReportController],
})
export class TechnicianReportModule {}
