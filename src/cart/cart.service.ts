import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { Cart } from './models/cart.model';

import { CartItemInput } from './dto/cart.input';
import {
  OrderStatus,
  PaymentMethods,
  Prisma,
  ProductType,
} from '@prisma/client';
import { CartItemService } from './services/cart-item.service';
import { find, omit } from 'lodash';
import { VendorsService } from 'src/vendors/vendors.service';
import { nanoid } from 'nanoid';
import { SendgridService } from 'src/sendgrid/sendgrid.service';
import { ORDER_OPTIONS, SendEmails } from 'src/utils/email';

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartItemService: CartItemService,
    private readonly vendorService: VendorsService,
    private readonly emailService: SendgridService
  ) {}

  async createNewCart(vendorId: string, customerId: string): Promise<Cart> {
    return await this.prisma.cart.create({
      data: {
        customerId,
        vendorId,
        finalPrice: 0,
        totalPrice: 0,
        items: [],
      },
    });
  }

  async getCart(cartId: string): Promise<Cart> {
    return await this.prisma.cart.findUnique({
      where: { id: cartId },
    });
  }

  async getCartByCustomer(customerId: string, vendorId: string): Promise<Cart> {
    return this.prisma.cart.findFirst({
      where: {
        customerId: customerId.toString(),
        vendorId: vendorId.toString(),
      },
    });
  }

  async updateCartPrice(
    cartId: string,
    prices: { totalPrice: number }
  ): Promise<Cart> {
    return await this.prisma.cart.update({
      where: { id: cartId },
      data: {
        ...prices,
      },
    });
  }

  async addItemToCart(cartId: string, data: CartItemInput) {
    const cart = await this.getCart(cartId);

    const product = await this.prisma.product.findUnique({
      where: { id: data.productId },
    });

    let cartData: Prisma.CartUpdateArgs['data'] = {};

    switch (product.type) {
      case ProductType.PRODUCT:
        cartData = this.cartItemService.addProduct(product, cart, data);
        break;
      case ProductType.WORKSHOP:
        cartData = await this.cartItemService.addWorkshopToCart(
          product,
          cart,
          data
        );
        break;
      case ProductType.SERVICE:
        cartData = await this.cartItemService.addServiceToCart(
          product,
          cart,
          data
        );
      default:
        break;
    }

    const updatedCart = await this.prisma.cart.update({
      where: { id: cartId },
      data: omit(cartData, ['id']),
    });

    return updatedCart;
  }

  async removeItemFromCart(cartId: string, productId: string, sku: string) {
    const cart = await this.getCart(cartId);

    const items = cart.items.filter(
      (item) => item.productId !== productId && item.sku !== sku
    );

    const totalPrice = items.reduce(
      (acc, item) => acc + item.price * item.quantity,
      0
    );

    return this.prisma.cart.update({
      where: { id: cartId },
      data: {
        items,
        totalPrice,
      },
    });
  }

  async updateCartItem(cartId: string, data: CartItemInput) {
    const cart = await this.getCart(cartId);
    const newItem = {
      ...find(cart.items, {
        productId: data.productId,
        sku: data.sku,
      }),
      ...data,
    };

    const items = cart.items.map((item) =>
      item.productId === data.productId && item.sku === data.sku
        ? newItem
        : item
    );

    const totalPrice = items.reduce(
      (acc, item) => acc + item.price * item.quantity,
      0
    );

    return this.prisma.cart.update({
      where: { id: cartId },
      data: {
        items,
        totalPrice,
      },
    });
  }

  async checkoutCart(cartId: string) {
    const cart = await this.getCart(cartId);
    // const cartItems = await this.cartItemService.getCartItems(cartId);

    return;
  }

  async getCartAndDelete(cartId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { id: cartId },
    });

    const deleteData = await this.prisma.cart.delete({
      where: { id: cartId },
    });
    console.log({ deleteData });

    return cart;
  }

  //this should not type any, but this was generating error on assigning it a type
  async updateCart(cartId: string, data: any) {
    return this.prisma.cart.update({
      where: { id: cartId },
      data: data,
    });
  }

  async checkoutCartAndCreateOrder(cartId: string) {
    // TODO - add payment gateway

    const cart = await this.getCart(cartId);

    switch (cart.paymentMethod) {
      case PaymentMethods.ONLINE:
        // send request to my fatura
        break;
      case PaymentMethods.BANK_TRANSFER:
      case PaymentMethods.CASH:
      case PaymentMethods.STORE:
      default:
        break;
    }
    const { vendorId } = cart;

    const vendorPrefix = await this.vendorService.getVendorOrderPrefix(
      vendorId
    );
    const vendor = await this.vendorService.getVendor(vendorId);

    const orderId = `${vendorPrefix}-${nanoid(8)}`.toUpperCase();

    const res = await this.prisma.order.create({
      data: {
        orderId,
        items: cart.items,
        customerId: cart.customerId,
        customerInfo: cart.customerInfo,
        paymentMethod: cart.paymentMethod,
        appliedCoupon: cart.appliedCoupon,
        ...(cart.deliveryMethod && {
          deliveryMethod: cart.deliveryMethod,
        }),
        finalPrice: cart.totalPrice,
        totalPrice: cart.totalPrice,
        status: OrderStatus.CREATED,
        vendor: {
          connect: {
            id: vendorId,
          },
        },
        cart: {
          connect: {
            id: cartId,
          },
        },
      },
    });

    // Email notification to vendor and customer when order is created
    if (res.id) {
      this.emailService.send(
        SendEmails(ORDER_OPTIONS.PURCHASED, res?.customerInfo?.email)
      );
      if (vendor?.info?.email)
        this.emailService.send(
          SendEmails(ORDER_OPTIONS.RECEIVED, vendor?.info?.email)
        );
    }

    return res;
  }
}