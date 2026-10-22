import { Module } from '@nestjs/common';
import { TechnicianGuard } from './technician.guard';

@Module({
  providers: [TechnicianGuard],
  exports: [TechnicianGuard],
})
export class TechnicianSharedModule {}
