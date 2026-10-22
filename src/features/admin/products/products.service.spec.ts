/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PrismaService } from '../../../database/prisma.service';
import { CloudinaryService } from '../../../service/cloudinary/cloudinary.service';
import { MediaUploadService } from '../../../service/cloudinary/media-upload.service';
import { AdminProductsService } from './products.service';

describe('AdminProductsService', () => {
  const prisma = {
    $transaction: jest.fn((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    ),
    product: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const cloudinary = {
    uploadFile: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('includes inactive products and applies low-stock inventory filters', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);
    const service = new AdminProductsService(
      prisma as unknown as PrismaService,
      new MediaUploadService(cloudinary as unknown as CloudinaryService),
    );

    await expect(
      service.list({
        page: 2,
        pageSize: 10,
        search: 'FILTER',
        lowStock: true,
        lowStockThreshold: 3,
      }),
    ).resolves.toEqual({ items: [], total: 0, page: 2, pageSize: 10 });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: expect.objectContaining({
          isActive: undefined,
          stock: { lte: 3 },
          OR: expect.arrayContaining([
            { sku: { contains: 'FILTER', mode: 'insensitive' } },
          ]),
        }),
      }),
    );
  });

  it('creates a product from JSON fields and uploaded image URLs', async () => {
    prisma.product.create.mockResolvedValue({ id: 'product-1' });
    cloudinary.uploadFile.mockResolvedValue(
      'https://cdn.example.com/products/hepa.jpg',
    );
    const service = new AdminProductsService(
      prisma as unknown as PrismaService,
      new MediaUploadService(cloudinary as unknown as CloudinaryService),
    );

    await expect(
      service.create(
        {
          name: 'HEPA Filter',
          description: 'Replacement filter',
          category: 'Filters',
          price: 39.99,
          stock: 20,
          imageUrls: ['https://cdn.example.com/existing.jpg'],
        },
        [
          {
            originalname: 'hepa.jpg',
            mimetype: 'image/jpeg',
          } as Express.Multer.File,
        ],
      ),
    ).resolves.toEqual({ id: 'product-1' });

    expect(cloudinary.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'hepa.jpg' }),
      'vacuumCare/products',
    );
    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'HEPA Filter',
        price: 39.99,
        stock: 20,
        isActive: true,
        taxable: true,
        imageUrls: [
          'https://cdn.example.com/existing.jpg',
          'https://cdn.example.com/products/hepa.jpg',
        ],
      }),
    });
  });
});
