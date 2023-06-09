import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import {
  Prisma,
  AttendanceType,
  User,
  Role,
  ProductType,
} from '@prisma/client';

import { throwNotFoundException } from 'src/utils/validation';
import { SortOrder } from 'src/common/sort-order/sort-order.input';
import getPaginationArgs from 'src/common/helpers/getPaginationArgs';
import { GetProductArgs, ProductFilterInputForHub } from '../dto/product';
import { PaginatedProducts } from 'src/products/models/paginated-products.model';
import {
  GetVendorsArgs,
  UpdateVendorInputForHub,
  VendorFilterInputForHub,
} from '../dto/vendor';
import { PaginatedVendors } from '../models/vendor';
import { SignupInput } from 'src/auth/dto/signup.input';
import { PasswordService } from 'src/auth/password.service';
import { PaginatedUsers } from '../models/user';
import { GetUsersArgs, UserFilterInputForHub } from '../dto/user';
import { PaginatedOrders } from 'src/orders/models/paginated-orders.model';
import { GetOrderArgs, OrderFilterInputForHub } from '../dto/order';
import { CategoryFilterInputForHub, GetCategoryArgs } from '../dto/category';
import { PaginatedCategories } from 'src/categories/models/paginated-categories.model';
import { getSubscriptionPrice } from 'src/utils/subscription';
import { AddSubscriptionInputWithPrice } from 'src/vendors/dto/add-subscription-input';
import { SubscriberCountFilterInputForHub } from '../dto/subscriber';
import { SubscriberPlan } from '../models/subscriber';

