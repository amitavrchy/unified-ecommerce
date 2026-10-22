import { Module } from '@nestjs/common';
import {
  CheckoutController,
  PaymentsController,
  StripeWebhooksController,
} from './payments.controller';
import { StripeService } from './stripe.service';
import { InvoiceService } from './invoice.service';

@Module({
  controllers: [
    CheckoutController,
    PaymentsController,
    StripeWebhooksController,
  ],
  providers: [StripeService, InvoiceService],
  exports: [StripeService, InvoiceService],
})
export class PaymentsModule {}
