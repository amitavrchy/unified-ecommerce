/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { UserRole } from '../../../generated/prisma/enums';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StripeService } from './stripe.service';

describe('StripeService checkout preview', () => {
  const originalTaxRate = process.env.TAX_RATE;
  const originalCurrency = process.env.STRIPE_CURRENCY;
  const prisma = {
    cart: { findUnique: jest.fn() },
    address: { findFirst: jest.fn() },
    product: { findMany: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TAX_RATE = '0.1';
    process.env.STRIPE_CURRENCY = 'cad';
  });

  afterEach(() => {
    process.env.TAX_RATE = originalTaxRate;
    process.env.STRIPE_CURRENCY = originalCurrency;
  });

  it('quotes Buy Now items against live prices without reserving stock', async () => {
    prisma.address.findFirst.mockResolvedValue({
      id: 'address-1',
      line1: '123 Main Street',
      apartment: null,
      city: 'Toronto',
      state: 'ON',
      zipCode: 'M5V 2T6',
      country: 'Canada',
      isPrimary: true,
    });
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'product-1',
        name: 'Elite 500',
        price: 299,
        stock: 4,
        taxable: true,
        features: ['Quiet-flow technology'],
        imageUrls: ['https://cdn.example.com/elite.jpg'],
      },
    ]);
    const service = new StripeService(
      prisma as unknown as PrismaService,
      {} as NotificationsService,
    );

    await expect(
      service.previewCheckout(
        {
          id: 'customer-1',
          email: 'customer@example.com',
          role: UserRole.CUSTOMER,
        },
        { items: [{ productId: 'product-1', quantity: 1 }] },
      ),
    ).resolves.toEqual({
      source: 'items',
      itemCount: 1,
      currency: 'cad',
      subtotal: 299,
      tax: 29.9,
      shippingFee: 0,
      total: 328.9,
      taxRate: 0.1,
      shippingAddress: expect.objectContaining({ id: 'address-1' }),
      items: [
        expect.objectContaining({
          productId: 'product-1',
          quantity: 1,
          unitPrice: 299,
          lineTotal: 299,
          tagline: 'Quiet-flow technology',
        }),
      ],
    });
    expect(prisma.cart.findUnique).not.toHaveBeenCalled();
  });
});
