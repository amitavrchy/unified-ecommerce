import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { MediaUploadService } from '../../../service/cloudinary/media-upload.service';
import { adminPage, adminSkip } from '../common/admin-pagination';
import {
  AdminCreateProductDto,
  AdminProductQueryDto,
  AdminUpdateProductDto,
} from './dto/products.dto';

const PRODUCT_MEDIA_FOLDER = 'vacuumCare/products';

@Injectable()
export class AdminProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaUploadService,
  ) {}

  async list(query: AdminProductQueryDto) {
    const where: Prisma.ProductWhereInput = {
      isActive: query.isActive,
      category: query.category
        ? { equals: query.category, mode: 'insensitive' }
        : undefined,
      stock: query.lowStock ? { lte: query.lowStockThreshold } : undefined,
    };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { category: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    return adminPage(
      this.prisma,
      this.prisma.product.findMany({
        where,
        orderBy: [{ stock: 'asc' }, { name: 'asc' }],
        skip: adminSkip(query),
        take: query.pageSize,
      }),
      this.prisma.product.count({ where }),
      query,
    );
  }

  async get(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(dto: AdminCreateProductDto, files: Express.Multer.File[] = []) {
    const imageUrls = await this.resolveImageUrls(dto.imageUrls, files);
    return this.prisma.product.create({
      data: {
        sku: dto.sku,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        price: dto.price,
        stock: dto.stock,
        slug: dto.slug,
        features: dto.features ?? [],
        specifications: dto.specifications,
        warranty: dto.warranty,
        shippingInfo: dto.shippingInfo,
        isActive: dto.isActive ?? true,
        taxable: dto.taxable ?? true,
        imageUrls,
      },
    });
  }

  async update(
    id: string,
    dto: AdminUpdateProductDto,
    files: Express.Multer.File[] = [],
  ) {
    await this.get(id);
    const uploaded = files.length
      ? await this.uploadProductMedia(files)
      : undefined;
    return this.prisma.product.update({
      where: { id },
      data: {
        sku: dto.sku,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        price: dto.price,
        stock: dto.stock,
        slug: dto.slug,
        features: dto.features,
        specifications: dto.specifications,
        warranty: dto.warranty,
        shippingInfo: dto.shippingInfo,
        isActive: dto.isActive,
        taxable: dto.taxable,
        ...(uploaded
          ? { imageUrls: [...(dto.imageUrls ?? []), ...uploaded] }
          : dto.imageUrls !== undefined
            ? { imageUrls: dto.imageUrls }
            : {}),
      },
    });
  }

  private async resolveImageUrls(
    imageUrls: string[] | undefined,
    files: Express.Multer.File[],
  ) {
    const uploaded = await this.uploadProductMedia(files);
    return [...(imageUrls ?? []), ...uploaded];
  }

  private async uploadProductMedia(files: Express.Multer.File[]) {
    this.media.assertImages(files);
    return this.media.uploadUrls(files, PRODUCT_MEDIA_FOLDER);
  }
}
