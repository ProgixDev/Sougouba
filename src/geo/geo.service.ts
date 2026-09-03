import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.js';

export interface LatLng {
  lat: number;
  lng: number;
}

interface MapboxForwardResponse {
  features: { geometry: { coordinates: [number, number] } }[];
}

/**
 * Real geocoding, replacing `lib/postalGeo.ts`'s offline FSA-centroid
 * approximation in the mobile app. Same Mapbox account the app already uses
 * for map *rendering* — geocoding is a different, previously-unused
 * capability of the same account, and needs the account's **secret** token
 * (`sk.…`), not the public one (`pk.…`) the client bundle carries. See
 * `lib/mapbox.ts` in the mobile repo for that public/secret split.
 */
@Injectable()
export class GeoService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  async coordinatesFor(postalCode: string, city: string): Promise<LatLng> {
    const token = this.config.get('MAPBOX_SECRET_TOKEN', { infer: true });
    if (!token) {
      throw new ServiceUnavailableException(
        'Geocoding is not configured — MAPBOX_SECRET_TOKEN is unset (see docs/BACKEND-BUILD-PHASES.md, Phase 1).'
      );
    }

    const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
    url.searchParams.set('postcode', postalCode);
    url.searchParams.set('place', city);
    url.searchParams.set('country', 'ca');
    url.searchParams.set('limit', '1');
    url.searchParams.set('access_token', token);

    const response = await fetch(url);
    if (!response.ok) {
      throw new BadGatewayException(`Geocoding provider returned ${response.status}`);
    }

    const data = (await response.json()) as MapboxForwardResponse;
    const coordinates = data.features[0]?.geometry.coordinates;
    if (!coordinates) {
      throw new BadGatewayException('Geocoding provider returned no match for that postal code and city');
    }

    // GeoJSON order is [lng, lat] — the one place in this codebase that
    // ordering is easy to get backwards, so it's confined to this line.
    const [lng, lat] = coordinates;
    return { lat, lng };
  }
}
