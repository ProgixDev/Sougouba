import { Controller, Get, Param, ParseUUIDPipe, Query, Res, UsePipes } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import {
  bestSellersQuerySchema,
  productIdsSchema,
  productListSchema,
  productQuerySchema,
  productSearchSchema,
  type BestSellersQuery,
  type ProductIdsQuery,
  type ProductListQuery,
  type ProductQuery,
  type ProductSearchQuery,
} from './dto/product.dto.js';
import { searchSuggestSchema, type SearchSuggestQuery } from './dto/search.dto.js';
import { vendorQuerySchema, type VendorQuery } from './dto/vendor.dto.js';
import { ProductsService } from './products.service.js';
import { SearchSuggestionsService } from './search-suggestions.service.js';
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
    private readonly products: ProductsService,
    private readonly suggestions: SearchSuggestionsService
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

  /**
   * The catalogue, platform-wide. `?categoryId=` is the category browse and
   * `?vendorId=` narrows to one shop, so a screen needs one request rather
   * than the shop list plus a shelf per shop.
   */
  @Get('products')
  @UsePipes(new ZodValidationPipe(productListSchema))
  listProducts(@Query() query: ProductListQuery) {
    return this.products.list(query);
  }

  /**
   * Several products by id — the cart, checkout and the favourites list.
   *
   * Declared above `products/:id`, like `vendors/slug/:slug` above
   * `vendors/:id` and for the same reason: Nest matches in declaration order,
   * so `:id` would otherwise take this with `id="by-ids"` and 400 on the uuid
   * pipe.
   */
  @Get('products/by-ids')
  @UsePipes(new ZodValidationPipe(productIdsSchema))
  productsByIds(@Query() query: ProductIdsQuery) {
    return this.products.byIds(query.ids);
  }

  /**
   * The best sellers of the last 30 days, platform-wide — ids, most units
   * first. Public, like the rest of the catalogue: the ranking is what the
   * home screen shows everyone. Above `products/:id` for the same reason as
   * `by-ids`.
   */
  @Get('products/best-sellers')
  @UsePipes(new ZodValidationPipe(bestSellersQuerySchema))
  async bestSellers(@Query() query: BestSellersQuery) {
    return { ids: await this.products.bestSellerIds(query.limit) };
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

  /**
   * What the search panel offers while the shopper types: shops whose name or
   * specialty matches, and product names and tags to search for. Public, like
   * the catalogue it is drawn from.
   *
   * The answer is the same for everyone and is already kept a minute by the
   * service; the header lets a CDN or the phone's own HTTP cache keep it as
   * long, so a repeated search need not reach this process at all. It is set
   * once there is an answer and not by `@Header`, which would stamp a failure
   * too — and a cached error is a minute of broken suggestions for everyone
   * behind that cache.
   */
  @Get('search/suggestions')
  async suggest(
    @Query(new ZodValidationPipe(searchSuggestSchema)) query: SearchSuggestQuery,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const suggestions = await this.suggestions.suggest(query.q);
    reply.header('Cache-Control', 'public, max-age=60');
    return suggestions;
  }
}
