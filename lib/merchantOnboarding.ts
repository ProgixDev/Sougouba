/**
 * What a merchant is asked for before their shop goes live.
 *
 * Registration used to leave the app: the CDC addendum (v1.1, §02) routed a
 * merchant to the administration site to upload documents there. That site is a
 * later sprint, so in practice the button explained a redirect it could not
 * perform — and the client has since asked for the whole thing to stay in the
 * app. So it does. **This is a deliberate divergence from §02** and worth
 * restating when the back-office ships: what changed is *where* the form lives,
 * not that a human approves it. Step three is unchanged and non-negotiable.
 *
 * The document list is indicative and still to be confirmed with the client, as
 * the CDC itself flags.
 *
 * The steps are keys, in order; the wording is `onboarding.merchant.*`.
 */
export const MERCHANT_SIGNUP_STEPS = ['business', 'address', 'documents'] as const;

export type MerchantSignupStep = (typeof MERCHANT_SIGNUP_STEPS)[number];
