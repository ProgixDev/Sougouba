import { Body, Controller, Post, UsePipes } from '@nestjs/common';
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

  @Post('coordinates')
  @UsePipes(new ZodValidationPipe(coordinatesRequestSchema))
  coordinates(@Body() body: { postalCode: string; city: string }): Promise<LatLng> {
    return this.geo.coordinatesFor(body.postalCode, body.city);
  }
}
