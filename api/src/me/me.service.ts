import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { assertMediaPath, createMediaUpload, type MediaImageUploadInput } from '../catalog/media-paths.js';
import { referralCodeFor } from '../common/loyalty/referral.js';
import type { Db, Tables } from '../db/client.js';
import { camelize, snakeize } from '../db/case.js';
import { DB } from '../db/db.module.js';
import { unwrap } from '../db/unwrap.js';
import type { UpdateMeInput } from './dto/update-me.dto.js';

/** Public bucket, one folder per account (`0006_avatars_bucket_and_policies.sql`). */
export const AVATARS_BUCKET = 'avatars';

/** The camelCase shape this service has always returned. */
type Profile = Record<string, any>;

@Injectable()
export class MeService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async getMe(userId: string) {
    const profile = await unwrap<Tables<'profiles'> | null>(
      this.db.from('profiles').select('*').eq('id', userId).maybeSingle()
    );
    // Should never actually happen — the trigger creates this row in the same
    // transaction Supabase Auth creates the account in — but a caller with a
    // valid token and no matching profile is a real, if impossible-in-theory,
    // state worth a clear error over a null-shaped 200.
    if (!profile) throw new NotFoundException('No profile for this account');
    return camelize<Profile>(profile);
  }

  async updateMe(userId: string, patch: UpdateMeInput) {
    await this.getMe(userId); // 404s before the update if the row is somehow missing
    // Only a photo in the caller's own folder — otherwise anyone could show
    // someone else's picture, or any object in the bucket, as theirs.
    const columns: Record<string, unknown> = { ...patch };
    if (patch.avatarUrl !== undefined) {
      columns.avatarUrl = assertMediaPath(patch.avatarUrl, AVATARS_BUCKET, userId, 'avatarUrl') || null;
    }
    const updated = await unwrap<Tables<'profiles'>>(
      this.db
        .from('profiles')
        .update({ ...snakeize(columns), updated_at: new Date().toISOString() } as never)
        .eq('id', userId)
        .select('*')
        .single()
    );
    return camelize<Profile>(updated);
  }

  /** Somewhere to upload a new profile photo — see `createMediaUpload`. Send the returned path as `avatarUrl`. */
  async createAvatarUpload(userId: string, input: MediaImageUploadInput) {
    return createMediaUpload(this.db, AVATARS_BUCKET, userId, input);
  }

  /** One-way, exactly like the mock: a role, once set, is never rewritten through this endpoint. */
  async setRole(userId: string, role: 'customer' | 'business' | 'courier') {
    const profile = await this.getMe(userId);
    if (profile.role !== null) {
      throw new ConflictException(`Role is already set to "${profile.role}" and cannot be changed here.`);
    }
    const updated = await unwrap<Tables<'profiles'>>(
      this.db
        .from('profiles')
        .update({ role, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .select('*')
        .single()
    );
    return camelize<Profile>(updated);
  }

  /**
   * Best-effort, like the mock: an unknown or malformed code is a silent
   * no-op, not a 400 — a referral is a bonus for both sides, not a gate on
   * using the account. Idempotent: a second call (or a code that resolves to
   * nobody, or to the caller's own account) changes nothing.
   *
   * O(n) over every profile — matches the mock's own `findByReferralCode`
   * exactly, since the code is derived, not stored. Fine at Phase 1 scale;
   * worth a stored, indexed column only if this ever shows up in a slow-query
   * report (see `supabase-postgres-best-practices`: don't index speculatively).
   */
  async claimReferral(userId: string, code: string): Promise<{ applied: boolean }> {
    const profile = await this.getMe(userId);
    if (profile.referredBy !== null) return { applied: false };

    const normalized = code.trim().toUpperCase();
    const candidates = await unwrap<{ id: string }[]>(
      this.db.from('profiles').select('id').neq('id', userId)
    );
    const referrer = candidates.find((c) => referralCodeFor(c.id) === normalized);
    if (!referrer) return { applied: false };

    await unwrap(
      this.db
        .from('profiles')
        .update({ referred_by: referrer.id, updated_at: new Date().toISOString() })
        .eq('id', userId)
    );
    return { applied: true };
  }
}
