import { Module } from '@nestjs/common';
import {
  CheckoutController,
  PaymentsController,
  StripeWebhooksController,
} from './payments.controller';
import { StripeService } from './stripe.service';

@Module({
  controllers: [
    CheckoutController,
    PaymentsController,
    StripeWebhooksController,
  ],
  providers: [StripeService],
  exports: [StripeService],
})
export class PaymentsModule {}
