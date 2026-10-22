import { BadRequestException, Injectable } from '@nestjs/common';
import {
  OrderStatus,
  PaymentPurpose,
  PaymentStatus,
  QuoteStatus,
  RequestStatus,
  TechnicianVerificationStatus,
  UserRole,
} from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../database/prisma.service';
import {
  AdminDashboardDateQueryDto,
  AdminDashboardDistributionQueryDto,
  AdminDashboardLimitQueryDto,
  AdminDashboardRangeQueryDto,
  AdminDashboardScheduleQueryDto,
} from './dto/dashboard.dto';

type CalendarDate = { year: number; month: number; day: number };

const REVENUE_PAYMENT_STATUSES = [
  PaymentStatus.CAPTURED,
  PaymentStatus.SUCCEEDED,
  PaymentStatus.PARTIALLY_REFUNDED,
  PaymentStatus.REFUNDED,
];

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(query: AdminDashboardDateQueryDto) {
    const { date, timezone, dayStart, dayEnd } = this.dateContext(query);
    const monthStart = this.toUtc(
      { year: date.year, month: date.month, day: 1 },
      timezone,
    );
    const nextMonth = this.addMonths(
      { year: date.year, month: date.month, day: 1 },
      1,
    );
    const monthEnd = this.toUtc(nextMonth, timezone);

    const [
      newServiceRequests,
      quotationsAwaitingResponse,
      servicesScheduledToday,
      servicesInProgress,
      reportsAwaitingReview,
      revenuePayments,
      ordersAwaitingShipment,
      paymentIssues,
      totalTechnicians,
      availableTechnicians,
      busyAssignments,
    ] = await Promise.all([
      this.prisma.serviceRequest.count({
        where: { status: RequestStatus.NEW },
      }),
      this.prisma.quotation.count({
        where: {
          status: { in: [QuoteStatus.SENT, QuoteStatus.VIEWED] },
          validUntil: { gte: new Date() },
        },
      }),
      this.prisma.serviceRequest.count({
        where: {
          status: RequestStatus.SCHEDULED,
          scheduledStart: { gte: dayStart, lt: dayEnd },
        },
      }),
      this.prisma.serviceRequest.count({
        where: { status: RequestStatus.IN_PROGRESS },
      }),
      this.prisma.serviceRequest.count({
        where: { status: RequestStatus.REPORT_SUBMITTED },
      }),
      this.serviceRevenuePayments(monthStart, monthEnd),
      this.prisma.order.count({
        where: { status: { in: [OrderStatus.PAID, OrderStatus.PROCESSING] } },
      }),
      this.prisma.payment.count({
        where: { status: PaymentStatus.FAILED },
      }),
      this.prisma.user.count({
        where: { role: UserRole.TECHNICIAN, isActive: true },
      }),
      this.prisma.user.findMany({
        where: {
          role: UserRole.TECHNICIAN,
          isActive: true,
          technician: {
            is: {
              isAvailable: true,
              verificationStatus: TechnicianVerificationStatus.VERIFIED,
            },
          },
        },
        select: { id: true },
      }),
      this.prisma.serviceRequest.findMany({
        where: {
          technicianId: { not: null },
          status: {
            in: [RequestStatus.SCHEDULED, RequestStatus.IN_PROGRESS],
          },
          scheduledStart: { gte: dayStart, lt: dayEnd },
        },
        distinct: ['technicianId'],
        select: { technicianId: true },
      }),
    ]);

    const busyIds = new Set(
      busyAssignments
        .map((row) => row.technicianId)
        .filter((id): id is string => Boolean(id)),
    );

    return {
      newServiceRequests,
      quotationsAwaitingResponse,
      servicesScheduledToday,
      servicesInProgress,
      reportsAwaitingReview,
      monthlyServiceRevenue: this.netRevenue(revenuePayments),
      ordersAwaitingShipment,
      paymentIssues,
      totalTechnicians,
      techniciansOnAssignmentToday: busyIds.size,
      techniciansFreeToday: availableTechnicians.filter(
        (technician) => !busyIds.has(technician.id),
      ).length,
      date: this.dateKey(date),
      timezone,
      periodStart: dayStart.toISOString(),
      periodEnd: dayEnd.toISOString(),
    };
  }

  async recentServiceRequests(query: AdminDashboardLimitQueryDto) {
    const limit = query.limit ?? 3;
    const requests = await this.prisma.serviceRequest.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        requestNumber: true,
        status: true,
        createdAt: true,
        customer: { select: { firstName: true, lastName: true } },
        category: { select: { name: true } },
        issue: { select: { name: true } },
      },
    });

    return requests.map((request) => ({
      id: request.id,
      requestNumber: request.requestNumber,
      customerName: this.fullName(request.customer),
      serviceName: request.category.name,
      issueName: request.issue?.name ?? null,
      status: request.status,
      createdAt: request.createdAt,
    }));
  }

  async schedule(query: AdminDashboardScheduleQueryDto) {
    const { dayStart, dayEnd } = this.dateContext(query);
    const requests = await this.prisma.serviceRequest.findMany({
      take: query.limit ?? 3,
      where: {
        scheduledStart: { gte: dayStart, lt: dayEnd },
        status: {
          in: [
            RequestStatus.SCHEDULED,
            RequestStatus.IN_PROGRESS,
            RequestStatus.REPORT_SUBMITTED,
          ],
        },
      },
      orderBy: { scheduledStart: 'asc' },
      select: {
        id: true,
        requestNumber: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        customer: { select: { firstName: true, lastName: true } },
        technician: { select: { firstName: true, lastName: true } },
        category: { select: { name: true } },
      },
    });

    return requests.map((request) => ({
      id: request.id,
      requestNumber: request.requestNumber,
      customerName: this.fullName(request.customer),
      serviceName: request.category.name,
      technicianName: request.technician
        ? this.fullName(request.technician)
        : null,
      status: request.status,
      scheduledStart: request.scheduledStart!,
      scheduledEnd: request.scheduledEnd,
    }));
  }

  async revenue(query: AdminDashboardRangeQueryDto) {
    const range = this.rangeContext(query);
    const payments = await this.serviceRevenuePayments(range.start, range.end);
    const monthTotals = new Map<string, number>();

    for (const payment of payments) {
      const timestamp = payment.capturedAt ?? payment.paidAt;
      if (!timestamp) continue;
      const period = this.monthKey(timestamp, range.timezone);
      monthTotals.set(
        period,
        (monthTotals.get(period) ?? 0) + this.paymentNetAmount(payment),
      );
    }

    const items: { period: string; revenue: number }[] = [];
    let cursor = { year: range.from.year, month: range.from.month, day: 1 };
    const last = { year: range.to.year, month: range.to.month, day: 1 };
    while (this.compareDates(cursor, last) <= 0) {
      const period = `${cursor.year}-${String(cursor.month).padStart(2, '0')}`;
      items.push({
        period,
        revenue: this.money(monthTotals.get(period) ?? 0),
      });
      cursor = this.addMonths(cursor, 1);
    }

    return {
      from: this.dateKey(range.from),
      to: this.dateKey(range.to),
      timezone: range.timezone,
      currency: payments[0]?.currency ?? 'cad',
      total: this.money(items.reduce((sum, item) => sum + item.revenue, 0)),
      items,
    };
  }

  async serviceDistribution(query: AdminDashboardDistributionQueryDto) {
    const range = this.rangeContext(query);
    const groups = await this.prisma.serviceRequest.groupBy({
      by: ['issueId'],
      where: { createdAt: { gte: range.start, lt: range.end } },
      _count: { _all: true },
      orderBy: { _count: { issueId: 'desc' } },
    });
    const total = groups.reduce((sum, group) => sum + group._count._all, 0);
    if (!total) {
      return {
        from: this.dateKey(range.from),
        to: this.dateKey(range.to),
        timezone: range.timezone,
        total: 0,
        items: [],
      };
    }

    const limit = query.limit ?? 5;
    const issueGroups = groups
      .filter(
        (group): group is typeof group & { issueId: string } =>
          group.issueId !== null,
      )
      .sort((a, b) => b._count._all - a._count._all);
    const topGroups = issueGroups.slice(0, limit);
    const issueNames = await this.prisma.serviceIssue.findMany({
      where: { id: { in: topGroups.map((group) => group.issueId) } },
      select: { id: true, name: true },
    });
    const names = new Map(issueNames.map((issue) => [issue.id, issue.name]));
    const items: {
      issueId: string | null;
      name: string;
      count: number;
      percentage: number;
    }[] = topGroups.map((group) => ({
      issueId: group.issueId,
      name: names.get(group.issueId) ?? 'Unknown issue',
      count: group._count._all,
      percentage: this.percentage(group._count._all, total),
    }));
    const shown = topGroups.reduce((sum, group) => sum + group._count._all, 0);
    const otherCount = total - shown;
    if (otherCount > 0) {
      items.push({
        issueId: null,
        name: 'Others',
        count: otherCount,
        percentage: this.percentage(otherCount, total),
      });
    }

    return {
      from: this.dateKey(range.from),
      to: this.dateKey(range.to),
      timezone: range.timezone,
      total,
      items,
    };
  }

  async recentOrders(query: AdminDashboardLimitQueryDto) {
    const orders = await this.prisma.order.findMany({
      take: query.limit ?? 3,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        total: true,
        status: true,
        createdAt: true,
        customer: { select: { firstName: true, lastName: true } },
        payments: {
          take: 1,
          orderBy: { updatedAt: 'desc' },
          select: { status: true, currency: true },
        },
      },
    });

    return orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: this.fullName(order.customer),
      amount: Number(order.total),
      currency: order.payments[0]?.currency ?? 'cad',
      status: order.status,
      paymentStatus: order.payments[0]?.status ?? null,
      createdAt: order.createdAt,
    }));
  }

  private serviceRevenuePayments(start: Date, end: Date) {
    return this.prisma.payment.findMany({
      where: {
        purpose: PaymentPurpose.QUOTATION,
        status: { in: REVENUE_PAYMENT_STATUSES },
        OR: [
          { capturedAt: { gte: start, lt: end } },
          { capturedAt: null, paidAt: { gte: start, lt: end } },
        ],
      },
      select: {
        amount: true,
        refundedAmount: true,
        currency: true,
        capturedAt: true,
        paidAt: true,
      },
    });
  }

  private netRevenue(
    payments: { amount: unknown; refundedAmount: unknown }[],
  ): number {
    return this.money(
      payments.reduce(
        (sum, payment) => sum + this.paymentNetAmount(payment),
        0,
      ),
    );
  }

  private paymentNetAmount(payment: {
    amount: unknown;
    refundedAmount: unknown;
  }): number {
    return Math.max(
      0,
      Number(payment.amount) - Number(payment.refundedAmount ?? 0),
    );
  }

  private dateContext(query: AdminDashboardDateQueryDto) {
    const timezone = this.timezone(query.timezone);
    const date = query.date
      ? this.parseDate(query.date)
      : this.localDate(new Date(), timezone);
    const dayStart = this.toUtc(date, timezone);
    const dayEnd = this.toUtc(this.addDays(date, 1), timezone);
    return { date, timezone, dayStart, dayEnd };
  }

  private rangeContext(query: AdminDashboardRangeQueryDto) {
    const timezone = this.timezone(query.timezone);
    const today = this.localDate(new Date(), timezone);
    const to = query.to ? this.parseDate(query.to) : today;
    const from = query.from
      ? this.parseDate(query.from)
      : this.addMonths({ year: to.year, month: to.month, day: 1 }, -11);
    if (this.compareDates(from, to) > 0) {
      throw new BadRequestException('from must be on or before to');
    }
    return {
      from,
      to,
      timezone,
      start: this.toUtc(from, timezone),
      end: this.toUtc(this.addDays(to, 1), timezone),
    };
  }

  private timezone(value?: string): string {
    const timezone = value ?? 'UTC';
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
      return timezone;
    } catch {
      throw new BadRequestException('timezone must be a valid IANA timezone');
    }
  }

  private parseDate(value: string): CalendarDate {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() + 1 !== month ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException('date values must be valid calendar dates');
    }
    return { year, month, day };
  }

  private localDate(date: Date, timezone: string): CalendarDate {
    const parts = this.dateParts(date, timezone);
    return { year: parts.year, month: parts.month, day: parts.day };
  }

  private toUtc(date: CalendarDate, timezone: string): Date {
    const target = Date.UTC(date.year, date.month - 1, date.day);
    let result = target - this.offsetAt(new Date(target), timezone);
    const correctedOffset = this.offsetAt(new Date(result), timezone);
    if (correctedOffset !== target - result) {
      result = target - correctedOffset;
    }
    return new Date(result);
  }

  private offsetAt(date: Date, timezone: string): number {
    const parts = this.dateParts(date, timezone);
    const representedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    return representedAsUtc - Math.floor(date.getTime() / 1000) * 1000;
  }

  private dateParts(date: Date, timezone: string) {
    const values: Record<string, number> = {};
    for (const part of new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date)) {
      if (part.type !== 'literal') values[part.type] = Number(part.value);
    }
    return {
      year: values.year,
      month: values.month,
      day: values.day,
      hour: values.hour,
      minute: values.minute,
      second: values.second,
    };
  }

  private monthKey(date: Date, timezone: string): string {
    const parts = this.dateParts(date, timezone);
    return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
  }

  private addDays(date: CalendarDate, days: number): CalendarDate {
    const value = new Date(
      Date.UTC(date.year, date.month - 1, date.day + days),
    );
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    };
  }

  private addMonths(date: CalendarDate, months: number): CalendarDate {
    const value = new Date(Date.UTC(date.year, date.month - 1 + months, 1));
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: 1,
    };
  }

  private compareDates(left: CalendarDate, right: CalendarDate): number {
    return (
      Date.UTC(left.year, left.month - 1, left.day) -
      Date.UTC(right.year, right.month - 1, right.day)
    );
  }

  private dateKey(date: CalendarDate): string {
    return `${date.year}-${String(date.month).padStart(2, '0')}-${String(
      date.day,
    ).padStart(2, '0')}`;
  }

  private fullName(user: { firstName: string; lastName: string }): string {
    return `${user.firstName} ${user.lastName}`.trim();
  }

  private percentage(count: number, total: number): number {
    return Math.round((count / total) * 1000) / 10;
  }

  private money(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
