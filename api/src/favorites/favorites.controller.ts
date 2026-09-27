import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { FavoritesService } from './favorites.service.js';

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('me/favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get('products')
  listProducts(@CurrentUser() userId: string) {
    return this.favorites.listProducts(userId);
  }

  @Post('products/:productId')
  addProduct(@CurrentUser() userId: string, @Param('productId') productId: string) {
    return this.favorites.addProduct(userId, productId);
  }

  @Delete('products/:productId')
  removeProduct(@CurrentUser() userId: string, @Param('productId') productId: string) {
    return this.favorites.removeProduct(userId, productId);
  }

  @Get('vendors')
  listVendors(@CurrentUser() userId: string) {
    return this.favorites.listVendors(userId);
  }

  @Post('vendors/:vendorId')
  addVendor(@CurrentUser() userId: string, @Param('vendorId') vendorId: string) {
    return this.favorites.addVendor(userId, vendorId);
  }

  @Delete('vendors/:vendorId')
  removeVendor(@CurrentUser() userId: string, @Param('vendorId') vendorId: string) {
    return this.favorites.removeVendor(userId, vendorId);
  }
}
