import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  OrderStatus,
  PaymentStatus,
  RequestStatus,
  UserRole,
} from '../../../../generated/prisma/enums';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { ApiErrorResponseDto } from '../../../common/dto/api-response.dto';
import { PrismaService } from '../../../database/prisma.service';
import { AdminGuard } from '../admin.guard';
import { AdminDashboardService } from './dashboard.service';
import {
  AdminDashboardDateQueryDto,
  AdminDashboardDistributionQueryDto,
  AdminDashboardLimitQueryDto,
  AdminDashboardRangeQueryDto,
  AdminDashboardScheduleQueryDto,
} from './dto/dashboard.dto';
import {
  AdminDashboardResponseDto,
  AdminDashboardScheduleItemResponseDto,
  AdminDashboardSummaryResponseDto,
  AdminRecentOrderResponseDto,
  AdminRecentServiceRequestResponseDto,
  AdminRevenueSeriesResponseDto,
  AdminServiceDistributionResponseDto,
} from './dto/dashboard-response.dto';

@ApiTags('Admin Dashboard')
@ApiBearerAuth()
@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
export class AdminDashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: AdminDashboardService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Get aggregate operations and financial dashboard metrics (admin only)',
  })
  @ApiOkResponse({ type: AdminDashboardResponseDto })
  async overview() {
    const [
      customers,
      technicians,
      techniciansPendingVerification,
      activeServiceRequests,
      pendingOrders,
      products,
      paymentSummary,
      completedPayments,
      requestGroups,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: UserRole.CUSTOMER } }),
      this.prisma.user.count({ where: { role: UserRole.TECHNICIAN } }),
      this.prisma.technicianProfile.count({
        where: { verificationStatus: 'PENDING_VERIFICATION' },
      }),
      this.prisma.serviceRequest.count({
        where: {
          status: { notIn: [RequestStatus.COMPLETED, RequestStatus.CANCELLED] },
        },
      }),
      this.prisma.order.count({
        where: {
          status: {
            in: [
              OrderStatus.PAYMENT_PENDING,
              OrderStatus.PAID,
              OrderStatus.PROCESSING,
            ],
          },
        },
      }),
      this.prisma.product.count(),
      this.prisma.payment.aggregate({
        where: {
          status: { in: [PaymentStatus.SUCCEEDED, PaymentStatus.CAPTURED] },
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.count({
        where: {
          status: { in: [PaymentStatus.SUCCEEDED, PaymentStatus.CAPTURED] },
        },
      }),
      this.prisma.serviceRequest.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);
    return {
      customers,
      technicians,
      techniciansPendingVerification,
      activeServiceRequests,
      pendingOrders,
      products,
      capturedRevenue: Number(paymentSummary._sum.amount ?? 0),
      completedPayments,
      requestStatusCounts: Object.fromEntries(
        requestGroups.map((group) => [group.status, group._count._all]),
      ),
    };
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Get the independent KPI cards for the admin dashboard',
  })
  @ApiOkResponse({ type: AdminDashboardSummaryResponseDto })
  summary(@Query() query: AdminDashboardDateQueryDto) {
    return this.dashboard.summary(query);
  }

  @Get('recent-service-requests')
  @ApiOperation({ summary: 'Get recent service requests for the dashboard' })
  @ApiOkResponse({
    type: AdminRecentServiceRequestResponseDto,
    isArray: true,
  })
  recentServiceRequests(@Query() query: AdminDashboardLimitQueryDto) {
    return this.dashboard.recentServiceRequests(query);
  }

  @Get('schedule')
  @ApiOperation({ summary: 'Get the admin schedule for one local date' })
  @ApiOkResponse({ type: AdminDashboardScheduleItemResponseDto, isArray: true })
  schedule(@Query() query: AdminDashboardScheduleQueryDto) {
    return this.dashboard.schedule(query);
  }

  @Get('revenue')
  @ApiOperation({
    summary: 'Get monthly net service revenue for a local date range',
  })
  @ApiOkResponse({ type: AdminRevenueSeriesResponseDto })
  revenue(@Query() query: AdminDashboardRangeQueryDto) {
    return this.dashboard.revenue(query);
  }

  @Get('service-distribution')
  @ApiOperation({
    summary: 'Get top service issues and an Others bucket',
  })
  @ApiOkResponse({ type: AdminServiceDistributionResponseDto })
  serviceDistribution(@Query() query: AdminDashboardDistributionQueryDto) {
    return this.dashboard.serviceDistribution(query);
  }

  @Get('recent-orders')
  @ApiOperation({ summary: 'Get recent store orders for the dashboard' })
  @ApiOkResponse({ type: AdminRecentOrderResponseDto, isArray: true })
  recentOrders(@Query() query: AdminDashboardLimitQueryDto) {
    return this.dashboard.recentOrders(query);
  }
}
