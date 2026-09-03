import { Controller, Get, Param, ParseUUIDPipe, Query, UsePipes } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { productQuerySchema, productSearchSchema, type ProductQuery, type ProductSearchQuery } from './dto/product.dto.js';
import { vendorQuerySchema, type VendorQuery } from './dto/vendor.dto.js';
import { ProductsService } from './products.service.js';
import { VendorsService } from './vendors.service.js';

/**
 * The shopper's half of the catalogue — everything here is public and
 * approved-only. The merchant's own shop, at whatever status, lives on
 * `VendorMeController` behind the auth guard.
 */
@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(
    private readonly vendors: VendorsService,
    private readonly products: ProductsService
  ) {}

  @Get('verticals')
  verticals() {
    return this.vendors.verticals();
  }

  @Get('vendors')
  @UsePipes(new ZodValidationPipe(vendorQuerySchema))
  listVendors(@Query() query: VendorQuery) {
    return this.vendors.list(query);
  }

  /**
   * Declared before `vendors/:id` — Nest matches routes in declaration order,
   * and `slug/:slug` would otherwise be swallowed by `:id` with `id="slug"`.
   */
  @Get('vendors/slug/:slug')
  bySlug(@Param('slug') slug: string) {
    return this.vendors.bySlug(slug);
  }

  @Get('vendors/:id')
  byId(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendors.byId(id);
  }

  @Get('vendors/:id/products')
  listVendorProducts(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(productQuerySchema)) query: ProductQuery
  ) {
    return this.products.listForVendor(id, query);
  }

  @Get('products/search')
  @UsePipes(new ZodValidationPipe(productSearchSchema))
  search(@Query() query: ProductSearchQuery) {
    return this.products.search(query);
  }

  @Get('products/:id')
  product(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.byId(id);
  }
}
