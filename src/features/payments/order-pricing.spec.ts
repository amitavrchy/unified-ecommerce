import { quoteOrderTotals } from './order-pricing';

describe('quoteOrderTotals', () => {
  const originalTaxRate = process.env.TAX_RATE;

  afterEach(() => {
    process.env.TAX_RATE = originalTaxRate;
  });

  it('charges tax only on taxable line items', () => {
    process.env.TAX_RATE = '0.1';
    expect(
      quoteOrderTotals([
        { price: 100, quantity: 1, taxable: true },
        { price: 50, quantity: 2, taxable: false },
      ]),
    ).toEqual({
      subtotal: 200,
      tax: 10,
      shippingFee: 0,
      total: 210,
      taxRate: 0.1,
    });
  });

  it('returns zeros for an empty cart', () => {
    process.env.TAX_RATE = '0.14975';
    expect(quoteOrderTotals([])).toEqual({
      subtotal: 0,
      tax: 0,
      shippingFee: 0,
      total: 0,
      taxRate: 0.14975,
    });
  });
});
