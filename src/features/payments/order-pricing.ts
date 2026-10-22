import { InternalServerErrorException } from '@nestjs/common';

export function checkoutCurrency(): string {
  const currency = (process.env.STRIPE_CURRENCY ?? 'cad').toLowerCase();
  // Monetary columns store two-decimal prices and taxes. Reject currencies
  // with different Stripe minor-unit rules rather than charging 100x too much.
  const otherPrecision = new Set([
    'bif',
    'clp',
    'djf',
    'gnf',
    'jpy',
    'kmf',
    'krw',
    'mga',
    'pyg',
    'rwf',
    'vnd',
    'vuv',
    'xaf',
    'xof',
    'xpf',
    'isk',
    'ugx',
    'bhd',
    'jod',
    'kwd',
    'omr',
    'tnd',
  ]);
  if (!/^[a-z]{3}$/.test(currency) || otherPrecision.has(currency))
    throw new InternalServerErrorException(
      'STRIPE_CURRENCY must be a supported two-decimal ISO currency code (for example cad or usd)',
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
