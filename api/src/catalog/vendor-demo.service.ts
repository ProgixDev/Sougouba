import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.js';
import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap } from '../db/unwrap.js';

/** `scripts/seed/ids.ts`: every seeded row's id starts with this, and no real uuid does in practice. */
const SEED_ID_RANGE_START = '5eed0000-0000-0000-0000-000000000000';
const SEED_ID_RANGE_END = '5eee0000-0000-0000-0000-000000000000';
/** `scripts/seed/ids.ts`: the seeded accounts' addresses. `example.com` can never receive mail. */
const isSeedEmail = (email: string | undefined) =>
  typeof email === 'string' && email.startsWith('seed.') && email.endsWith('@example.com');

/** Same reading as `config/runtime.ts`: '0', 'false' and empty all mean off. */
function truthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== '' && normalized !== '0' && normalized !== 'false';
}

/**
 * Test phase only: the two shortcuts on the merchant's "pending" screen.
 *
 * Both sit behind `ALLOW_DEMO_SELF_APPROVAL`, the flag that already lets a
 * courier clear their own file, and both answer 404 when it is off — the
 * routes should look absent, not forbidden.
 *
 * - **Approve** moves the merchant's own `pending` shop to `approved`, as an
 *   administrator would. A suspended shop stays where an administrator put it.
 * - **Adopt** hands the merchant one of the seeded shops — catalogue, hours and
 *   order history included — so the dashboard and analytics have something to
 *   draw. Only a shop that is seeded *and* still owned by its seeded account
 *   can move, so a shop another tester adopted is never taken from them.
 */
@Injectable()
export class VendorDemoService {
  private readonly logger = new Logger(VendorDemoService.name);
  private readonly enabled: boolean;

  constructor(
    @Inject(DB) private readonly db: Db,
    config: ConfigService<Env, true>
  ) {
    this.enabled = truthy(config.get('ALLOW_DEMO_SELF_APPROVAL', { infer: true }));
  }

  async approve(userId: string) {
    if (!this.enabled) throw new NotFoundException();
    const shop = await unwrap<{ id: string; status: string } | null>(
      this.db.from('vendors').select('id, status').eq('owner_id', userId).maybeSingle()
    );
    if (!shop) throw new NotFoundException('This account has no shop');
    if (shop.status !== 'pending') return { id: shop.id, status: shop.status };

    await unwrap(
      this.db
        .from('vendors')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', shop.id)
        .eq('status', 'pending')
    );
    this.logger.warn(`Shop ${shop.id} approved by its own owner (ALLOW_DEMO_SELF_APPROVAL)`);
    return { id: shop.id, status: 'approved' };
  }

  async adopt(userId: string) {
    if (!this.enabled) throw new NotFoundException();

    const owned = await unwrap<{ id: string } | null>(
      this.db.from('vendors').select('id').eq('owner_id', userId).maybeSingle()
    );
    if (owned) throw new ConflictException('Ce compte a déjà une boutique');

    const seeded = await unwrap<{ id: string; ownerId: string; name: string }[]>(
      this.db
        .from('vendors')
        .select('id, ownerId:owner_id, name')
        // A range, not `like`: the column is a uuid, and PostgREST cannot cast
        // it to text in a filter. Every id starting `5eed` sorts inside it.
        .gte('id', SEED_ID_RANGE_START)
        .lt('id', SEED_ID_RANGE_END)
        .eq('status', 'approved')
    );

    // Random order, so two testers pressing the button at once are unlikely to
    // reach for the same shop — and the update below settles it if they do.
    for (const shop of seeded.sort(() => Math.random() - 0.5)) {
      const { data } = await this.db.auth.admin.getUserById(shop.ownerId);
      if (!isSeedEmail(data?.user?.email)) continue;

      const moved = await unwrap<{ id: string }[]>(
        this.db
          .from('vendors')
          .update({ owner_id: userId, updated_at: new Date().toISOString() })
          .eq('id', shop.id)
          .eq('owner_id', shop.ownerId)
          .select('id')
      );
      if (moved.length === 0) continue;

      // The profile link `vendor_apply` writes for a registered shop.
      await Promise.all([
        unwrap(this.db.from('profiles').update({ vendor_id: shop.id }).eq('id', userId)),
        unwrap(this.db.from('profiles').update({ vendor_id: null }).eq('id', shop.ownerId)),
      ]);
      this.logger.warn(`Seeded shop ${shop.id} adopted by ${userId} (ALLOW_DEMO_SELF_APPROVAL)`);
      return { id: shop.id, name: shop.name };
    }

    throw new ConflictException('Aucune boutique de démonstration disponible pour le moment');
  }
}
