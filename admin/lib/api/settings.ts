import type { PlatformSettings } from '../types';
import { loadValue, saveValue, delay } from './storage';
import { COMMISSION_RATE, MONTHLY_SUBSCRIPTION_CAD } from '../../../lib/monetization';
import {
  POINTS_PER_CAD,
  POINTS_PER_CAD_REDEEMED,
  MAX_REDEMPTION_SHARE,
  POINTS_EXPIRY_MONTHS,
  REFERRAL_REWARD_POINTS,
  REFERRAL_MIN_FIRST_ORDER_CAD,
  DOUBLE_POINTS_ACTIVE,
} from '../../../data/loyalty';

const KEY = 'sougouba-admin-settings';

/**
 * Seeded from the real constants the mobile app still hardcodes
 * (`lib/monetization.ts`, `data/loyalty.ts`) — this is the editable record
 * docs/BACKEND-BUILD-PHASES.md's Phase 8 `platform_settings` table plans to
 * replace them with. Edits here are mock-only; wiring them back into the
 * mobile app is a backend concern.
 */
const DEFAULTS: PlatformSettings = {
  commissionRate: COMMISSION_RATE,
  monthlySubscriptionCad: MONTHLY_SUBSCRIPTION_CAD,
  pointsPerCad: POINTS_PER_CAD,
  pointsPerCadRedeemed: POINTS_PER_CAD_REDEEMED,
  maxRedemptionShare: MAX_REDEMPTION_SHARE,
  pointsExpiryMonths: POINTS_EXPIRY_MONTHS,
  referralRewardPoints: REFERRAL_REWARD_POINTS,
  referralMinFirstOrderCad: REFERRAL_MIN_FIRST_ORDER_CAD,
  doublePointsActive: DOUBLE_POINTS_ACTIVE,
};

export async function getSettings(): Promise<PlatformSettings> {
  await delay(150, 300);
  return loadValue(KEY, DEFAULTS);
}

export async function updateSettings(patch: Partial<PlatformSettings>): Promise<PlatformSettings> {
  await delay(300, 550);
  const current = loadValue(KEY, DEFAULTS);
  const next = { ...current, ...patch };
  saveValue(KEY, next);
  return next;
}
