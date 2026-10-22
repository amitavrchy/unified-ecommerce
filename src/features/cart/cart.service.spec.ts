/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { UserRole } from '../../../generated/prisma/enums';
import { PrismaService } from '../../database/prisma.service';
import { CartService } from './cart.service';

describe('CartService customer cart totals', () => {
  const originalTaxRate = process.env.TAX_RATE;
  const originalCurrency = process.env.STRIPE_CURRENCY;
  const prisma = {
    cart: { upsert: jest.fn() },
    cartItem: { findUnique: jest.fn(), upsert: jest.fn() },
    product: { findFirst: jest.fn() },
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

  it('returns line totals, estimated tax, and a zero shipping fee', async () => {
    prisma.cart.upsert.mockResolvedValue({
      id: 'cart-1',
      customerId: 'customer-1',
      items: [
        {
          id: 'item-1',
          productId: 'product-1',
          quantity: 2,
          product: {
            id: 'product-1',
            name: 'HEPA Filter',
            price: 50,
            stock: 8,
            imageUrls: ['https://cdn.example.com/filter.jpg'],
            slug: 'hepa-filter',
            features: ['Fits Elite 500'],
            taxable: true,
          },
        },
      ],
    });
    const service = new CartService(prisma as unknown as PrismaService);

    await expect(
      service.get({
        id: 'customer-1',
        email: 'customer@example.com',
        role: UserRole.CUSTOMER,
      }),
    ).resolves.toEqual({
      id: 'cart-1',
      customerId: 'customer-1',
      itemCount: 2,
      currency: 'cad',
      subtotal: 100,
      tax: 10,
      shippingFee: 0,
      total: 110,
      taxRate: 0.1,
      items: [
        expect.objectContaining({
          quantity: 2,
          unitPrice: 50,
          lineTotal: 100,
          product: expect.objectContaining({
            tagline: 'Fits Elite 500',
            inStock: true,
            taxable: true,
          }),
        }),
      ],
    });
  });
});
