/**
 * Phase 3's review gate, and half of Phase 7's — as a command anyone can re-run.
 *
 *   npm run build && node --env-file=.env scripts/verify-stripe.mjs
 *
 * Until this existed, `docs/BACKEND-BUILD-PHASES.md` said of Phase 3: "no
 * PaymentIntent has ever been created". The code was typed, booted and
 * structurally exercised; the round-trip was not. This walks it.
 *
 * It drives the **real `PaymentsService`** out of `dist/`, not a reimplementation
 * of it — the point is to exercise the shipping code, including the four checks
 * in `assertPaidBy`, which are the ones standing between a client and a free
 * basket of groceries. `PaymentsService` takes only a `ConfigService`, so a
 * two-line stand-in is enough and no database is needed.
 *
 * Test mode only: it refuses to run against an `sk_live_` key.
 */
import { PaymentsService } from '../dist/orders/payments.service.js';

const key = process.env.STRIPE_SECRET_KEY ?? '';
if (!key) {
  console.error('STRIPE_SECRET_KEY is unset. Run with --env-file=.env');
  process.exit(1);
}
if (!key.startsWith('sk_test_')) {
  console.error('Refusing to run: this is not a test-mode key. This script creates charges and refunds.');
  process.exit(1);
}

/** `PaymentsService` only ever calls `config.get(name, { infer: true })`. */
const config = { get: (name) => process.env[name] };
const payments = new PaymentsService(config);

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Asserts the call throws, and that it throws for the stated reason. */
async function refuses(name, fn, expect) {
  try {
    await fn();
    record(name, false, 'it was ACCEPTED');
  } catch (error) {
    const message = error?.response?.message ?? error?.message ?? String(error);
    record(name, expect ? message.includes(expect) : true, message.slice(0, 90));
  }
}

const CUSTOMER = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_CUSTOMER = 'bbbbbbbb-0000-4000-8000-000000000002';
const VENDOR = '11111111-0000-4000-8000-000000000001';
// 25,99 $ — a plausible Sougouba basket: subtotal + TPS + TVQ + delivery.
const AMOUNT = 2599;

console.log('Stripe verification — test mode\n');

// ── 1. Create the intent the payment sheet would confirm ────────────────────
const created = await payments.createIntent({ amountCents: AMOUNT, customerId: CUSTOMER, vendorId: VENDOR });
record(
  'createIntent returns an id, a client secret and the server-set amount',
  Boolean(created.paymentIntentId?.startsWith('pi_') && created.clientSecret) && created.amountCents === AMOUNT,
  `${created.paymentIntentId} for ${created.amountCents}¢`
);

// ── 2. An unconfirmed intent must not buy anything ──────────────────────────
await refuses(
  'assertPaidBy refuses an intent that has not been paid',
  () => payments.assertPaidBy(created.paymentIntentId, { amountCents: AMOUNT, customerId: CUSTOMER }),
  'has not completed'
);

// ── 3. Pay it, the way the device would ─────────────────────────────────────
// `pm_card_visa` is Stripe's own always-succeeds test card. The confirmation
// happens on the phone in production; here it stands in for the payment sheet.
const { default: Stripe } = await import('stripe');
const raw = new Stripe(key);
await raw.paymentIntents.confirm(created.paymentIntentId, {
  payment_method: 'pm_card_visa',
  return_url: 'https://sougouba.ca/paiement/retour',
});

// ── 4. The four checks in assertPaidBy ──────────────────────────────────────
try {
  await payments.assertPaidBy(created.paymentIntentId, { amountCents: AMOUNT, customerId: CUSTOMER });
  record('assertPaidBy accepts the paid intent, for the right amount and the right customer', true);
} catch (error) {
  record('assertPaidBy accepts the paid intent', false, error?.message ?? String(error));
}

await refuses(
  'assertPaidBy refuses a cheaper intent replayed against a bigger basket',
  () => payments.assertPaidBy(created.paymentIntentId, { amountCents: AMOUNT + 10_000, customerId: CUSTOMER }),
  'amount does not match'
);

await refuses(
  "assertPaidBy refuses another shopper's paid intent",
  () => payments.assertPaidBy(created.paymentIntentId, { amountCents: AMOUNT, customerId: OTHER_CUSTOMER }),
  'could not be verified'
);

await refuses(
  'assertPaidBy refuses an intent id that does not exist',
  () => payments.assertPaidBy('pi_0000000000000000000000000', { amountCents: AMOUNT, customerId: CUSTOMER }),
  'could not be verified'
);

