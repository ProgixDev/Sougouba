import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import type { Db, Tables } from '../db/client.js';
import { camelize } from '../db/case.js';
import { DB } from '../db/db.module.js';
import { unwrap, unwrapRpc } from '../db/unwrap.js';
import { GeoService } from '../geo/geo.service.js';
import type { CreateAddressInput, DeliveryDetailsInput, UpdateAddressInput } from './dto/address.dto.js';

/** The camelCase shape this service has always returned, now derived from the generated row type. */
type Address = {
  id: string;
  profileId: string;
  label: string;
  street: string;
  city: string;
  postalCode: string;
  lat: number;
  lng: number;
  isDefault: boolean;
  createdAt: string;
  unit: string | null;
  doorCode: string | null;
  deliveryNotes: string | null;
  dropoff: 'hand' | 'door';
};

/** The delivery details in a create or patch body, as columns — only the keys the client sent. */
function detailColumns(input: DeliveryDetailsInput) {
  const columns: Partial<Pick<Tables<'addresses'>, 'unit' | 'door_code' | 'delivery_notes' | 'dropoff'>> = {};
  if (input.unit !== undefined) columns.unit = input.unit;
  if (input.doorCode !== undefined) columns.door_code = input.doorCode;
  if (input.deliveryNotes !== undefined) columns.delivery_notes = input.deliveryNotes;
  if (input.dropoff !== undefined) columns.dropoff = input.dropoff;
  return columns;
}

@Injectable()
export class AddressesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly geo: GeoService
  ) {}

  async list(profileId: string): Promise<Address[]> {
    const rows = await unwrap<Tables<'addresses'>[]>(
      this.db.from('addresses').select('*').eq('profile_id', profileId).order('created_at', { ascending: true })
    );
    return camelize<Address[]>(rows);
  }

  /** Also the ownership check every mutation below reuses — a 404, not a 403, so an id you don't own doesn't confirm it exists. */
  private async findOwned(profileId: string, id: string): Promise<Address> {
    const row = await unwrap<Tables<'addresses'> | null>(
      this.db.from('addresses').select('*').eq('id', id).eq('profile_id', profileId).maybeSingle()
    );
    if (!row) throw new NotFoundException('Address not found');
    return camelize<Address>(row);
  }

  async create(profileId: string, input: CreateAddressInput): Promise<Address> {
    const { lat, lng } = await this.geo.coordinatesFor(input.postalCode, input.city);
    const existing = await this.list(profileId);
    // The first address on an empty book has to be the default, or checkout
    // has nothing to fall back to — matches `account/addresses.tsx` exactly.
    const isDefault = existing.length === 0;
    const created = await unwrap<Tables<'addresses'>>(
      this.db
        .from('addresses')
        .insert({
          profile_id: profileId,
          label: input.label,
          street: input.street,
          city: input.city,
          postal_code: input.postalCode,
          lat,
          lng,
          is_default: isDefault,
          ...detailColumns(input),
        })
        .select('*')
        .single()
    );
    return camelize<Address>(created);
  }

  async update(profileId: string, id: string, patch: UpdateAddressInput): Promise<Address> {
    const current = await this.findOwned(profileId, id);

    // The delivery details are a plain update: `address_update` reads NULL as
    // "not provided", which would make a door code impossible to erase.
    const details = detailColumns(patch);
    const coreChanged = (['label', 'street', 'city', 'postalCode', 'isDefault'] as const).some((k) => patch[k] !== undefined);
    if (Object.keys(details).length > 0) {
      await unwrap(this.db.from('addresses').update(details).eq('id', id).eq('profile_id', profileId));
    }
    if (!coreChanged) return this.findOwned(profileId, id);

    const nextCity = patch.city ?? current.city;
    const nextPostalCode = patch.postalCode ?? current.postalCode;
    const coordsChanged = patch.city !== undefined || patch.postalCode !== undefined;
    const coords = coordsChanged ? await this.geo.coordinatesFor(nextPostalCode, nextCity) : null;

    // Claiming default clears the incumbent, and the partial unique index
    // `addresses_one_default_per_profile` means the two writes cannot be
    // separated. PostgREST is one statement per request, so the pair lives in
    // `address_update` (migration `rpc_addresses`).
    const updated = await unwrapRpc<Tables<'addresses'> | null>(
      this.db.rpc('address_update', {
        p_profile_id: profileId,
        p_address_id: id,
        // Omitted rather than null: each argument defaults to NULL in SQL, and
        // the function reads NULL as "not provided" via coalesce.
        p_label: patch.label,
        p_street: patch.street,
        p_city: patch.city,
        p_postal_code: patch.postalCode,
        p_lat: coords?.lat,
        p_lng: coords?.lng,
        p_is_default: patch.isDefault,
      })
    );
    if (!updated) throw new NotFoundException('Address not found');
    return camelize<Address>(updated);
  }

  async remove(profileId: string, id: string): Promise<void> {
    // Deleting the default promotes the oldest survivor, or checkout is left
    // with no default at all — both writes in `address_delete`.
    const deleted = await unwrapRpc<boolean>(
      this.db.rpc('address_delete', { p_profile_id: profileId, p_address_id: id })
    );
    if (!deleted) throw new NotFoundException('Address not found');
  }
}
