import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentPurpose, PaymentStatus, UserRole } from '../../../generated/prisma/enums';
import type { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../database/prisma.service';
import { checkoutTaxRate } from './order-pricing';
import type { InvoiceResponseDto } from './dto/invoice.dto';

function money(value: unknown) {
  return Number(Number(value || 0).toFixed(2));
}

function invoiceNumber(paymentId: string, createdAt: Date) {
  const suffix = paymentId.replace(/[^a-zA-Z0-9]/g, '').slice(-3).toUpperCase();
  return `INV-${createdAt.getFullYear()}-${suffix.padStart(3, '0')}`;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatShortDate(value: Date | string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDuration(start?: Date | null, end?: Date | null) {
  if (!start || !end) return '—';
  const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours}h ${rest}m`;
  if (hours) return `${hours}h`;
  return `${rest}m`;
}

function addressLines(address?: {
  line1?: string | null;
  apartment?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
} | null) {
  if (!address) return [];
  const street = [address.line1, address.apartment].filter(Boolean).join(', ');
  const locality = [address.city, address.state]
    .filter(Boolean)
    .join(', ');
  const cityLine = [locality, address.zipCode].filter(Boolean).join(' ');
  return [street, cityLine].filter(Boolean);
}

function statusLabel(status: PaymentStatus) {
  if (
    status === PaymentStatus.SUCCEEDED ||
    status === PaymentStatus.CAPTURED
  ) {
    return 'PAID';
  }
  if (status === PaymentStatus.AUTHORIZED) return 'AUTHORIZED';
  if (
    status === PaymentStatus.REFUNDED ||
    status === PaymentStatus.PARTIALLY_REFUNDED
  ) {
    return 'REFUNDED';
  }
  if (status === PaymentStatus.FAILED) return 'FAILED';
  return 'PENDING';
}

@Injectable()
export class InvoiceService {
  constructor(private readonly prisma: PrismaService) {}

  async forPayment(user: AuthUser, paymentId: string): Promise<InvoiceResponseDto> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true },
        },
        order: {
          include: { items: { include: { product: true } } },
        },
        quotation: {
          include: {
            request: {
              include: {
                category: true,
                address: true,
                technician: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (user.role !== UserRole.ADMIN && payment.userId !== user.id) {
      throw new ForbiddenException();
    }

    const settings = await this.prisma.businessSettings.findUnique({
      where: { id: 1 },
    });
    const vendorAddress = settings?.businessAddress
      ? settings.businessAddress.split('\n').filter(Boolean)
      : ['123 Elite Plaza, Wellness Drive', 'Greenwich, CT 06830'];

    const billAddress =
      payment.purpose === PaymentPurpose.ORDER
        ? addressLines(
            payment.order?.shippingAddress as {
              line1?: string;
              apartment?: string | null;
              city?: string;
              state?: string;
              zipCode?: string;
            } | null,
          )
        : addressLines(payment.quotation?.request.address);

    const lineItems =
      payment.purpose === PaymentPurpose.ORDER && payment.order
        ? payment.order.items.map((item) => ({
            name: item.product.name,
            description: item.product.description || null,
            quantity: String(item.quantity),
            price: money(Number(item.unitPrice) * item.quantity),
          }))
        : payment.quotation
          ? [
              {
                name: 'Labor Charges',
                description: payment.quotation.request.category.name,
                quantity: '1',
                price: money(payment.quotation.laborAmount),
              },
              {
                name: 'Parts & Materials',
                description: null,
                quantity: '1',
                price: money(payment.quotation.partsAmount),
              },
              ...(Number(payment.quotation.discountAmount) > 0
                ? [
                    {
                      name: 'Discount',
                      description: null,
                      quantity: '1',
                      price: -money(payment.quotation.discountAmount),
                    },
                  ]
                : []),
            ]
          : [
              {
                name: 'Payment',
                description: null,
                quantity: '1',
                price: money(payment.amount),
              },
            ];

    const subtotal =
      payment.purpose === PaymentPurpose.ORDER && payment.order
        ? money(payment.order.subtotal)
        : payment.quotation
          ? money(
              Number(payment.quotation.laborAmount) +
                Number(payment.quotation.partsAmount) -
                Number(payment.quotation.discountAmount),
            )
          : money(payment.amount);
    const tax =
      payment.purpose === PaymentPurpose.ORDER && payment.order
        ? money(payment.order.tax)
        : payment.quotation
          ? money(payment.quotation.taxAmount)
          : 0;
    const total =
      payment.purpose === PaymentPurpose.ORDER && payment.order
        ? money(payment.order.total)
        : payment.quotation
          ? money(payment.quotation.negotiatedTotal ?? payment.quotation.totalAmount)
          : money(payment.amount);
    const serviceCharges = money(total - subtotal - tax);
    const taxPercent = subtotal
      ? Number(((tax / subtotal) * 100).toFixed(1))
      : Number((checkoutTaxRate() * 100).toFixed(1));

    const request = payment.quotation?.request;
    const technician = request?.technician
      ? `${request.technician.firstName} ${request.technician.lastName}`.trim()
      : '—';

    return {
      paymentId: payment.id,
      invoiceNumber: invoiceNumber(payment.id, payment.createdAt),
      date: formatDate(payment.paidAt ?? payment.createdAt),
      statusLabel: statusLabel(payment.status),
      paymentStatus: payment.status,
      purpose: payment.purpose,
      currency: payment.currency,
      vendor: {
        name: settings?.businessName || 'Elite Central Vacuum',
        addressLines: vendorAddress,
        email: settings?.supportEmail || 'support@elitecentralvacuum.com',
        logoUrl: settings?.logoUrl ?? null,
      },
      billTo: {
        name: `${payment.user.firstName} ${payment.user.lastName}`.trim(),
        addressLines: billAddress,
        email: payment.user.email,
        logoUrl: null,
      },
      service: request
        ? {
            serviceType: request.category.name,
            technician,
            serviceDate: formatShortDate(
              request.scheduledStart ?? request.preferredDate ?? request.createdAt,
            ),
            duration: formatDuration(request.scheduledStart, request.scheduledEnd),
          }
        : null,
      lineItems,
      notes: payment.quotation?.notes ?? null,
      subtotal,
      serviceCharges: Math.max(0, serviceCharges),
      tax,
      taxPercent,
      total,
    };
  }
}
