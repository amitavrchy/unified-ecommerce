import { Module } from '@nestjs/common';
import { CloudinaryModule } from '../../service/cloudinary/cloudinary.module';
import { PaymentsModule } from '../payments/payments.module';
import { CustomerGuard } from './customer.guard';
import { QuoteCounterofferService } from './quote-counteroffer.service';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
@Module({
  imports: [PaymentsModule, CloudinaryModule],
  controllers: [RequestsController],
  providers: [QuoteCounterofferService, RequestsService, CustomerGuard],
  exports: [QuoteCounterofferService, RequestsService],
})
export class ServiceRequestsModule {}
