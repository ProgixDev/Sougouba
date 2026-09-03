import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { addresses } from '../db/schema/index.js';
import { GeoService } from '../geo/geo.service.js';
import type { CreateAddressInput, UpdateAddressInput } from './dto/address.dto.js';

@Injectable()
export class AddressesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly geo: GeoService
  ) {}

  list(profileId: string) {
    return this.db.select().from(addresses).where(eq(addresses.profileId, profileId)).orderBy(asc(addresses.createdAt));
  }

  /** Also the ownership check every mutation below reuses — a 404, not a 403, so an id you don't own doesn't confirm it exists. */
  private async findOwned(profileId: string, id: string) {
    const [address] = await this.db
      .select()
      .from(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.profileId, profileId)))
      .limit(1);
    if (!address) throw new NotFoundException('Address not found');
    return address;
  }

  async create(profileId: string, input: CreateAddressInput) {
    const { lat, lng } = await this.geo.coordinatesFor(input.postalCode, input.city);
    const existing = await this.list(profileId);
    // The first address on an empty book has to be the default, or checkout
    // has nothing to fall back to — matches `account/addresses.tsx` exactly.
    const isDefault = existing.length === 0;
    const [created] = await this.db
      .insert(addresses)
      .values({ profileId, ...input, lat, lng, isDefault })
      .returning();
    return created;
  }

  async update(profileId: string, id: string, patch: UpdateAddressInput) {
    const current = await this.findOwned(profileId, id);

    const nextCity = patch.city ?? current.city;
    const nextPostalCode = patch.postalCode ?? current.postalCode;
    const coordsChanged = patch.city !== undefined || patch.postalCode !== undefined;
    const coords = coordsChanged ? await this.geo.coordinatesFor(nextPostalCode, nextCity) : null;

    return this.db.transaction(async (tx) => {
      // Claiming default: the partial unique index (`addresses_one_default_per_profile`)
      // allows only one `is_default = true` row per profile, so the previous
      // default has to be cleared first, in the same transaction.
      if (patch.isDefault === true) {
        await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.profileId, profileId));
      }

      const [updated] = await tx
        .update(addresses)
        .set({
          ...(patch.label !== undefined ? { label: patch.label } : {}),
          ...(patch.street !== undefined ? { street: patch.street } : {}),
          ...(patch.city !== undefined ? { city: patch.city } : {}),
          ...(patch.postalCode !== undefined ? { postalCode: patch.postalCode } : {}),
          ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
          ...(patch.isDefault !== undefined ? { isDefault: patch.isDefault } : {}),
        })
        .where(and(eq(addresses.id, id), eq(addresses.profileId, profileId)))
        .returning();
      return updated;
    });
  }

  async remove(profileId: string, id: string): Promise<void> {
    const target = await this.findOwned(profileId, id);

    await this.db.transaction(async (tx) => {
      await tx.delete(addresses).where(and(eq(addresses.id, id), eq(addresses.profileId, profileId)));

      if (!target.isDefault) return;
      // The default just left the book — promote the oldest remaining
      // address, or checkout is left with no default at all. Mirrors
      // `account/addresses.tsx`'s `persist()`.
      const [next] = await tx
        .select({ id: addresses.id })
        .from(addresses)
        .where(eq(addresses.profileId, profileId))
        .orderBy(asc(addresses.createdAt))
        .limit(1);
      if (next) {
        await tx.update(addresses).set({ isDefault: true }).where(eq(addresses.id, next.id));
      }
    });
  }
}
