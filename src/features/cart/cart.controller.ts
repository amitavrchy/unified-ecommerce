import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  Get,
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
import { CartService } from './cart.service';

@ApiTags('Cart')
@ApiBearerAuth()
@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get the authenticated customer cart with live totals',
    description:
      'Subtotal, estimated tax (TAX_RATE), shippingFee (currently 0), and total are calculated from live catalog prices. Checkout still re-prices and reserves stock.',
  })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  get(@CurrentUser() user: AuthUser) {
    return this.cart.get(user);
  }

  @Post('items')
  @ApiOperation({
    summary: 'Add an item to the cart, merging quantities for the same product',
  })
  @ApiCreatedResponse({ type: CartResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  add(@CurrentUser() user: AuthUser, @Body() dto: AddCartItemDto) {
    return this.cart.add(user, dto.productId, dto.quantity);
  }

  @Patch('items/:productId')
  @ApiOperation({ summary: 'Set a cart item quantity' })
  @ApiParam({ name: 'productId', description: 'Product ID in the cart' })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  update(
    @CurrentUser() user: AuthUser,
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cart.updateQuantity(user, productId, dto.quantity);
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
    this.cart.assertCustomer(user);
    const cart = await this.prisma.cart.findUnique({
      where: { customerId: user.id },
    });
    if (cart)
      await this.prisma.cartItem.deleteMany({
        where: { cartId: cart.id, productId },
      });
    return this.cart.get(user);
  }

  @Delete()
  @ApiOperation({ summary: 'Remove all items from the cart' })
  @ApiOkResponse({ type: SuccessResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async clear(@CurrentUser() user: AuthUser) {
    this.cart.assertCustomer(user);
    const cart = await this.prisma.cart.findUnique({
      where: { customerId: user.id },
    });
    if (cart)
      await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return { success: true };
  }
}
