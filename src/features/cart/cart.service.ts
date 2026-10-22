import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/enums';
import type { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../database/prisma.service';
import { checkoutCurrency, quoteOrderTotals } from '../payments/order-pricing';

const cartInclude = {
  items: { include: { product: true }, orderBy: { createdAt: 'asc' as const } },
};

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  assertCustomer(user: AuthUser) {
    if (user.role !== UserRole.CUSTOMER)
      throw new ForbiddenException('Only customers have carts');
  }

  async get(user: AuthUser) {
    this.assertCustomer(user);
    const cart = await this.prisma.cart.upsert({
      where: { customerId: user.id },
      create: { customerId: user.id },
      update: {},
      include: cartInclude,
    });
    return this.toResponse(cart);
  }

  async add(user: AuthUser, productId: string, quantity: number) {
    this.assertCustomer(user);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, isActive: true },
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
    const nextQuantity = (existing?.quantity ?? 0) + quantity;
    if (nextQuantity > product.stock)
      throw new ForbiddenException(
        'Requested quantity exceeds available stock',
      );
    await this.prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId: product.id } },
      create: {
        cartId: cart.id,
        productId: product.id,
        quantity: nextQuantity,
      },
      update: { quantity: nextQuantity },
    });
    return this.get(user);
  }

  async updateQuantity(user: AuthUser, productId: string, quantity: number) {
    this.assertCustomer(user);
    const cart = await this.prisma.cart.findUnique({
      where: { customerId: user.id },
    });
    if (!cart) throw new NotFoundException('Cart is empty');
    const product = await this.prisma.product.findFirst({
      where: { id: productId, isActive: true },
    });
    if (!product) throw new NotFoundException('Product is not available');
    if (quantity > product.stock)
      throw new ForbiddenException(
        'Requested quantity exceeds available stock',
      );
    const updated = await this.prisma.cartItem.updateMany({
      where: { cartId: cart.id, productId },
      data: { quantity },
    });
    if (!updated.count) throw new NotFoundException('Cart item not found');
    return this.get(user);
  }

  async addFromOrder(
    user: AuthUser,
    items: { productId: string; quantity: number }[],
  ) {
    this.assertCustomer(user);
    if (!items.length)
      throw new BadRequestException('This order has no items to reorder');
    const cart = await this.prisma.cart.upsert({
      where: { customerId: user.id },
      create: { customerId: user.id },
      update: {},
    });
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: items.map((item) => item.productId) },
        isActive: true,
      },
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    let added = 0;
    for (const item of items) {
      const product = byId.get(item.productId);
      if (!product || product.stock < 1) continue;
      const existing = await this.prisma.cartItem.findUnique({
        where: {
          cartId_productId: { cartId: cart.id, productId: product.id },
        },
      });
      const quantity = Math.min(
        (existing?.quantity ?? 0) + item.quantity,
        product.stock,
      );
      if (quantity < 1) continue;
      await this.prisma.cartItem.upsert({
        where: {
          cartId_productId: { cartId: cart.id, productId: product.id },
        },
        create: { cartId: cart.id, productId: product.id, quantity },
        update: { quantity },
      });
      added += 1;
    }
    if (!added)
      throw new NotFoundException(
        'None of the order items are available to add to the cart',
      );
    return this.get(user);
  }

  toResponse(cart: {
    id: string;
    customerId: string;
    items: {
      id: string;
      productId: string;
      quantity: number;
      product: {
        id: string;
        name: string;
        price: unknown;
        stock: number;
        imageUrls: string[];
        slug: string | null;
        features: string[];
        taxable: boolean;
      };
    }[];
  }) {
    const items = cart.items.map((item) => {
      const unitPrice = Number(item.product.price);
      return {
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        lineTotal: Number((unitPrice * item.quantity).toFixed(2)),
        product: {
          id: item.product.id,
          name: item.product.name,
          price: unitPrice,
          stock: item.product.stock,
          imageUrls: item.product.imageUrls,
          slug: item.product.slug,
          tagline: item.product.features[0] ?? null,
          inStock: item.product.stock > 0,
          taxable: item.product.taxable,
        },
      };
    });
    return {
      id: cart.id,
      customerId: cart.customerId,
      items,
      itemCount: items.reduce((count, item) => count + item.quantity, 0),
      currency: checkoutCurrency(),
      ...quoteOrderTotals(
        cart.items.map((item) => ({
          price: Number(item.product.price),
          quantity: item.quantity,
          taxable: item.product.taxable,
        })),
      ),
    };
  }
}
