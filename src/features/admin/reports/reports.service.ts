import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Prisma } from '../../../../generated/prisma/client';
import {
  PaymentPurpose,
  PaymentStatus,
  QuoteStatus,
  RequestStatus,
  UserRole,
} from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../database/prisma.service';
import {
  adminPreviousUtcRange,
  adminUtcRange,
} from '../common/admin-date-range';
import type { AdminReportQueryDto } from './dto/reports.dto';

const REVENUE_STATUSES = [
  PaymentStatus.SUCCEEDED,
  PaymentStatus.CAPTURED,
  PaymentStatus.REFUNDED,
  PaymentStatus.PARTIALLY_REFUNDED,
];

@Injectable()
export class AdminReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(query: AdminReportQueryDto) {
    const current = await this.buildSnapshot(query);
    const previousRange = adminPreviousUtcRange(
      query.from,
      query.to,
      query.timezone,
    );
    const previous = await this.buildSnapshot({
      ...query,
      from: previousRange.from,
      to: previousRange.to,
    });
    return {
      ...current,
      trends: {
        averageQuoteAcceptance: this.trend(
          current.averageQuoteAcceptance,
          previous.averageQuoteAcceptance,
        ),
        averageServiceValue: this.trend(
          current.averageServiceValue,
          previous.averageServiceValue,
        ),
        technicianUtilization: this.trend(
          current.technicianUtilization,
          previous.technicianUtilization,
        ),
        storeNetRevenue: this.trend(
          current.store.netRevenue,
          previous.store.netRevenue,
        ),
        serviceRevenue: this.trend(
          current.services.serviceRevenue,
          previous.services.serviceRevenue,
        ),
      },
    };
  }

  private async buildSnapshot(query: AdminReportQueryDto) {
    const range = adminUtcRange(query.from, query.to, query.timezone);
    const requestRelation = {
      ...(query.technicianId ? { technicianId: query.technicianId } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    };
    const paymentScope =
      query.technicianId || query.categoryId
        ? { quotation: { is: { request: { is: requestRelation } } } }
        : {};
    const [
      revenuePayments,
      statusPayments,
      requests,
      scheduledRequests,
      orders,
      technicianCount,
    ] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          status: { in: REVENUE_STATUSES },
          ...paymentScope,
          OR: [
            { capturedAt: { gte: range.start, lt: range.end } },
            { paidAt: { gte: range.start, lt: range.end } },
            { createdAt: { gte: range.start, lt: range.end } },
          ],
        },
      }),
      query.paymentStatus
        ? this.prisma.payment.findMany({
            where: {
              status: query.paymentStatus,
              ...paymentScope,
              createdAt: { gte: range.start, lt: range.end },
            },
          })
        : Promise.resolve([] as { amount: Prisma.Decimal }[]),
      this.prisma.serviceRequest.findMany({
        where: {
          createdAt: { gte: range.start, lt: range.end },
          ...requestRelation,
        },
        include: { category: true, quotation: true },
      }),
      this.prisma.serviceRequest.findMany({
        where: {
          ...requestRelation,
          scheduledStart: { not: null, lt: range.end },
          scheduledEnd: { not: null, gt: range.start },
        },
        select: { scheduledStart: true, scheduledEnd: true },
      }),
      query.technicianId || query.categoryId
        ? Promise.resolve([] as { createdAt: Date }[])
        : this.prisma.order.findMany({
            where: { createdAt: { gte: range.start, lt: range.end } },
          }),
      query.technicianId
        ? Promise.resolve(1)
        : this.prisma.user.count({
            where: {
              role: UserRole.TECHNICIAN,
              isActive: true,
              technician: { is: { verificationStatus: 'VERIFIED' } },
            },
          }),
    ]);

    const normalizedPayments = revenuePayments
      .map((payment) => ({
        payment,
        occurredAt: payment.capturedAt ?? payment.paidAt ?? payment.createdAt,
      }))
      .filter(
        ({ occurredAt }) => occurredAt >= range.start && occurredAt < range.end,
      );
    const currency =
      normalizedPayments[0]?.payment.currency ??
      (process.env.STRIPE_CURRENCY ?? 'cad').toLowerCase();
    const periods = this.monthPeriods(query.from, query.to);
    const revenueByMonth = new Map(
      periods.map((period) => [period, new Prisma.Decimal(0)]),
    );
    for (const item of normalizedPayments) {
      const net = item.payment.amount.minus(item.payment.refundedAmount);
      const period = this.localMonth(item.occurredAt, range.timezone);
      revenueByMonth.set(
        period,
        (revenueByMonth.get(period) ?? new Prisma.Decimal(0)).plus(net),
      );
    }

    const ordersByMonth = new Map(periods.map((period) => [period, 0]));
    for (const order of orders) {
      const period = this.localMonth(order.createdAt, range.timezone);
      ordersByMonth.set(period, (ordersByMonth.get(period) ?? 0) + 1);
    }

    const distribution = new Map<string, number>();
    for (const request of requests)
      distribution.set(
        request.category.name,
        (distribution.get(request.category.name) ?? 0) + 1,
      );
    const acceptedQuotes = requests.filter(
      (request) => request.quotation?.status === QuoteStatus.ACCEPTED,
    );
    const resolvedQuoteStatuses: QuoteStatus[] = [
      QuoteStatus.ACCEPTED,
      QuoteStatus.REJECTED,
      QuoteStatus.EXPIRED,
      QuoteStatus.CANCELLED,
    ];
    const respondedQuotes = requests.filter((request) =>
      request.quotation
        ? resolvedQuoteStatuses.includes(request.quotation.status)
        : false,
    );
    const servicePayments = normalizedPayments.filter(
      ({ payment }) => payment.purpose === PaymentPurpose.QUOTATION,
    );
    const storePayments = normalizedPayments.filter(
      ({ payment }) => payment.purpose === PaymentPurpose.ORDER,
    );
    const serviceRevenue = this.netTotal(servicePayments);
    const grossStoreRevenue = this.amountTotal(storePayments);
    const storeRefunds = this.refundTotal(storePayments);
    const netStoreRevenue = grossStoreRevenue.minus(storeRefunds);
    const scheduledHours = scheduledRequests.reduce((total, request) => {
      if (!request.scheduledStart || !request.scheduledEnd) return total;
      const start = new Date(
        Math.max(request.scheduledStart.getTime(), range.start.getTime()),
      );
      const end = new Date(
        Math.min(request.scheduledEnd.getTime(), range.end.getTime()),
      );
      return total + Math.max(0, end.getTime() - start.getTime()) / 3_600_000;
    }, 0);
    const availableHours =
      this.workdays(query.from, query.to) * 8 * technicianCount;
    const completed = requests.filter(
      (request) => request.status === RequestStatus.COMPLETED,
    ).length;
    const filteredAmount = statusPayments.reduce(
      (total, payment) => total.plus(payment.amount),
      new Prisma.Decimal(0),
    );

    return {
      filters: {
        from: query.from,
        to: query.to,
        timezone: range.timezone,
        technicianId: query.technicianId ?? null,
        categoryId: query.categoryId ?? null,
        paymentStatus: query.paymentStatus ?? null,
      },
      currency,
      revenueSeries: periods.map((period) => ({
        period,
        value: this.money(revenueByMonth.get(period)),
      })),
      serviceDistribution: [...distribution.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({
          name,
          count,
          percentage: requests.length
            ? this.percent(count / requests.length)
            : 0,
        })),
      monthlyOrders: periods.map((period) => ({
        period,
        value: ordersByMonth.get(period) ?? 0,
      })),
      averageQuoteAcceptance: respondedQuotes.length
        ? this.percent(acceptedQuotes.length / respondedQuotes.length)
        : 0,
      averageServiceValue: servicePayments.length
        ? this.money(serviceRevenue.div(servicePayments.length))
        : 0,
      technicianUtilization: availableHours
        ? this.percent(Math.min(1, scheduledHours / availableHours))
        : 0,
      paymentActivity: {
        status: query.paymentStatus ?? null,
        count: statusPayments.length,
        amount: this.money(filteredAmount),
      },
      store: {
        orders: orders.length,
        grossRevenue: this.money(grossStoreRevenue),
        refunds: this.money(storeRefunds),
        netRevenue: this.money(netStoreRevenue),
        averageOrderValue: orders.length
          ? this.money(netStoreRevenue.div(orders.length))
          : 0,
      },
      services: {
        requests: requests.length,
        completed,
        acceptedQuotes: acceptedQuotes.length,
        serviceRevenue: this.money(serviceRevenue),
        averageServiceValue: servicePayments.length
          ? this.money(serviceRevenue.div(servicePayments.length))
          : 0,
      },
    };
  }

  async csv(query: AdminReportQueryDto) {
    const report = await this.overview(query);
    const rows: (string | number)[][] = [
      ['section', 'metric', 'period_or_name', 'value', 'count', 'percentage'],
      ...report.revenueSeries.map((item) => [
        'revenue',
        'net_revenue',
        item.period,
        item.value,
        '',
        '',
      ]),
      ...report.monthlyOrders.map((item) => [
        'store',
        'orders',
        item.period,
        item.value,
        '',
        '',
      ]),
      ...report.serviceDistribution.map((item) => [
        'services',
        'distribution',
        item.name,
        '',
        item.count,
        item.percentage,
      ]),
      ...Object.entries(report.store).map(([metric, value]) => [
        'store',
        metric,
        '',
        value,
        '',
        '',
      ]),
      ...Object.entries(report.services).map(([metric, value]) => [
        'services',
        metric,
        '',
        value,
        '',
        '',
      ]),
      [
        'services',
        'averageQuoteAcceptance',
        '',
        report.averageQuoteAcceptance,
        '',
        '',
      ],
      [
        'services',
        'technicianUtilization',
        '',
        report.technicianUtilization,
        '',
        '',
      ],
      ...Object.entries(report.trends).map(([metric, trend]) => [
        'trend',
        metric,
        '',
        trend.deltaPercent,
        trend.previous,
        trend.current,
      ]),
    ];
    return rows
      .map((row) => row.map((value) => this.csvCell(value)).join(','))
      .join('\n');
  }

  async pdf(query: AdminReportQueryDto): Promise<Buffer> {
    const report = await this.overview(query);
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({ margin: 48, size: 'LETTER' });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('error', reject);
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.fontSize(20).text('Admin business report');
      document
        .fontSize(10)
        .text(
          `${report.filters.from} to ${report.filters.to} (${report.filters.timezone})`,
        )
        .moveDown();
      document.fontSize(14).text('Service metrics');
      for (const [key, value] of Object.entries(report.services))
        document.fontSize(10).text(`${key}: ${value}`);
      document
        .text(`quote acceptance: ${report.averageQuoteAcceptance}%`)
        .text(`technician utilization: ${report.technicianUtilization}%`)
        .moveDown();
      document.fontSize(14).text('Store metrics');
      for (const [key, value] of Object.entries(report.store))
        document.fontSize(10).text(`${key}: ${value}`);
      document.moveDown().fontSize(14).text('KPI trends vs prior period');
      for (const [key, trend] of Object.entries(report.trends))
        document
          .fontSize(10)
          .text(
            `${key}: ${trend.current} (prev ${trend.previous}, ${trend.deltaPercent}%)`,
          );
      document.moveDown().fontSize(14).text('Revenue by month');
      for (const item of report.revenueSeries)
        document.fontSize(10).text(`${item.period}: ${item.value}`);
      document.moveDown().fontSize(14).text('Service distribution');
      for (const item of report.serviceDistribution)
        document
          .fontSize(10)
          .text(`${item.name}: ${item.count} (${item.percentage}%)`);
      document.end();
    });
  }

  private trend(current: number, previous: number) {
    const delta = Number((current - previous).toFixed(2));
    const deltaPercent =
      previous === 0
        ? current === 0
          ? 0
          : 100
        : Number(((delta / previous) * 100).toFixed(2));
    return { current, previous, delta, deltaPercent };
  }

  private netTotal(
    items: {
      payment: { amount: Prisma.Decimal; refundedAmount: Prisma.Decimal };
    }[],
  ) {
    return items.reduce(
      (total, { payment }) =>
        total.plus(payment.amount.minus(payment.refundedAmount)),
      new Prisma.Decimal(0),
    );
  }

  private amountTotal(
    items: { payment: { amount: Prisma.Decimal } }[],
  ): Prisma.Decimal {
    return items.reduce(
      (total, { payment }) => total.plus(payment.amount),
      new Prisma.Decimal(0),
    );
  }

  private refundTotal(
    items: { payment: { refundedAmount: Prisma.Decimal } }[],
  ): Prisma.Decimal {
    return items.reduce(
      (total, { payment }) => total.plus(payment.refundedAmount),
      new Prisma.Decimal(0),
    );
  }

  private money(value: Prisma.Decimal | undefined) {
    return Number((value ?? new Prisma.Decimal(0)).toFixed(2));
  }

  private percent(value: number) {
    return Number((value * 100).toFixed(2));
  }

  private localMonth(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(date);
    const year = parts.find((part) => part.type === 'year')!.value;
    const month = parts.find((part) => part.type === 'month')!.value;
    return `${year}-${month}`;
  }

  private monthPeriods(from: string, to: string) {
    const [fromYear, fromMonth] = from.split('-').map(Number);
    const [toYear, toMonth] = to.split('-').map(Number);
    const periods: string[] = [];
    for (
      let cursor = new Date(Date.UTC(fromYear, fromMonth - 1, 1));
      cursor <= new Date(Date.UTC(toYear, toMonth - 1, 1));
      cursor = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
      )
    )
      periods.push(
        `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`,
      );
    return periods;
  }

  private workdays(from: string, to: string) {
    const cursor = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    let count = 0;
    while (cursor <= end) {
      if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) count++;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return count;
  }

  private csvCell(value: string | number) {
    const text = String(value);
    return `"${text.replaceAll('"', '""')}"`;
  }
}
