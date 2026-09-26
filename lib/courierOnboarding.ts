/**
 * What a livreur is asked for before they can take a course.
 *
 * A courier registers inside the app, as a merchant now does: no catalogue to
 * set up and no storefront to publish, just a person, a vehicle and the papers
 * that go with them. What the two flows share is the ending — a human at
 * Sougouba reads the file and approves it (CDC addendum v1.1, §04, which puts
 * courier supervision in the platform back-office). So the steps are stated up
 * front, the same way `lib/merchantOnboarding.ts` states the merchant's.
 *
 * The exact list of documents is indicative and still to be confirmed with the
 * client, exactly as the CDC flags for merchants.
 *
 * The steps are keys, in order; the wording is `onboarding.courier.*`.
 */
export const COURIER_SIGNUP_STEPS = ['identity', 'documents', 'review'] as const;

export type CourierSignupStep = (typeof COURIER_SIGNUP_STEPS)[number];
