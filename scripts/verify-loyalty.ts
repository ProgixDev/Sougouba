/**
 * Runtime checks for Points Sougouba (`data/loyalty.ts`).
 *
 * The rules engine is pure — no AsyncStorage, no persisted table — so it runs
 * here the same way `deliveryFeeFor` and `courierEarnings` do in
 * `verify-logic.ts`. What it cannot check is the mock "backend" in
 * `data/api/loyalty.ts`, which needs a real AsyncStorage and is exercised by
 * running the app instead. Run with `npm run verify:loyalty`.
 */
import { orders as seedOrders } from '../data/seed/orders';
import { users as seedUsers } from '../data/seed/users';
import {
  MAX_REDEMPTION_SHARE,
  POINTS_EXPIRY_MONTHS,
  POINTS_PER_CAD_REDEEMED,
  isTransactionLive,
  maxRedeemablePoints,
  pointsEarnedFor,
  pointsExpiryFrom,
  pointsToDiscountCad,
  qualifiesForReferralReward,
  referralCodeFor,
} from '../data/loyalty';

let failures = 0;
function check(name: string, condition: boolean, detail = '') {
  if (!condition) {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ── earning ──────────────────────────────────────────────────────────────────
{
  check('1 $ eligible spend = 1 point', pointsEarnedFor(1) === 1);
  check('fractional cents do not earn a fractional point', pointsEarnedFor(23.99) === 23);
  check('nothing spent earns nothing', pointsEarnedFor(0) === 0);
  check('a negative subtotal never earns negative points', pointsEarnedFor(-5) === 0);
}

// ── redemption ───────────────────────────────────────────────────────────────
{
  check(
    'redemption never exceeds 20 % of the subtotal',
    maxRedeemablePoints(100, 100_000) === Math.floor(100 * MAX_REDEMPTION_SHARE * POINTS_PER_CAD_REDEEMED)
  );
  check(
    'redemption never exceeds the actual balance',
    maxRedeemablePoints(1000, 50) === 50
  );
  check('nothing to redeem on an empty balance', maxRedeemablePoints(100, 0) === 0);
  check('a negative balance redeems nothing', maxRedeemablePoints(100, -20) === 0);
  check(
    '100 points is worth exactly 1 $, round-trip',
    pointsToDiscountCad(POINTS_PER_CAD_REDEEMED) === 1
  );
  check(
    'redeeming the 20 % cap costs no more than 20 % of the subtotal, in dollars',
    pointsToDiscountCad(maxRedeemablePoints(37.5, 100_000)) <= 37.5 * MAX_REDEMPTION_SHARE + 0.01
  );
}

// ── expiry ───────────────────────────────────────────────────────────────────
{
  const posted = '2026-01-15T12:00:00.000Z';
  const expires = pointsExpiryFrom(posted);
  check(
    `an earn posted in month N expires ${POINTS_EXPIRY_MONTHS} months later`,
    new Date(expires).getUTCFullYear() === 2027 && new Date(expires).getUTCMonth() === 0
  );
  check('a transaction with no expiry never goes stale', isTransactionLive({ expiresAt: undefined }));
  check('an unexpired transaction still counts', isTransactionLive({ expiresAt: expires }, new Date(posted).getTime()));
  check(
    'an expired transaction stops counting',
    !isTransactionLive({ expiresAt: posted }, new Date(posted).getTime() + 1)
  );
}

// ── referral eligibility ────────────────────────────────────────────────────
{
  check('a 60 $ order qualifies', qualifiesForReferralReward({ subtotalCad: 60 }));
  check('a 59.99 $ order does not', !qualifiesForReferralReward({ subtotalCad: 59.99 }));
}

// ── referral codes ───────────────────────────────────────────────────────────
{
  const ids = seedUsers.map((u) => u.id);
  const codes = ids.map(referralCodeFor);
  check('a code is deterministic', referralCodeFor(ids[0]) === referralCodeFor(ids[0]));
  check('two different accounts do not collide, across every seeded id', new Set(codes).size === codes.length);
  check('every code follows the SGB-XXXXXX shape', codes.every((c) => /^SGB-[A-Z0-9]{6}$/.test(c)));
}

// ── against the real seed: nobody ends up worse off than they spent ────────
// A sanity check on the shape of the rule, not a replay of `creditForDeliveredOrder`
// itself (that needs the persisted table and a running app) — just that points
// earned across a customer's whole delivered history never outrun what they
// actually paid for, which would mean the rate is wrong in a way no type ever
// catches.
{
  const bySubtotal = new Map<string, number>();
  for (const order of seedOrders) {
    if (order.status !== 'delivered') continue;
    bySubtotal.set(order.customerId, (bySubtotal.get(order.customerId) ?? 0) + order.subtotalCad);
  }
  let allSane = true;
  for (const [customerId, subtotalCad] of bySubtotal) {
    const points = pointsEarnedFor(subtotalCad);
    if (points > subtotalCad) allSane = false;
    if (points < 0) allSane = false;
    void customerId;
  }
  check('points earned across a customer\'s delivered history never exceed what they spent', allSane);
  check('the seed actually exercises this (delivered orders exist)', bySubtotal.size > 0);
}

console.log(failures === 0 ? '\nALL LOYALTY CHECKS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