@Injectable()
export class HubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService
  ) {}

  getOrderByValue = (sortOrder: SortOrder) => {
    if (sortOrder) return { [sortOrder.field]: sortOrder.direction };
    else return { createdAt: Prisma.SortOrder.asc };
  };

  getWhereClauseValue = (
    filter:
      | ProductFilterInputForHub
      | VendorFilterInputForHub
      | UserFilterInputForHub
      | OrderFilterInputForHub
      | CategoryFilterInputForHub,
    ignoreKeyList: string[],
    booleanKey?: string
  ) => {
    const where = {};

    if (filter) {
      for (const filterKey of Object.keys(filter)) {
        if (
          filterKey === booleanKey &&
          typeof filter?.[booleanKey] === 'boolean'
        )
          where[filterKey] = filter[filterKey];

        if (!ignoreKeyList?.includes(filterKey) && filter[filterKey]?.length)
          where[filterKey] = { in: filter[filterKey] };
      }
    }

    return where;
  };

  getProducts = async ({
    pg,
    sortOrder,
    filter,
  }: GetProductArgs): Promise<PaginatedProducts> => {
    try {
      const { skip, take } = getPaginationArgs(pg);
      const orderBy = this.getOrderByValue(sortOrder);
      const where: Prisma.ProductWhereInput = this.getWhereClauseValue(
        filter,
        [],
        'active'
      );

      const products = await this.prisma.product.findMany({
        where,
        skip,
        take: take || undefined,
        orderBy,
      });

      throwNotFoundException(products?.length, '', 'No product available');

      const list = [];
      for (const product of products) {
        product.badge = {
          ...product?.badge,
          label: product.meetingLink
            ? AttendanceType.ONLINE
            : AttendanceType.PHYSICAL,
        };

        const quantity = await this.prisma.workshop.aggregate({
          where: { productId: product.id },
          _sum: { quantity: true },
        });

        if (quantity?._sum?.quantity) {
          product.bookedSeats += quantity?._sum?.quantity;
        }

        list.push(product);
      }

      const totalCount = await this.prisma.product.count({ where });

      return {
        list,
        totalCount: totalCount || 0,
      };
    } catch (err) {
      throw new Error(err);
    }
  };

  getVendors = async ({
    pg,
    sortOrder,
    filter,
  }: GetVendorsArgs): Promise<PaginatedVendors> => {
    try {
      const { skip, take } = getPaginationArgs(pg);
      const orderBy = this.getOrderByValue(sortOrder);
      const where: Prisma.VendorWhereInput = this.getWhereClauseValue(
        filter,
        ['vendorId', 'email'],
        'active'
      );

      if (filter?.vendorId?.length) where['id'] = { in: filter?.vendorId };

      if (filter?.email?.length)
        where['info'] = { is: { email: { in: filter?.email } } };

      const vendors = await this.prisma.vendor.findMany({
        where,
        skip,
        take: take || undefined,
        orderBy,
        include: {
          owner: true, // Return all fields
          assign: true, // Return all fields
          _count: {
            select: {
              orders: true,
              categories: true,
              coupons: true,
            },
          },
        },
      });

      throwNotFoundException(vendors?.length, '', 'No vendor available');

      const extendedVendors = [];

      for (const vendor of vendors) {
        const vendorId = vendor.id;

        const workShopCountPromise = this.prisma.product.count({
          where: { vendorId, type: ProductType.WORKSHOP },
        });

        const serviceCountPromise = this.prisma.product.count({
          where: { vendorId, type: ProductType.SERVICE },
        });

        const productCountPromise = this.prisma.product.count({
          where: { vendorId, type: ProductType.PRODUCT },
        });

        const orderAggregationPromise = this.prisma.order.aggregate({
          _avg: { totalPrice: true },
          _sum: { subTotal: true },
          where: { vendorId },
        });

        const avgMonthlySalesPromise = this.prisma.order.aggregateRaw({
          pipeline: [
            {
              $match: {
                vendorId: { $oid: vendorId },
              },
            },
            {
              $group: {
                _id: {
                  month: {
                    $dateToString: {
                      format: '%m %Y',
                      date: '$createdAt',
                    },
                  },
                },
                averageSale: {
                  $avg: '$totalPrice',
                },
              },
            },
          ],
        });

        const [
          workShopCount,
          serviceCount,
          productCount,
          orderAggregation,
          avgMonthlySales,
        ] = await Promise.all([
          workShopCountPromise,
          serviceCountPromise,
          productCountPromise,
          orderAggregationPromise,
          avgMonthlySalesPromise,
        ]);

        extendedVendors.push({
          ...vendor,
          totalProductCount: productCount + workShopCount + serviceCount,
          workShopCount,
          serviceCount,
          productCount,
          orderCount: vendor?._count?.orders,
          avgOrderSize: orderAggregation?._avg?.totalPrice,
          avgMonthlySales,
          revenue: orderAggregation?._sum?.subTotal,
          couponCount: vendor?._count?.coupons,
          categoryCount: vendor?._count?.categories,
        });
      }

      const totalCount = await this.prisma.vendor.count({ where });

      return {
        list: extendedVendors,
        totalCount: totalCount || 0,
      };
    } catch (err) {
      throw new Error(err);
    }
  };

  getUsers = async ({
    pg,
    sortOrder,
    filter,
  }: GetUsersArgs): Promise<PaginatedUsers> => {
    try {
      const { skip, take } = getPaginationArgs(pg);
      const orderBy = this.getOrderByValue(sortOrder);
      const where: Prisma.UserWhereInput = this.getWhereClauseValue(
        filter,
        ['userId'],
        'verified'
      );

      if (filter?.userId?.length) where['id'] = { in: filter?.userId };

      const users = await this.prisma.user.findMany({
        where,
        skip,
        take: take || undefined,
        orderBy,
      });

      throwNotFoundException(users?.length, '', 'No user available');

      const totalCount = await this.prisma.user.count({ where });

      return {
        list: users,
        totalCount: totalCount || 0,
      };
    } catch (err) {
      throw new Error(err);
    }
  };

  getOrders = async ({
    pg,
    sortOrder,
    filter,
  }: GetOrderArgs): Promise<PaginatedOrders> => {
    try {
      const { skip, take } = getPaginationArgs(pg);
      const orderBy = this.getOrderByValue(sortOrder);
      const where: Prisma.OrderWhereInput = this.getWhereClauseValue(filter, [
        'productId',
        'email',
      ]);

      if (filter?.productId?.length)
        where['items'] = { some: { productId: { in: filter?.productId } } };

      if (filter?.email?.length)
        where['customerInfo'] = { is: { email: { in: filter?.email } } };

      const orders = await this.prisma.order.findMany({
        where,
        skip,
        take: take || undefined,
        orderBy,
      });

      throwNotFoundException(orders?.length, '', 'No order available');

      const totalCount = await this.prisma.order.count({ where });

      return {
        list: orders,
        totalCount: totalCount || 0,
      };
    } catch (err) {
      throw new Error(err);
    }
  };

  getCategories = async ({
    pg,
    sortOrder,
    filter,
  }: GetCategoryArgs): Promise<PaginatedCategories> => {
    try {
      const { skip, take } = getPaginationArgs(pg);
      const orderBy = this.getOrderByValue(sortOrder);
      const where: Prisma.CategoryWhereInput = this.getWhereClauseValue(
        filter,
        [],
        'active'
      );

      const categories = await this.prisma.category.findMany({
        where,
        skip,
        take: take || undefined,
        orderBy,
      });

      throwNotFoundException(categories?.length, '', 'No category available');

      const totalCount = await this.prisma.category.count({ where });

      return {
        list: categories,
        totalCount: totalCount || 0,
      };
    } catch (err) {
      throw new Error(err);
    }
  };

  getSubscriberCount = async (
    filter: SubscriberCountFilterInputForHub
  ): Promise<[SubscriberPlan]> => {
    try {
      const pipeline = [];
      if (typeof filter?.active === 'boolean') {
        pipeline.push({
          $match: {
            active: filter?.active,
          },
        });
      }
      const subscribers = await this.prisma.vendor.aggregateRaw({
        pipeline: [
          ...pipeline,
          { $group: { _id: '$subscription.plan', vendor: { $sum: 1 } } },
        ],
      });

      const response = Object.values(subscribers).filter(
        (subscriber: { [Key in string]?: string | number }) => subscriber._id
      );

      throwNotFoundException(response?.length, '', 'No data available');
      return response as any;
    } catch (err) {
      throw new Error(err);
    }
  };

  createAgent = async (payload: SignupInput): Promise<User> => {
    const hashedPassword = await this.passwordService.hashPassword(
      payload.password
    );

    try {
      return await this.prisma.user.create({
        data: {
          ...payload,
          password: hashedPassword,
          role: payload.role || Role.AGENT,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(`Email ${payload.email} already used.`);
      }
      throw new Error(e);
    }
  };

  updateVendor = (id: string, updateVendorInput: UpdateVendorInputForHub) => {
    let subscriptionObj: AddSubscriptionInputWithPrice;
    const { subscription } = updateVendorInput;

    if (subscription) {
      subscriptionObj = {
        ...subscription,
        price: getSubscriptionPrice(subscription.type, subscription.plan),
      };
    }

    return this.prisma.vendor.update({
      data: {
        ...updateVendorInput,
        subscription: subscriptionObj,
        updatedAt: new Date(),
      },
      where: { id },
    });
  };
}
