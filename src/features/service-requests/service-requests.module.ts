import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { RequestsController } from './requests.controller';
@Module({ imports: [PaymentsModule], controllers: [RequestsController] })
export class ServiceRequestsModule {}
