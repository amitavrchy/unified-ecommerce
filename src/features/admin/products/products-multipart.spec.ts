import type { Server } from 'http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PrismaService } from '../../../database/prisma.service';
import { CloudinaryService } from '../../../service/cloudinary/cloudinary.service';
import { MediaUploadService } from '../../../service/cloudinary/media-upload.service';
import { AdminGuard } from '../admin.guard';
import { AdminProductsController } from './products.controller';
import { AdminProductsService } from './products.service';

/**
 * Form fields arrive as strings, so this boots the controller behind the real
 * validation pipe to prove numbers, booleans, lists, and JSON objects survive
 * transformation on a multipart request.
 */
describe('POST /admin/products multipart', () => {
  let app: INestApplication;
  const server = () => app.getHttpServer() as Server;
  const prisma = { product: { create: jest.fn(), update: jest.fn() } };
  const cloudinary = { uploadFile: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminProductsController],
      providers: [
        AdminProductsService,
        MediaUploadService,
        { provide: PrismaService, useValue: prisma },
        { provide: CloudinaryService, useValue: cloudinary },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.product.create.mockResolvedValue({ id: 'product-1' });
    cloudinary.uploadFile.mockResolvedValue(
      'https://res.cloudinary.com/demo/hepa.jpg',
    );
  });

  it('coerces string form fields and uploads the image', async () => {
    await request(server())
      .post('/admin/products')
      .field('name', 'HEPA Filter')
      .field('description', 'Replacement filter')
      .field('category', 'Filters')
      .field('price', '39.99')
      .field('stock', '20')
      .field('taxable', 'false')
      .field('isActive', 'true')
      .field('features', 'HEPA-grade filtration,Tool-free installation')
      .field('specifications', JSON.stringify({ compatibility: 'H700' }))
      .attach('images', Buffer.from('fake-jpeg'), {
        filename: 'hepa.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);

    const [args] = prisma.product.create.mock.calls as [
      { data: Record<string, unknown> },
    ][];
    expect(args[0].data).toEqual(
      expect.objectContaining({
        name: 'HEPA Filter',
        price: 39.99,
        stock: 20,
        taxable: false,
        isActive: true,
        features: ['HEPA-grade filtration', 'Tool-free installation'],
        specifications: { compatibility: 'H700' },
        imageUrls: ['https://res.cloudinary.com/demo/hepa.jpg'],
      }),
    );
  });

  it('rejects a non-numeric price', async () => {
    await request(server())
      .post('/admin/products')
      .field('name', 'HEPA Filter')
      .field('description', 'Replacement filter')
      .field('category', 'Filters')
      .field('price', 'free')
      .field('stock', '20')
      .expect(400);

    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('rejects a non-image file on the images field', async () => {
    await request(server())
      .post('/admin/products')
      .field('name', 'HEPA Filter')
      .field('description', 'Replacement filter')
      .field('category', 'Filters')
      .field('price', '39.99')
      .field('stock', '20')
      .attach('images', Buffer.from('fake-pdf'), {
        filename: 'manual.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);

    expect(cloudinary.uploadFile).not.toHaveBeenCalled();
    expect(prisma.product.create).not.toHaveBeenCalled();
  });
});
