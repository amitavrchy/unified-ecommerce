import { Module } from '@nestjs/common';
import { TechnicianHomeModule } from './home/home.module';
import { TechnicianServiceRequestsModule } from './service-requests/service-requests.module';

@Module({
  imports: [TechnicianHomeModule, TechnicianServiceRequestsModule],
})
export class TechnicianModule {}
