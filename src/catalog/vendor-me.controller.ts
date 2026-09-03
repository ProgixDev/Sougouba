import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import {
  createProductSchema,
  productQuerySchema,
  updateProductSchema,
  type CreateProductInput,
  type ProductQuery,
  type UpdateProductInput,
} from './dto/product.dto.js';
import {
  applyVendorSchema,
  sectionSchema,
  setHoursSchema,
  updateVendorSchema,
  type ApplyVendorInput,
  type SectionInput,
  type SetHoursInput,
  type UpdateVendorInput,
} from './dto/vendor.dto.js';
import { ProductsService } from './products.service.js';
import { VendorsService } from './vendors.service.js';

/**
 * A merchant managing their own shop. Every route is scoped to the vendor owned
 * by the caller — there is no `:vendorId` anywhere in here on purpose, so
 * there is no id for a caller to substitute. Ownership is resolved from the
 * token, once, in the service layer.
 */
@ApiTags('merchant')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('vendors')
export class VendorMeController {
  constructor(
    private readonly vendors: VendorsService,
    private readonly products: ProductsService
  ) {}

  /** Registration. Declared before `me` is irrelevant (different verb), but kept first as the lifecycle's start. */
  @Post('apply')
  apply(@CurrentUser() userId: string, @Body(new ZodValidationPipe(applyVendorSchema)) body: ApplyVendorInput) {
    return this.vendors.apply(userId, body);
  }

  @Get('me')
  mine(@CurrentUser() userId: string) {
    return this.vendors.mine(userId);
  }

  @Patch('me')
  update(@CurrentUser() userId: string, @Body(new ZodValidationPipe(updateVendorSchema)) body: UpdateVendorInput) {
    return this.vendors.update(userId, body);
  }

  /** The whole week at once — see `setHoursSchema` for why this is a PUT and not a PATCH. */
  @Put('me/hours')
  setHours(@CurrentUser() userId: string, @Body(new ZodValidationPipe(setHoursSchema)) body: SetHoursInput) {
    return this.vendors.setHours(userId, body);
  }

  @Post('me/sections')
  addSection(@CurrentUser() userId: string, @Body(new ZodValidationPipe(sectionSchema)) body: SectionInput) {
    return this.vendors.addSection(userId, body);
  }

  @Patch('me/sections/:id')
  updateSection(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sectionSchema)) body: SectionInput
  ) {
    return this.vendors.updateSection(userId, id, body);
  }

  @Delete('me/sections/:id')
  @HttpCode(204)
  removeSection(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.vendors.removeSection(userId, id);
  }

  // ── catalogue ─────────────────────────────────────────────────────────────

  @Get('me/products')
  listProducts(
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(productQuerySchema)) query: ProductQuery
  ) {
    return this.products.listMine(userId, query);
  }

  @Post('me/products')
  createProduct(@CurrentUser() userId: string, @Body(new ZodValidationPipe(createProductSchema)) body: CreateProductInput) {
    return this.products.create(userId, body);
  }

  @Patch('me/products/:id')
  updateProduct(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) body: UpdateProductInput
  ) {
    return this.products.update(userId, id, body);
  }

  @Delete('me/products/:id')
  @HttpCode(204)
  removeProduct(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.remove(userId, id);
  }
}