// ── 5. Money back ───────────────────────────────────────────────────────────
const refundId = await payments.refund(created.paymentIntentId, AMOUNT);
record('refund returns a Stripe refund id', refundId.startsWith('re_'), refundId);

await refuses('a second refund on the same payment is refused by Stripe', () =>
  payments.refund(created.paymentIntentId, AMOUNT)
);

// ── 6. Webhook signature, both directions ───────────────────────────────────
//
// The endpoint's real secret comes from the Stripe dashboard when the endpoint
// is registered, and there is no endpoint yet. But the check being verified is
// "does `constructEvent` actually validate", not "is the production secret
// right" — so a secret is supplied here and Stripe's own test helper signs a
// payload with it. Without the accept case this only ever proved that a
// *missing* secret refuses everything, which is not the same thing at all.
// `||`, not `??`: `--env-file` reads a bare `STRIPE_WEBHOOK_SECRET=` line as an
// empty string rather than leaving it undefined, so `??` keeps the empty value
// and every check below reports "not configured" instead of running. Caught by
// these very assertions failing.
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_verification_only_not_a_real_endpoint_secret';
const signingConfig = { get: (name) => (name === 'STRIPE_WEBHOOK_SECRET' ? webhookSecret : process.env[name]) };
const signing = new PaymentsService(signingConfig);

const payload = JSON.stringify({ id: 'evt_verification', type: 'payment_intent.succeeded' });
const goodSignature = raw.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });

try {
  const event = signing.constructEvent(Buffer.from(payload), goodSignature);
  record('constructEvent accepts a correctly signed webhook', event.id === 'evt_verification', event.type);
} catch (error) {
  record('constructEvent accepts a correctly signed webhook', false, error?.message ?? String(error));
}

await refuses(
  'constructEvent rejects a forged signature',
  () => signing.constructEvent(Buffer.from(payload), 't=1,v1=deadbeef'),
  'Invalid webhook signature'
);

await refuses(
  'constructEvent rejects a valid signature over a tampered body',
  // The exact attack the raw-body handling exists for: keep the signature,
  // change one digit of the amount.
  () => signing.constructEvent(Buffer.from(payload.replace('succeeded', 'canceled')), goodSignature),
  'Invalid webhook signature'
);

await refuses('constructEvent rejects a webhook with no signature header', () =>
  signing.constructEvent(Buffer.from(payload), undefined)
);

// ── 7. Connect (Phase 7) ────────────────────────────────────────────────────
//
// Connect is a per-account feature that has to be switched on in the Stripe
// dashboard before any of these calls exist. Reported as blocked rather than
// crashing the run: it is a signup step, not a defect, and Phase 3 above is
// what this script is mainly here to prove.
let accountId = null;
try {
  accountId = await payments.createConnectAccount({ kind: 'vendor', id: VENDOR, name: 'Épicerie de vérification' });
  record('createConnectAccount creates an Express account', accountId.startsWith('acct_'), accountId);
} catch (error) {
  const message = error?.message ?? String(error);
  if (message.includes("signed up for Connect")) {
    console.log('SKIP  Connect (Phase 7) — not enabled on this Stripe account');
    console.log('      Enable it at https://dashboard.stripe.com/connect, then re-run.');
  } else {
    record('createConnectAccount creates an Express account', false, message.slice(0, 90));
  }
}

if (accountId) {
  const link = await payments.createAccountLink(
    accountId,
    'https://sougouba.ca/marchand/stripe/retour',
    'https://sougouba.ca/marchand/stripe/reprendre'
  );
  record(
    'createAccountLink returns a hosted onboarding URL',
    link.startsWith('https://connect.stripe.com/'),
    link.slice(0, 52) + '…'
  );

  const status = await payments.getConnectAccount(accountId);
  record(
    'getConnectAccount reports a fresh account as not yet onboarded',
    status.detailsSubmitted === false && status.payoutsEnabled === false,
    JSON.stringify(status)
  );

  await refuses('transfer to an account that has not onboarded is refused, not silently dropped', () =>
    payments.transfer({
      accountId,
      amountCents: 500,
      idempotencyKey: `verify-${Date.now()}`,
      description: 'verification',
    })
  );
}

// ── summary ─────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  console.log('failed:\n' + failed.map((f) => `  - ${f.name}`).join('\n'));
  process.exit(1);
}
console.log(
  '\nPhase 3 payment path exercised against live test-mode Stripe: an intent created, paid, verified' +
    '\nfour ways and refunded, and webhook signatures accepted and rejected for the right reasons.'
);
console.log(
  accountId
    ? "Phase 7 Connect onboarding exercised too."
    : "Phase 7 Connect NOT exercised — enable Connect on the Stripe account and re-run to cover it."
);
