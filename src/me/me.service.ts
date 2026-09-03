import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, ne } from 'drizzle-orm';

import { referralCodeFor } from '../common/loyalty/referral.js';
import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { profiles } from '../db/schema/index.js';
import type { UpdateMeInput } from './dto/update-me.dto.js';

@Injectable()
export class MeService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async getMe(userId: string) {
    const [profile] = await this.db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
    // Should never actually happen — the trigger creates this row in the same
    // transaction Supabase Auth creates the account in — but a caller with a
    // valid token and no matching profile is a real, if impossible-in-theory,
    // state worth a clear error over a null-shaped 200.
    if (!profile) throw new NotFoundException('No profile for this account');
    return profile;
  }

  async updateMe(userId: string, patch: UpdateMeInput) {
    await this.getMe(userId); // 404s before the update if the row is somehow missing
    const [updated] = await this.db
      .update(profiles)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(profiles.id, userId))
      .returning();
    return updated;
  }

  /** One-way, exactly like the mock: a role, once set, is never rewritten through this endpoint. */
  async setRole(userId: string, role: 'customer' | 'business' | 'courier') {
    const profile = await this.getMe(userId);
    if (profile.role !== null) {
      throw new ConflictException(`Role is already set to "${profile.role}" and cannot be changed here.`);
    }
    const [updated] = await this.db
      .update(profiles)
      .set({ role, updatedAt: new Date() })
      .where(eq(profiles.id, userId))
      .returning();
    return updated;
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
    const candidates = await this.db.select({ id: profiles.id }).from(profiles).where(ne(profiles.id, userId));
    const referrer = candidates.find((c) => referralCodeFor(c.id) === normalized);
    if (!referrer) return { applied: false };

    await this.db
      .update(profiles)
      .set({ referredBy: referrer.id, updatedAt: new Date() })
      .where(eq(profiles.id, userId));
    return { applied: true };
  }
}
