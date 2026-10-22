import {
  OrderStatus,
  PaymentStatus,
  ReturnStatus,
} from '../../../generated/prisma/enums';

const ACTIVE_STATUSES: OrderStatus[] = [
  OrderStatus.PAYMENT_PENDING,
  OrderStatus.PLACED,
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
];

const COMPLETE_STATUSES: OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
  OrderStatus.PAYMENT_FAILED,
  OrderStatus.REFUNDED,
];

const TIMELINE: { key: string; label: string; status?: OrderStatus }[] = [
  { key: 'PLACED', label: 'Order Placed' },
  { key: 'PAYMENT_CONFIRMED', label: 'Payment Confirmed' },
  { key: 'PROCESSING', label: 'Processing', status: OrderStatus.PROCESSING },
  { key: 'SHIPPED', label: 'Shipped', status: OrderStatus.SHIPPED },
  { key: 'DELIVERED', label: 'Delivered', status: OrderStatus.DELIVERED },
];

export function customerOrderStatuses(
  group?: string,
): OrderStatus[] | undefined {
  if (group === 'active') return ACTIVE_STATUSES;
  if (group === 'complete') return COMPLETE_STATUSES;
  return undefined;
}

export function mapCustomerOrder(order: {
  status: OrderStatus;
  subtotal: unknown;
  tax: unknown;
  total: unknown;
  paidAt: Date | null;
  createdAt: Date;
  statusHistory: { status: OrderStatus; createdAt: Date }[];
  returnRequests: { status: ReturnStatus }[];
  payments: { status: PaymentStatus; updatedAt?: Date }[];
  [key: string]: unknown;
}) {
  const historyAt = (status: OrderStatus) =>
    order.statusHistory.find((entry) => entry.status === status)?.createdAt ??
    null;
  const reached = (status: OrderStatus) =>
    order.status === status ||
    order.statusHistory.some((entry) => entry.status === status) ||
    statusRank(order.status) > statusRank(status);
  const paymentConfirmedAt = order.paidAt ?? historyAt(OrderStatus.PAID);
  const currentKey =
    order.status === OrderStatus.DELIVERED
      ? 'DELIVERED'
      : order.status === OrderStatus.SHIPPED
        ? 'SHIPPED'
        : order.status === OrderStatus.PROCESSING ||
            order.status === OrderStatus.PAID
          ? 'PROCESSING'
          : paymentConfirmedAt
            ? 'PAYMENT_CONFIRMED'
            : 'PLACED';
  const timeline = TIMELINE.map((step) => {
    const at =
      step.key === 'PLACED'
        ? order.createdAt
        : step.key === 'PAYMENT_CONFIRMED'
          ? paymentConfirmedAt
          : step.status
            ? historyAt(step.status)
            : null;
    const completed =
      step.key === 'PLACED'
        ? true
        : step.key === 'PAYMENT_CONFIRMED'
          ? Boolean(paymentConfirmedAt)
          : step.status
            ? reached(step.status)
            : false;
    return {
      key: step.key,
      label: step.label,
      completed,
      current: step.key === currentKey,
      at,
    };
  });
  const shippingFee = Math.max(
    0,
    Number(
      (
        Number(order.total) -
        Number(order.subtotal) -
        Number(order.tax)
      ).toFixed(2),
    ),
  );
  const latestPayment = order.payments[0] ?? null;
  return {
    ...order,
    shippingFee,
    paymentStatus: latestPayment?.status ?? null,
    timeline,
    canCancel: order.status === OrderStatus.PAYMENT_PENDING,
    canReturn:
      order.status === OrderStatus.DELIVERED &&
      !order.returnRequests.some(
        (request) => request.status !== ReturnStatus.REJECTED,
      ),
  };
}

function statusRank(status: OrderStatus): number {
  const order: OrderStatus[] = [
    OrderStatus.PAYMENT_PENDING,
    OrderStatus.PLACED,
    OrderStatus.PAID,
    OrderStatus.PROCESSING,
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
  ];
  const index = order.indexOf(status);
  return index === -1 ? -1 : index;
}
