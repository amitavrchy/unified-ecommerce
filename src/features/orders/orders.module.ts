import { Module } from '@nestjs/common';
import { CloudinaryModule } from '../../service/cloudinary/cloudinary.module';
import { CartModule } from '../cart/cart.module';
import { PaymentsModule } from '../payments/payments.module';
import { OrdersController } from './orders.controller';
@Module({
  imports: [PaymentsModule, CartModule, CloudinaryModule],
  controllers: [OrdersController],
})
export class OrdersModule {}
