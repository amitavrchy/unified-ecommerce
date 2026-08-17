import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
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
} from '../../../generated/prisma/enums';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { PrismaService } from '../../database/prisma.service';
import { BroadcastNotificationDto } from './dto/admin.dto';
import {
  AdminDashboardResponseDto,
  BroadcastNotificationResponseDto,
} from './dto/admin-response.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('dashboard')
  @ApiOperation({
    summary:
      'Get aggregate operations and financial dashboard metrics (admin only)',
  })
  @ApiOkResponse({ type: AdminDashboardResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async dashboard(@CurrentUser() user: AuthUser) {
    this.admin(user);
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

  @Post('notifications/broadcast')
  @ApiOperation({
    summary: 'Broadcast an in-app notification to selected roles (admin only)',
  })
  @ApiCreatedResponse({ type: BroadcastNotificationResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async broadcast(
    @CurrentUser() user: AuthUser,
    @Body() dto: BroadcastNotificationDto,
  ) {
    this.admin(user);
    const recipients = await this.prisma.user.findMany({
      where: {
        isActive: true,
        ...(dto.roles?.length ? { role: { in: dto.roles } } : {}),
      },
      select: { id: true },
    });
    if (recipients.length) {
      await this.prisma.notification.createMany({
        data: recipients.map((recipient) => ({
          userId: recipient.id,
          title: dto.title,
          body: dto.body,
        })),
      });
    }
    return { recipients: recipients.length };
  }

  private admin(user: AuthUser) {
    if (user.role !== UserRole.ADMIN)
      throw new ForbiddenException('Only administrators can use this action');
  }
}
