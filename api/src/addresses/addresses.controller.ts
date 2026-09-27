import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { AddressesService } from './addresses.service.js';
import { createAddressSchema, type CreateAddressInput, updateAddressSchema, type UpdateAddressInput } from './dto/address.dto.js';

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('me/addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  list(@CurrentUser() userId: string) {
    return this.addresses.list(userId);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createAddressSchema))
  create(@CurrentUser() userId: string, @Body() body: CreateAddressInput) {
    return this.addresses.create(userId, body);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(updateAddressSchema))
  update(@CurrentUser() userId: string, @Param('id') id: string, @Body() body: UpdateAddressInput) {
    return this.addresses.update(userId, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.addresses.remove(userId, id);
  }
}
