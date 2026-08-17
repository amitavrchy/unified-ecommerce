import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AdminModule } from './features/admin/admin.module';
import { AuthModule } from './features/auth/auth.module';
import { CartModule } from './features/cart/cart.module';
import { ChatModule } from './features/chat/chat.module';
import { CallsModule } from './features/calls/calls.module';
import { CatalogModule } from './features/catalog/catalog.module';
import { NotificationsModule } from './features/notifications/notifications.module';
import { OrdersModule } from './features/orders/orders.module';
import { PaymentsModule } from './features/payments/payments.module';
import { ServiceRequestsModule } from './features/service-requests/service-requests.module';
import { TrackingModule } from './features/tracking/tracking.module';
import { UsersModule } from './features/users/users.module';

@Module({
  imports: [
    DatabaseModule,
    AdminModule,
    AuthModule,
    CartModule,
    ChatModule,
    UsersModule,
    CatalogModule,
    ServiceRequestsModule,
    TrackingModule,
    CallsModule,
    OrdersModule,
    PaymentsModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
