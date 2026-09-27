import { describe, expect, it } from 'vitest';

import { hashString, referralCodeFor } from './referral.js';

describe('referralCodeFor', () => {
  it('matches the mobile app\'s own output for a real seeded account id', () => {
    // Observed live in the iOS Simulator this session (`app/(customer)/account/refer.tsx`,
    // Release build against the mock backend) for `usr_customer_demo`. If this
    // ever fails, the two `hashString`/`referralCodeFor` copies have drifted —
    // see the comment in this file's header and in the profile-creation trigger
    // migration for why that would silently break referral resolution.
    expect(referralCodeFor('usr_customer_demo')).toBe('SGB-RU2NWK');
  });

  it('is deterministic', () => {
    expect(referralCodeFor('usr_abc123')).toBe(referralCodeFor('usr_abc123'));
  });

  it('does not collide on ids sharing a name suffix — the exact bug verify-loyalty.ts caught this session', () => {
    expect(referralCodeFor('usr_customer_youssef')).not.toBe(referralCodeFor('usr_courier_youssef'));
  });

  it('always emits the SGB-XXXXXX shape', () => {
    expect(referralCodeFor('any-id-at-all')).toMatch(/^SGB-[A-Z0-9]{6}$/);
  });
});

describe('hashString', () => {
  it('returns an unsigned 32-bit value, never negative', () => {
    for (const input of ['', 'a', 'usr_customer_demo', 'a very long string indeed']) {
      const hash = hashString(input);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
