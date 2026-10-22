/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { CatalogController } from './catalog.controller';
import { ProductSort } from './dto/catalog.dto';
import { PrismaService } from '../../database/prisma.service';
import { MediaUploadService } from '../../service/cloudinary/media-upload.service';

describe('CatalogController customer storefront', () => {
  const prisma = {
    $transaction: jest.fn((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    ),
    product: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  beforeEach(() => jest.clearAllMocks());

  it('filters by SKU search, categories, price, and in-stock, sorted by popularity', async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'product-1',
        name: 'Elite 500',
        features: ['Quiet-flow technology'],
        stock: 4,
      },
    ]);
    prisma.product.count.mockResolvedValue(1);
    const controller = new CatalogController(
      prisma as unknown as PrismaService,
      {} as MediaUploadService,
    );

    const result = await controller.products({
      search: 'FILTER-HEPA',
      categories: ['Vacuum', 'Accessories'],
      minPrice: 0,
      maxPrice: 1000,
      inStockOnly: true,
      sort: ProductSort.POPULARITY,
      page: 1,
      pageSize: 9,
    });

    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: 'product-1',
          tagline: 'Quiet-flow technology',
          inStock: true,
        }),
      ],
      total: 1,
      page: 1,
      pageSize: 9,
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 9,
        where: expect.objectContaining({
          isActive: true,
          stock: { gt: 0 },
          price: { gte: 0, lte: 1000 },
        }),
        orderBy: [{ orderItems: { _count: 'desc' } }, { name: 'asc' }],
      }),
    );
  });
});
