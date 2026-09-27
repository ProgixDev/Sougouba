import { Body, Controller, HttpCode, HttpStatus, Post, UsePipes } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { coordinatesRequestSchema } from './dto/coordinates.dto.js';
import { GeoService, type LatLng } from './geo.service.js';

/**
 * No `SupabaseAuthGuard` here — geocoding a postal code isn't account data,
 * and both merchant/courier sign-up and the customer address book need it
 * before (courier/merchant) or regardless of (customer) being signed in.
 */
@ApiTags('geo')
@Controller('geo')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  /**
   * POST because the postal code and city are a body, not because anything is
   * created — hence the explicit 200. Nest answers a POST with 201 by default,
   * and a lookup that reports "Created" is a small lie the mobile client would
   * have to learn to ignore.
   */
  @Post('coordinates')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(coordinatesRequestSchema))
  coordinates(@Body() body: { postalCode: string; city: string }): Promise<LatLng> {
    return this.geo.coordinatesFor(body.postalCode, body.city);
  }
}
