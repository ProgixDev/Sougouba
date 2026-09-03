import { Module } from '@nestjs/common';

import { GeoModule } from '../geo/geo.module.js';
import { CategoriesController, CategoriesService } from './categories.controller.js';
import { ProductsService } from './products.service.js';
import { VendorMeController } from './vendor-me.controller.js';
import { CatalogController } from './vendors.controller.js';
import { VendorsService } from './vendors.service.js';

/**
 * Vendors, products and categories in one module, named to match the plan's own
 * domain split (docs/BACKEND-BUILD-PHASES.md, "Repo & framework"). They share a
 * response mapper, an ownership rule and a media-path rule; splitting them into
 * three modules would mean exporting all three between them.
 *
 * `GeoModule` is here for the same reason `AddressesModule` imports it: a shop's
 * address is geocoded on registration, so its distance to a courier is a real
 * one from Phase 5 on.
 */
@Module({
  imports: [GeoModule],
  // Order matters: Nest matches routes in registration order, and
  // `CatalogController`'s `GET vendors/:id` would otherwise swallow
  // `GET vendors/me` (as id="me", which `ParseUUIDPipe` then 400s). The
  // merchant's fixed paths have to be offered first.
  controllers: [VendorMeController, CatalogController, CategoriesController],
  providers: [VendorsService, ProductsService, CategoriesService],
  exports: [VendorsService, ProductsService],
})
export class CatalogModule {}
