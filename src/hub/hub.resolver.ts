import { Role } from '@prisma/client';
import { SetMetadata, UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import { RolesGuard } from 'src/auth/gql-signup.guard';
import { SortOrder } from 'src/common/sort-order/sort-order.input';
import { PaginationArgs } from 'src/common/pagination/pagination.input';
import { HubService } from './services/hub.service';
import { GetProductArgs, ProductFilterInputForHub } from './dto/product';
import { PaginatedProducts } from 'src/products/models/paginated-products.model';
import {
  GetVendorsArgs,
  UpdateVendorInputForHub,
  VendorFilterInputForHub,
} from './dto/vendor';
import { PaginatedVendors } from './models/vendor';
import { SignupInput } from 'src/auth/dto/signup.input';
import { User } from 'src/users/models/user.model';
import { GetUsersArgs, UserFilterInputForHub } from './dto/user';
import { PaginatedUsers } from './models/user';
import { PaginatedOrders } from 'src/orders/models/paginated-orders.model';
import { GetOrderArgs, OrderFilterInputForHub } from './dto/order';
import { PaginatedCategories } from 'src/categories/models/paginated-categories.model';
import { CategoryFilterInputForHub, GetCategoryArgs } from './dto/category';
import { Vendor } from 'src/vendors/models/vendor.model';
import { SubscriberCountFilterInputForHub } from './dto/subscriber';
import { SubscriberPlan } from './models/subscriber';

@Resolver('hub')
export class HubResolver {
  constructor(private readonly hubService: HubService) {}

  // Queries

  @UseGuards(RolesGuard)
  @SetMetadata('role', Role.AGENT)
  @Query(() => PaginatedProducts)
  getProductsForHub(
    @Args('pagination', { nullable: true }) pg: PaginationArgs,
    @Args('sortOrder', { nullable: true }) sortOrder: SortOrder,
    @Args('filter', { nullable: true }) filter: ProductFilterInputForHub
  ): Promise<PaginatedProducts> {
    const data: GetProductArgs = {
      pg,
      sortOrder,
      filter,
    };
    return this.hubService.getProducts(data);
  }

  @UseGuards(RolesGuard)
  @SetMetadata('role', Role.AGENT)
  @Query(() => PaginatedVendors)
  getVendorsForHub(
    @Args('pagination', { nullable: true }) pg: PaginationArgs,
    @Args('sortOrder', { nullable: true }) sortOrder: SortOrder,
    @Args('filter', { nullable: true }) filter: VendorFilterInputForHub
  ): Promise<PaginatedVendors> {
    const data: GetVendorsArgs = {
      pg,
      sortOrder,
      filter,
    };
    return this.hubService.getVendors(data);
  }

  @UseGuards(RolesGuard)
  @SetMetadata('role', Role.AGENT)
  @Query(() => PaginatedUsers)
  getUsersForHub(
    @Args('pagination', { nullable: true }) pg: PaginationArgs,
    @Args('sortOrder', { nullable: true }) sortOrder: SortOrder,
    @Args('filter', { nullable: true }) filter: UserFilterInputForHub
  ): Promise<PaginatedUsers> {
    const data: GetUsersArgs = {
      pg,
      sortOrder,
      filter,
    };
    return this.hubService.getUsers(data);
  }

  @UseGuards(RolesGuard)
  @SetMetadata('role', Role.AGENT)
  @Query(() => PaginatedOrders)
  getOrdersForHub(
    @Args('pagination', { nullable: true }) pg: PaginationArgs,
    @Args('sortOrder', { nullable: true }) sortOrder: SortOrder,
    @Args('filter', { nullable: true }) filter: OrderFilterInputForHub
  ): Promise<PaginatedOrders> {
    const data: GetOrderArgs = {
      pg,
      sortOrder,
      filter,
    };
    return this.hubService.getOrders(data);
  }

  @UseGuards(RolesGuard)
  @SetMetadata('role', Role.AGENT)
  @Query(() => PaginatedCategories)
  getCategoriesForHub(
    @Args('pagination', { nullable: true }) pg: PaginationArgs,
    @Args('sortOrder', { nullable: true }) sortOrder: SortOrder,
    @Args('filter', { nullable: true }) filter: CategoryFilterInputForHub
  ): Promise<PaginatedCategories> {
    const data: GetCategoryArgs = {
      pg,
      sortOrder,
      filter,
    };
    return this.hubService.getCategories(data);
  }

  @UseGuards(RolesGuard)
  @SetMetadata('role', Role.AGENT)
  @Query(() => [SubscriberPlan])
  subscriberCount(
    @Args('filter', { nullable: true }) filter: SubscriberCountFilterInputForHub
  ): Promise<[SubscriberPlan]> {
    return this.hubService.getSubscriberCount(filter);
  }

  // Mutations

  @UseGuards(RolesGuard)
  @SetMetadata('role', Role.ADMIN)
  @Mutation(() => User)
  createAgentForHub(@Args('data') data: SignupInput): Promise<User> {
    data.email = data.email.toLowerCase();
    return this.hubService.createAgent(data);
  }

  @UseGuards(RolesGuard)
  @SetMetadata('role', Role.ADMIN)
  @Mutation(() => Vendor)
  updateVendorForHub(
    @Args('id') id: string,
    @Args('data') data: UpdateVendorInputForHub
  ): Promise<Vendor> {
    return this.hubService.updateVendor(id, data);
  }
}
