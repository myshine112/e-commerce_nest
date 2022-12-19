import { Module } from '@nestjs/common';
import { ProductsService } from './services/products.service';
import { ProductsResolver } from './products.resolver';
import { VendorsModule } from 'src/vendors/vendors.module';
import { CategoriesModule } from 'src/categories/categories.module';
import { TagModule } from 'src/tags/tags.module';

// import { ProductVariantsService } from './services/product-variants.service';
// import { ProductVariantsResolver } from './resolvers/product-variants.resolver';

@Module({
  imports: [VendorsModule, CategoriesModule, TagModule],
  providers: [
    ProductsResolver,
    ProductsService,
    // ProductVariantsResolver,
    // ProductVariantsService,
  ],
  exports: [
    ProductsService,
    // ProductVariantsService
  ],
})
export class ProductsModule {}
