import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../../../generated/prisma/enums';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { PrismaService } from '../../database/prisma.service';
import {
  CategoryDto,
  ProductDto,
  ProductQueryDto,
  UpdateProductDto,
} from './dto/catalog.dto';
import {
  ProductPageResponseDto,
  ProductResponseDto,
  ServiceCategoryResponseDto,
} from './dto/catalog-response.dto';

@ApiTags('Catalog')
@ApiBearerAuth()
@Controller('catalog')
@UseGuards(JwtAuthGuard)
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('services')
  @ApiOperation({ summary: 'List available service categories and issues' })
  @ApiOkResponse({ type: ServiceCategoryResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  services() {
    return this.prisma.serviceCategory.findMany({ include: { issues: true } });
  }

  @Get('products')
  @ApiOperation({ summary: 'Search and browse active shop products' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 24 })
  @ApiOkResponse({ type: ProductPageResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async products(@Query() query: ProductQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 24, 100);
    const where = {
      isActive: true,
      ...(query.category
        ? { category: { equals: query.category, mode: 'insensitive' as const } }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                name: { contains: query.search, mode: 'insensitive' as const },
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
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  @Get('products/:idOrSlug')
  @ApiOperation({ summary: 'Get one active product by ID or slug' })
  @ApiParam({ name: 'idOrSlug', description: 'Product ID or SEO slug' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async product(@Param('idOrSlug') idOrSlug: string) {
    const product = await this.prisma.product.findFirst({
      where: { isActive: true, OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    });
    if (!product) throw new ForbiddenException('Product not found');
    return product;
  }

  @Post('services')
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
  @ApiOperation({ summary: 'Create a shop product (admin only)' })
  @ApiCreatedResponse({ type: ProductResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({
    type: ApiErrorResponseDto,
    description: 'Only administrators can create products.',
  })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  createProduct(@CurrentUser() user: AuthUser, @Body() dto: ProductDto) {
    if (user.role !== UserRole.ADMIN) throw new ForbiddenException();
    return this.prisma.product.create({ data: dto });
  }

  @Patch('products/:id')
  @ApiOperation({ summary: 'Update a shop product (admin only)' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({
    type: ApiErrorResponseDto,
    description: 'Only administrators can update products.',
  })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  updateProduct(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    if (user.role !== UserRole.ADMIN) throw new ForbiddenException();
    return this.prisma.product.update({ where: { id }, data: dto });
  }
}
