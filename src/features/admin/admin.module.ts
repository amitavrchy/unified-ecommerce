import { Module } from '@nestjs/common';
import { CloudinaryModule } from '../../service/cloudinary/cloudinary.module';
import { ServiceRequestsModule } from '../service-requests/service-requests.module';
import { AdminGuard } from './admin.guard';
import { AdminCustomersController } from './customers/customers.controller';
import { AdminCustomersService } from './customers/customers.service';
import { AdminDashboardController } from './dashboard/dashboard.controller';
import { AdminDashboardService } from './dashboard/dashboard.service';
import { AdminEquipmentController } from './equipment/equipment.controller';
import { AdminEquipmentService } from './equipment/equipment.service';
import { AdminNotificationsController } from './notifications/notifications.controller';
import { AdminNotificationsService } from './notifications/notifications.service';
import { AdminOrdersController } from './orders/orders.controller';
import { AdminOrdersService } from './orders/orders.service';
import { AdminPaymentsController } from './payments/payments.controller';
import { AdminPaymentsService } from './payments/payments.service';
import { AdminProductsController } from './products/products.controller';
import { AdminProductsService } from './products/products.service';
import { AdminQuoteCounteroffersController } from './quote-counteroffers/quote-counteroffers.controller';
import { AdminQuotationsController } from './quotations/quotations.controller';
import { AdminQuotationsService } from './quotations/quotations.service';
import { AdminReportsController } from './reports/reports.controller';
import { AdminReportsService } from './reports/reports.service';
import { AdminReturnsController } from './returns/returns.controller';
import { AdminReturnsService } from './returns/returns.service';
import { AdminScheduleController } from './schedule/schedule.controller';
import { AdminScheduleService } from './schedule/schedule.service';
import { AdminServiceRequestsController } from './service-requests/service-requests.controller';
import { AdminServiceRequestsService } from './service-requests/service-requests.service';
import { AdminSettingsController } from './settings/settings.controller';
import { PublicSettingsController } from './settings/public-settings.controller';
import { AdminSettingsService } from './settings/settings.service';
import { AdminTechniciansController } from './technicians/technicians.controller';
import { AdminTechniciansService } from './technicians/technicians.service';

@Module({
  imports: [ServiceRequestsModule, CloudinaryModule],
  controllers: [
    AdminDashboardController,
    AdminQuoteCounteroffersController,
    AdminServiceRequestsController,
    AdminQuotationsController,
    AdminScheduleController,
    AdminTechniciansController,
    AdminCustomersController,
    AdminEquipmentController,
    AdminProductsController,
    AdminOrdersController,
    AdminReturnsController,
    AdminPaymentsController,
    AdminReportsController,
    AdminNotificationsController,
    AdminSettingsController,
    PublicSettingsController,
  ],
  providers: [
    AdminDashboardService,
    AdminServiceRequestsService,
    AdminQuotationsService,
    AdminScheduleService,
    AdminTechniciansService,
    AdminCustomersService,
    AdminEquipmentService,
    AdminProductsService,
    AdminOrdersService,
    AdminReturnsService,
    AdminPaymentsService,
    AdminReportsService,
    AdminNotificationsService,
    AdminSettingsService,
    AdminGuard,
  ],
})
export class AdminModule {}
