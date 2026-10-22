import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiConsumes,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Prisma } from '../../../generated/prisma/client';
import { UserRole } from '../../../generated/prisma/enums';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { PrismaService } from '../../database/prisma.service';
import { MediaUploadService } from '../../service/cloudinary/media-upload.service';
import {
  CategoryDto,
  CreateProductDto,
  CreateProductFormDto,
  ProductQueryDto,
  ProductSort,
  UpdateProductDto,
  UpdateProductFormDto,
} from './dto/catalog.dto';
import {
  ProductCategoryCountDto,
  ProductDetailResponseDto,
  ProductPageResponseDto,
  ProductResponseDto,
  ServiceCategoryResponseDto,
} from './dto/catalog-response.dto';

@ApiTags('Catalog')
@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaUploadService,
  ) {}

  @Get('services')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List available service categories and issues' })
  @ApiOkResponse({ type: ServiceCategoryResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  services() {
    return this.prisma.serviceCategory.findMany({ include: { issues: true } });
  }

  @Get('product-categories')
  @ApiOperation({
    summary: 'List active product categories for the store filter sidebar',
  })
  @ApiOkResponse({ type: ProductCategoryCountDto, isArray: true })
  async productCategories() {
    const groups = await this.prisma.product.groupBy({
      by: ['category'],
      where: { isActive: true },
      _count: { _all: true },
      orderBy: { category: 'asc' },
    });
    return groups.map((group) => ({
      name: group.category,
      count: group._count._all,
    }));
  }

  @Get('products')
  @ApiOperation({
    summary: 'Search and browse active shop products',
    description:
      'Customer storefront list. Supports store filters: search (name/SKU), categories, price range, in-stock only, sort, and pagination.',
  })
  @ApiOkResponse({ type: ProductPageResponseDto })
  async products(@Query() query: ProductQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 24, 100);
    const categories = [
      ...(query.categories ?? []),
      ...(query.category ? [query.category] : []),
    ];
    const where = {
      isActive: true,
      ...(categories.length
        ? {
            OR: categories.map((category) => ({
              category: { equals: category, mode: 'insensitive' as const },
            })),
          }
        : {}),
      ...(query.inStockOnly ? { stock: { gt: 0 } } : {}),
      ...(query.minPrice !== undefined || query.maxPrice !== undefined
        ? {
            price: {
              ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
              ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            AND: [
              {
                OR: [
                  {
                    name: {
                      contains: query.search,
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    sku: {
                      contains: query.search,
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    description: {
                      contains: query.search,
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    category: {
                      contains: query.search,
                      mode: 'insensitive' as const,
                    },
                  },
                ],
              },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: this.productOrderBy(query.sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      items: items.map((product) => this.mapProduct(product)),
      total,
      page,
      pageSize,
    };
  }

  @Get('products/:idOrSlug')
  @ApiOperation({
    summary: 'Get one active product by ID or slug, plus related products',
  })
  @ApiParam({ name: 'idOrSlug', description: 'Product ID or SEO slug' })
  @ApiOkResponse({ type: ProductDetailResponseDto })
  async product(@Param('idOrSlug') idOrSlug: string) {
    const product = await this.prisma.product.findFirst({
      where: { isActive: true, OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    });
    if (!product) throw new NotFoundException('Product not found');
    const related = await this.prisma.product.findMany({
      where: {
        isActive: true,
        id: { not: product.id },
        category: { equals: product.category, mode: 'insensitive' },
      },
      orderBy: this.productOrderBy(ProductSort.POPULARITY),
      take: 4,
    });
    return {
      ...this.mapProduct(product),
      relatedProducts: related.map((item) => this.mapProduct(item)),
    };
  }

  @Post('services')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a service category (admin only)' })
  @ApiCreatedResponse({ type: ServiceCategoryResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({
    type: ApiErrorResponseDto,
    description: 'Only administrators can create service categories.',
  })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  createService(@CurrentUser() user: AuthUser, @Body() dto: CategoryDto) {
    if (user.role !== UserRole.ADMIN) throw new ForbiddenException();
    return this.prisma.serviceCategory.create({
      data: {
        name: dto.name,
        description: dto.description,
        issues: dto.issues?.length
          ? { create: dto.issues.map((name) => ({ name })) }
          : undefined,
      },
      include: { issues: true },
    });
  }

  @Post('products')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a shop product (admin only)',
    description:
      'Send as multipart form data. Upload files on the images field and/or pass existing imageUrls. Send specifications as a JSON string.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateProductFormDto })
  @ApiCreatedResponse({ type: ProductResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({
    type: ApiErrorResponseDto,
    description: 'Only administrators can create products.',
  })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @UseInterceptors(FilesInterceptor('images', 10))
  async createProduct(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateProductDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    if (user.role !== UserRole.ADMIN) throw new ForbiddenException();
    const uploaded = await this.uploadProductMedia(files);
    return this.prisma.product.create({
      data: {
        ...dto,
        isActive: dto.isActive ?? true,
        taxable: dto.taxable ?? true,
        imageUrls: [...(dto.imageUrls ?? []), ...(uploaded ?? [])],
      },
    });
  }

  @Patch('products/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update a shop product (admin only)',
    description:
      'Send as multipart form data. Uploaded images are appended to imageUrls unless imageUrls is also sent. Send specifications as a JSON string.',
  })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateProductFormDto })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({
    type: ApiErrorResponseDto,
    description: 'Only administrators can update products.',
  })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @UseInterceptors(FilesInterceptor('images', 10))
  async updateProduct(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    if (user.role !== UserRole.ADMIN) throw new ForbiddenException();
    const uploaded = await this.uploadProductMedia(files);
    return this.prisma.product.update({
      where: { id },
      data: {
        ...dto,
        ...(uploaded
          ? { imageUrls: [...(dto.imageUrls ?? []), ...uploaded] }
          : {}),
      },
    });
  }

  private mapProduct(product: {
    features: string[];
    stock: number;
    [key: string]: unknown;
  }) {
    return {
      ...product,
      tagline: product.features[0] ?? null,
      inStock: product.stock > 0,
    };
  }

  private productOrderBy(
    sort?: ProductSort,
  ): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case ProductSort.PRICE_ASC:
        return [{ price: 'asc' }, { name: 'asc' }];
      case ProductSort.PRICE_DESC:
        return [{ price: 'desc' }, { name: 'asc' }];
      case ProductSort.NEWEST:
        return [{ id: 'desc' }];
      case ProductSort.NAME:
        return [{ name: 'asc' }];
      case ProductSort.POPULARITY:
      default:
        return [{ orderItems: { _count: 'desc' } }, { name: 'asc' }];
    }
  }

  private async uploadProductMedia(files: Express.Multer.File[]) {
    if (!files.length) return undefined;
    this.media.assertImages(files);
    return this.media.uploadUrls(files, 'vacuumCare/products');
  }
}
