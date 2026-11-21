import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { Db } from '../db/client.js';
import { SpecialtiesAdminService } from './specialties-admin.service.js';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const ID = '33333333-3333-4333-8333-333333333333';

const ROW = {
  id: ID,
  vendor_type: 'restaurant',
  slug: 'cuisine-ivoirienne',
  name_fr: 'Cuisine ivoirienne',
  name_en: 'Ivorian cuisine',
  position: 20,
  is_active: true,
};

/** The reads (list, last position, current row) and the one RPC, captured. */
function fakeDb({ current = ROW as typeof ROW | null, rpcError = null as { code: string; message: string } | null } = {}) {
  const query: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit']) query[m] = () => query;
  query.maybeSingle = () => Promise.resolve({ data: current ? { ...current, position: 120 } : null, error: null });
  // A query builder is awaited directly, as PostgREST's is — the fake has to be thenable.
  // oxlint-disable-next-line unicorn/no-thenable
  query.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: [{ ...ROW, vendors: [{ count: 3 }] }], error: null });
  const rpc = vi.fn(() => Promise.resolve({ data: rpcError ? null : ROW, error: rpcError }));
  return { db: { from: () => query, rpc } as unknown as Db, rpc };
}

describe('back-office specialties', () => {
  it('lists every entry with how many shops use it', async () => {
    const [first] = await new SpecialtiesAdminService(fakeDb().db).list();
    expect(first).toMatchObject({ nameFr: 'Cuisine ivoirienne', isActive: true, vendorCount: 3 });
  });

  it('creates at the end of its list, with a slug from the French name', async () => {
    const { db, rpc } = fakeDb();
    await new SpecialtiesAdminService(db).create(ADMIN, {
      vendorType: 'restaurant',
      nameFr: 'Cuisine béninoise',
      nameEn: 'Beninese cuisine',
    });
    expect(rpc).toHaveBeenCalledWith('admin_specialty_save', {
      p_admin_id: ADMIN,
      p_id: null,
      p_vendor_type: 'restaurant',
      p_slug: 'cuisine-beninoise',
      p_name_fr: 'Cuisine béninoise',
      p_name_en: 'Beninese cuisine',
      p_position: 130,
      p_is_active: true,
    });
  });

  it('keeps what the patch does not mention, and never moves the type', async () => {
    const { db, rpc } = fakeDb();
    await new SpecialtiesAdminService(db).update(ADMIN, ID, { isActive: false });
    expect(rpc).toHaveBeenCalledWith(
      'admin_specialty_save',
      expect.objectContaining({
        p_id: ID,
        p_vendor_type: 'restaurant',
        p_name_fr: 'Cuisine ivoirienne',
        p_is_active: false,
      })
    );
  });

  it('answers 404 for an unknown id and 409 for a name already taken', async () => {
    await expect(
      new SpecialtiesAdminService(fakeDb({ current: null }).db).update(ADMIN, ID, { nameFr: 'Autre' })
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      new SpecialtiesAdminService(fakeDb({ rpcError: { code: '23505', message: 'dup' } }).db).create(ADMIN, {
        vendorType: 'grocery',
        nameFr: 'Boucherie halal',
        nameEn: 'Halal butcher',
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
