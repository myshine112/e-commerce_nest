import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from 'nestjs-prisma';
import { BookingsService } from 'src/bookings/bookings.service';
import { ProductsService } from '../../products/services/products.service';
import { AddToCartInput } from '../dto/add-to-cart.input';
import { CartItem } from '../models/cart-item.model';
import { CartService } from './cart.service';

@Injectable()
export class CartItemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
    private readonly productService: ProductsService
  ) {}

  async getCartItems(cartId: string): Promise<CartItem[]> {
    return this.prisma.cartItem.findMany({ where: { cartId } });
  }

  async getCartItemFromProduct(
    productId: string,
    productVariant?: string
  ): Promise<CartItem> {
    return (
      await this.prisma.cartItem.findMany({
        where: { productId, productVariant },
      })
    )[0];
  }

  async addProductToCart(data: AddToCartInput): Promise<CartItem> {
    const { productId, productVariant, quantity, cartId } = data;
    if (!cartId) {
      throw new BadRequestException('No cart created');
    }
    const product = await this.productService.getProduct(productId);
    if (
      productVariant &&
      product.variants.findIndex((item) => item.id === productVariant) === -1
    ) {
      // throws exception when there is no product with such productVariant
      throw new BadRequestException('No variant found on the product');
    }
    const cartItem = await this.getCartItemFromProduct(
      productId,
      productVariant
    );
    if (cartItem) {
      return this.updateQuantity(cartItem.id, cartItem.quantity + quantity);
    } else {
      // if the cart item does not exist, create the item
      return this.prisma.cartItem.create({
        data: { productId, productVariant, quantity, cartId },
      });
    }
  }

  async addWorkspaceToCart(data: AddToCartInput): Promise<CartItem> {
    const { productId, productVariant, quantity, cartId } = data;
    if (!cartId) {
      throw new BadRequestException('No cart created');
    }
    const product = await this.productService.getProduct(productId);
    if (
      productVariant &&
      product.variants.findIndex((item) => item.id === productVariant) === -1
    ) {
      // throws exception when there is no product with such productVariant
      throw new BadRequestException('No variant found on the product');
    }
    const cartItem = await this.getCartItemFromProduct(
      productId,
      productVariant
    );
    if (cartItem) {
      return this.updateQuantity(cartItem.id, quantity);
    } else {
      // if the cart item does not exist, create the item
      return this.prisma.cartItem.create({
        data: { productId, productVariant, quantity, cartId },
      });
    }
  }

  // TODO revisit HOLD booking logic
  async addServiceToCart(data: AddToCartInput): Promise<CartItem> {
    const {
      productId,
      productVariant,
      quantity,
      cartId,
      slots,
      vendorId,
      tagId,
    } = data;
    if (!cartId) {
      throw new BadRequestException('No cart created');
    }

    // create booking
    await this.prisma.booking.create({
      data: {
        status: BookingStatus.HOLD,
        times: slots,
        tag: { connect: { id: tagId } },
        vendor: { connect: { id: vendorId } },
        cart: { connect: { id: cartId } },
        product: { connect: { id: productId } },
      },
    });

    const tag = await this.prisma.tag.findUnique({
      where: { id: tagId },
    });

    const tagAvailabilities = []; // TODO: get availabilities from tag bookings
    const updatedAvailabilities = tagAvailabilities.map((item) => {
      const booked = slots.find(
        (slot) =>
          slot.date === item.date &&
          slot.startTime === item.startTime &&
          slot.endTime === item.endTime
      );
      if (booked) {
        return {
          ...item,
          isAvailable: false,
        };
      } else return item;
    });

    // await this.prisma.tag.update({
    //   where: { id: tagId },
    //   data: { availabilities: updatedAvailabilities },
    // });

    const cartItem = await this.getCartItemFromProduct(productId);
    if (cartItem) {
      // if the cart item exists
      // just update tagId, slots
      return this.prisma.cartItem.update({
        where: { id: cartItem.id },
        data: { tagId, slots },
      });
    } else {
      // otherwise, add the service item to the cart
      return this.prisma.cartItem.create({
        data: { productId, productVariant, quantity, tagId, slots, cartId },
      });
    }
  }

  async removeItemFromCart(cartItemId: string): Promise<CartItem> {
    const removedItem = await this.prisma.cartItem.delete({
      where: { id: cartItemId },
    });
    // update cart price
    return removedItem;
  }

  async updateQuantity(
    cartItemId: string,
    quantity: number
  ): Promise<CartItem> {
    const updatedItem = await this.prisma.cartItem.update({
      where: { id: cartItemId },
      data: { quantity },
    });
    // update cart price
    return updatedItem;
  }
}
