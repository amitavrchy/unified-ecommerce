import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Delete,
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
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../../../generated/prisma/enums';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import {
  ApiErrorResponseDto,
  SuccessResponseDto,
} from '../../common/dto/api-response.dto';
import { PrismaService } from '../../database/prisma.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';
import { CartResponseDto } from './dto/cart-response.dto';

const cartInclude = {
  items: { include: { product: true }, orderBy: { createdAt: 'asc' } },
} as const;

@ApiTags('Cart')
@ApiBearerAuth()
@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Get the authenticated customer cart' })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async get(@CurrentUser() user: AuthUser) {
    this.customer(user);
    const cart = await this.prisma.cart.upsert({
      where: { customerId: user.id },
      create: { customerId: user.id },
      update: {},
      include: cartInclude,
    });
    return this.response(cart);
  }

  @Post('items')
  @ApiOperation({
    summary: 'Add an item to the cart, merging quantities for the same product',
  })
  @ApiCreatedResponse({ type: CartResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async add(@CurrentUser() user: AuthUser, @Body() dto: AddCartItemDto) {
    this.customer(user);
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, isActive: true },
    });
    if (!product) throw new NotFoundException('Product is not available');
    const cart = await this.prisma.cart.upsert({
      where: { customerId: user.id },
      create: { customerId: user.id },
      update: {},
    });
    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId: product.id } },
    });
    const quantity = (existing?.quantity ?? 0) + dto.quantity;
    if (quantity > product.stock)
      throw new ForbiddenException(
        'Requested quantity exceeds available stock',
      );
    await this.prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId: product.id } },
      create: { cartId: cart.id, productId: product.id, quantity },
      update: { quantity },
    });
    return this.get(user);
  }

  @Patch('items/:productId')
  @ApiOperation({ summary: 'Set a cart item quantity' })
  @ApiParam({ name: 'productId', description: 'Product ID in the cart' })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    this.customer(user);
    const cart = await this.prisma.cart.findUnique({
      where: { customerId: user.id },
    });
    if (!cart) throw new NotFoundException('Cart is empty');
    const product = await this.prisma.product.findFirst({
      where: { id: productId, isActive: true },
    });
    if (!product) throw new NotFoundException('Product is not available');
    if (dto.quantity > product.stock)
      throw new ForbiddenException(
        'Requested quantity exceeds available stock',
      );
    const updated = await this.prisma.cartItem.updateMany({
      where: { cartId: cart.id, productId },
      data: { quantity: dto.quantity },
    });
    if (!updated.count) throw new NotFoundException('Cart item not found');
    return this.get(user);
  }

  @Delete('items/:productId')
  @ApiOperation({ summary: 'Remove an item from the cart' })
  @ApiParam({ name: 'productId', description: 'Product ID in the cart' })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('productId') productId: string,
  ) {
    this.customer(user);
    const cart = await this.prisma.cart.findUnique({
      where: { customerId: user.id },
    });
    if (cart)
      await this.prisma.cartItem.deleteMany({
        where: { cartId: cart.id, productId },
      });
    return this.get(user);
  }

  @Delete()
  @ApiOperation({ summary: 'Remove all items from the cart' })
  @ApiOkResponse({ type: SuccessResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async clear(@CurrentUser() user: AuthUser) {
    this.customer(user);
    const cart = await this.prisma.cart.findUnique({
      where: { customerId: user.id },
    });
    if (cart)
      await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return { success: true };
  }

  private response(
    cart: {
      id: string;
      customerId: string;
      items: { quantity: number; product: { price: unknown } }[];
    } & object,
  ) {
    return {
      ...cart,
      subtotal: Number(
        cart.items
          .reduce(
            (total, item) => total + Number(item.product.price) * item.quantity,
            0,
          )
          .toFixed(2),
      ),
    };
  }

  private customer(user: AuthUser) {
    if (user.role !== UserRole.CUSTOMER)
      throw new ForbiddenException('Only customers have carts');
  }
}
