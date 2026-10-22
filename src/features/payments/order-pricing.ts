import { InternalServerErrorException } from '@nestjs/common';

export function checkoutCurrency(): string {
  const currency = (process.env.STRIPE_CURRENCY ?? 'cad').toLowerCase();
  if (!/^[a-z]{3}$/.test(currency))
    throw new InternalServerErrorException(
      'STRIPE_CURRENCY must be an ISO 4217 currency code',
    );
  return currency;
}

export function checkoutTaxRate(): number {
  const rate = Number(process.env.TAX_RATE ?? 0.14975);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1)
    throw new InternalServerErrorException(
      'TAX_RATE must be a decimal between 0 and 1',
    );
  return rate;
}

export function quoteOrderTotals(
  items: { price: number; quantity: number; taxable: boolean }[],
) {
  const subtotal = Number(
    items.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2),
  );
  const taxableSubtotal = items.reduce(
    (sum, item) => (item.taxable ? sum + item.price * item.quantity : sum),
    0,
  );
  const tax = Number((taxableSubtotal * checkoutTaxRate()).toFixed(2));
  const shippingFee = 0;
  const total = Number((subtotal + tax + shippingFee).toFixed(2));
  return {
    subtotal,
    tax,
    shippingFee,
    total,
    taxRate: checkoutTaxRate(),
  };
}
