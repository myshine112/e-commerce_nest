import { Field, ObjectType, Int } from '@nestjs/graphql';
import { BaseModel } from 'src/common/models/base.model';
import { MetaDetails, Vendor } from 'src/vendors/models/vendor.model';
import { Product } from 'src/products/models/product.model';

@ObjectType()
export class Category extends BaseModel {
  title: string;
  title_ar: string;
  vendorId: string;
  @Field(() => Vendor, { nullable: false })
  vendor?: Vendor;

  @Field(() => [Product], { nullable: false })
  products?: Product[];

  active: boolean;

  @Field(() => Int, { nullable: true })
  sortOrder?: number;
  slug?: string;

  @Field(() => MetaDetails, { nullable: true })
  meta?: MetaDetails;
}
