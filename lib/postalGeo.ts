import { defaultDeliveryAddress } from '@/data/seed/addresses';
import { orderAddresses } from '@/data/seed/orders';
import { vendors } from '@/data/seed/vendors';
import type { LatLng } from './geo';

/**
 * Approximate coordinates for an address the shopper typed.
 *
 * The prototype runs offline, so there is no geocoder — but an address without
 * coordinates is no longer harmless: the shop list sorts by distance, and the
 * `lat: 0, lng: 0` this used to write put the shopper in the Gulf of Guinea,
 * about 6 000 km from every shop.
 *
 * Rather than invent a coordinate table, this derives one from data the app
 * already holds: every seeded address carries both a real postal code and real
 * coordinates. Grouping them by forward sortation area (the first three
 * characters — "H1X", "J4G") gives a lookup that is accurate to a
 * neighbourhood, which is the precision a "2,4 km" label actually claims.
 * Anything outside the seeded FSAs falls back to the centre of its city, and
 * anything outside those cities to the centre of the region.
 */

interface Sample {
  postalCode: string;
  city: string;
  lat: number;
  lng: number;
}

const samples: Sample[] = [
  ...vendors.map((v) => v.address),
  ...orderAddresses,
  defaultDeliveryAddress,
];

function fsaOf(postalCode: string): string {
  return postalCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
}

function centroid(points: Sample[]): LatLng {
  return {
    lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
    lng: points.reduce((sum, p) => sum + p.lng, 0) / points.length,
  };
}

function groupBy(key: (s: Sample) => string): Map<string, LatLng> {
  const buckets = new Map<string, Sample[]>();
  for (const sample of samples) {
    const k = key(sample);
    const bucket = buckets.get(k);
    if (bucket) bucket.push(sample);
    else buckets.set(k, [sample]);
  }
  return new Map([...buckets].map(([k, points]) => [k, centroid(points)]));
}

const byFsa = groupBy((s) => fsaOf(s.postalCode));
const byCity = groupBy((s) => s.city.trim().toLowerCase());
const regionCentre = centroid(samples);

export function coordinatesFor(postalCode: string, city: string): LatLng {
  return (
    byFsa.get(fsaOf(postalCode)) ?? byCity.get(city.trim().toLowerCase()) ?? regionCentre
  );
}
