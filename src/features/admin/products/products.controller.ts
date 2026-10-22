import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { ApiErrorResponseDto } from '../../../common/dto/api-response.dto';
import { ProductResponseDto } from '../../catalog/dto/catalog-response.dto';
import { AdminGuard } from '../admin.guard';
import {
  AdminCreateProductDto,
  AdminCreateProductFormDto,
  AdminProductQueryDto,
  AdminUpdateProductDto,
  AdminUpdateProductFormDto,
} from './dto/products.dto';
import { AdminProductPageDto } from './dto/products-response.dto';
import { AdminProductsService } from './products.service';

@ApiTags('Admin Products')
@ApiBearerAuth()
@Controller('admin/products')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
export class AdminProductsController {
  constructor(private readonly products: AdminProductsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all products with inventory and active-state filters',
    description: 'Includes inactive products by default.',
  })
  @ApiOkResponse({ type: AdminProductPageDto })
  list(@Query() query: AdminProductQueryDto) {
    return this.products.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get any active or inactive product' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  get(@Param('id') id: string) {
    return this.products.get(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a shop product',
    description:
      'Send as multipart form data. Upload files on the images field and/or pass existing imageUrls. Send specifications as a JSON string.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: AdminCreateProductFormDto })
  @ApiCreatedResponse({ type: ProductResponseDto })
  @UseInterceptors(FilesInterceptor('images', 10))
  create(
    @Body() dto: AdminCreateProductDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return this.products.create(dto, files);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a shop product',
    description:
      'Send as multipart form data. Uploaded images are appended to imageUrls unless imageUrls is also sent. Send specifications as a JSON string.',
  })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: AdminUpdateProductFormDto })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @UseInterceptors(FilesInterceptor('images', 10))
  update(
    @Param('id') id: string,
    @Body() dto: AdminUpdateProductDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return this.products.update(id, dto, files);
  }
}
