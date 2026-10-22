import type { Server } from 'http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '../../../generated/prisma/enums';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PrismaService } from '../../database/prisma.service';
import { CloudinaryService } from '../../service/cloudinary/cloudinary.service';
import { MediaUploadService } from '../../service/cloudinary/media-upload.service';
import { CatalogController } from './catalog.controller';

/**
 * The product write routes take form data, so this boots the controller behind
 * the real validation pipe to prove the DTOs coerce text fields and that
 * uploaded files land in `imageUrls`.
 */
describe('Catalog product uploads', () => {
  let app: INestApplication;
  const server = () => app.getHttpServer() as Server;
  const prisma = { product: { create: jest.fn(), update: jest.fn() } };
  const cloudinary = { uploadFile: jest.fn() };
  let role: UserRole = UserRole.ADMIN;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [
        MediaUploadService,
        { provide: PrismaService, useValue: prisma },
        { provide: CloudinaryService, useValue: cloudinary },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { user?: unknown } };
        }) => {
          context.switchToHttp().getRequest().user = {
            id: 'admin-1',
            email: 'admin@example.com',
            role,
          };
          return true;
        },
      })
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
    role = UserRole.ADMIN;
    prisma.product.create.mockResolvedValue({ id: 'product-1' });
    prisma.product.update.mockResolvedValue({ id: 'product-1' });
    cloudinary.uploadFile.mockResolvedValue(
      'https://res.cloudinary.com/demo/filter.jpg',
    );
  });

  it('creates a product from form fields and an uploaded image', async () => {
    await request(server())
      .post('/catalog/products')
      .field('name', 'HEPA Filter')
      .field('description', 'Replacement filter')
      .field('category', 'Filters')
      .field('price', '39.99')
      .field('stock', '20')
      .field('features', 'HEPA-grade filtration,Tool-free installation')
      .field('specifications', JSON.stringify({ compatibility: 'H700' }))
      .attach('images', Buffer.from('fake-jpeg'), {
        filename: 'filter.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);

    expect(cloudinary.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'filter.jpg' }),
      'vacuumCare/products',
    );
    const [args] = prisma.product.create.mock.calls as [
      { data: Record<string, unknown> },
    ][];
    expect(args[0].data).toEqual(
      expect.objectContaining({
        price: 39.99,
        stock: 20,
        isActive: true,
        taxable: true,
        features: ['HEPA-grade filtration', 'Tool-free installation'],
        specifications: { compatibility: 'H700' },
        imageUrls: ['https://res.cloudinary.com/demo/filter.jpg'],
      }),
    );
  });

  it('reports a missing required field as a validation error', async () => {
    await request(server())
      .post('/catalog/products')
      .field('description', 'Replacement filter')
      .field('category', 'Filters')
      .field('price', '39.99')
      .field('stock', '20')
      .expect(400);

    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('appends uploads to the existing image list on update', async () => {
    await request(server())
      .patch('/catalog/products/product-1')
      .field('imageUrls', 'https://cdn.example.com/kept.jpg')
      .attach('images', Buffer.from('fake-jpeg'), {
        filename: 'filter.jpg',
        contentType: 'image/jpeg',
      })
      .expect(200);

    const [args] = prisma.product.update.mock.calls as [
      { data: { imageUrls: string[] } },
    ][];
    expect(args[0].data.imageUrls).toEqual([
      'https://cdn.example.com/kept.jpg',
      'https://res.cloudinary.com/demo/filter.jpg',
    ]);
  });

  it('refuses a product write from a non-admin', async () => {
    role = UserRole.CUSTOMER;
    await request(server())
      .post('/catalog/products')
      .field('name', 'HEPA Filter')
      .field('description', 'Replacement filter')
      .field('category', 'Filters')
      .field('price', '39.99')
      .field('stock', '20')
      .expect(403);

    expect(prisma.product.create).not.toHaveBeenCalled();
  });
});
