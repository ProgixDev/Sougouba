import { z } from 'zod';

import { citySchema, postalCodeSchema, refinePostalCodeCity } from '../../geo/address-validation.js';

const vehicleSchema = z.enum(['bike', 'scooter', 'car'], { message: 'Choisissez un véhicule' });

/** A policy that lapsed last month is not cover. Month granularity: "03/2027" means the end of March. */
function isExpired(mmYyyy: string, now = new Date()): boolean {
  const [month, year] = mmYyyy.split('/').map(Number);
  if (year < now.getFullYear()) return true;
  return year === now.getFullYear() && month < now.getMonth() + 1;
}

/**
 * A courier's file. Port of `lib/validation/courier.ts`'s three form steps,
 * flattened into the single request the form submits.
 *
 * **The payout step is deliberately absent.** The mobile form collects a bank
 * transit and account number (`courierPayoutSchema`), and this endpoint refuses
 * to accept them: raw bank details are never this database's to hold. Stripe
 * Connect collects them during onboarding in Phase 7, where they belong — see
 * docs/BACKEND-BUILD-PHASES.md, Phase 7, which flags the mock's plain-text
 * transit/account as unencrypted PII with no real verification. When the mobile
 * app is cut over, that form step is replaced by a Stripe-hosted onboarding
 * link rather than pointed at this endpoint.
 */
export const applyCourierSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Nom complet requis'),
    phone: z
      .string()
      .trim()
      .min(10, 'Numéro de téléphone requis')
      // Deliberately loose: Québec numbers get written +1 514…, (514) …, 514-…
      // and all three are the same number. Rejecting a real number over its
      // spacing is a worse failure than accepting a badly formatted one.
      .regex(/^[\d\s()+.-]+$/, 'Numéro de téléphone invalide'),
    city: citySchema,
    postalCode: postalCodeSchema,

    vehicle: vehicleSchema,
    plate: z.string().trim().optional(),
    licenceNumber: z.string().trim().optional(),
    insurerName: z.string().trim().optional(),
    insurancePolicy: z.string().trim().optional(),
    insuranceExpiry: z.string().trim().optional(),
  })
  .superRefine((values, ctx) => {
    refinePostalCodeCity(values, ctx);

    if (values.vehicle === 'bike') return;
    // A motorised courier without a plate, a licence or live insurance is a
    // file an administrator would send straight back, so it is refused here
    // rather than sitting in the queue for a day first.
    if (!values.plate || values.plate.length < 4) {
      ctx.addIssue({ code: 'custom', path: ['plate'], message: 'Plaque requise' });
    }
    if (!values.licenceNumber || values.licenceNumber.length < 5) {
      ctx.addIssue({ code: 'custom', path: ['licenceNumber'], message: 'Numéro de permis requis' });
    }
    if (!values.insurerName || values.insurerName.length < 2) {
      ctx.addIssue({ code: 'custom', path: ['insurerName'], message: 'Assureur requis' });
    }
    if (!values.insurancePolicy || values.insurancePolicy.length < 4) {
      ctx.addIssue({ code: 'custom', path: ['insurancePolicy'], message: 'Numéro de police requis' });
    }
    if (!values.insuranceExpiry || !/^(0[1-9]|1[0-2])\/\d{4}$/.test(values.insuranceExpiry)) {
      ctx.addIssue({ code: 'custom', path: ['insuranceExpiry'], message: 'Échéance au format MM/AAAA' });
    } else if (isExpired(values.insuranceExpiry)) {
      ctx.addIssue({ code: 'custom', path: ['insuranceExpiry'], message: 'Cette police est échue' });
    }
  });

export type ApplyCourierInput = z.infer<typeof applyCourierSchema>;

/** What a courier may change about their own file. Not `status`, not `rating`, not `deliveryCount`. */
export const updateCourierSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Nom complet requis').optional(),
    phone: z.string().trim().min(10).regex(/^[\d\s()+.-]+$/, 'Numéro de téléphone invalide').optional(),
    photoUrl: z.string().trim().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Aucun champ à modifier');

export type UpdateCourierInput = z.infer<typeof updateCourierSchema>;

/**
 * Going on or off shift, with the courier's current position.
 *
 * Position is required when going online: the dispatcher ranks by distance from
 * where the courier actually is, and a stale registration-time base would send
 * runs to where they slept rather than where they are standing.
 */
export const setShiftSchema = z
  .object({
    isOnline: z.boolean(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .superRefine((values, ctx) => {
    if (!values.isOnline) return;
    if (values.lat === undefined || values.lng === undefined) {
      ctx.addIssue({ code: 'custom', path: ['lat'], message: 'Position requise pour passer en ligne' });
    }
  });

export type SetShiftInput = z.infer<typeof setShiftSchema>;

/** A GPS ping while carrying an order. */
export const locationPingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** Degrees clockwise from north, for the arrow on the tracking map. */
  heading: z.number().min(0).max(360).optional(),
});

export type LocationPingInput = z.infer<typeof locationPingSchema>;

export const completeDeliverySchema = z
  .object({
    method: z.enum(['photo', 'signature', 'pin'], { message: 'Méthode de preuve requise' }),
    /** Required for `pin` — the four digits the shopper reads out. */
    pin: z.string().trim().regex(/^\d{4}$/, 'NIP à 4 chiffres').optional(),
    /**
     * Storage path for `photo` and `signature`. The mock captured both and
     * persisted neither — `ProofCapture`'s own comment says the drawn strokes
     * are "not persisted… there is no backend to upload it to". There is now.
     */
    imagePath: z.string().trim().optional(),
    note: z.string().trim().max(500).optional(),
    tipCad: z.number().min(0).max(1000).optional(),
  })
  .superRefine((values, ctx) => {
    if (values.method === 'pin' && !values.pin) {
      ctx.addIssue({ code: 'custom', path: ['pin'], message: 'NIP requis' });
    }
    // Photo and signature both mean "there is an image"; completing with
    // neither an image nor a PIN would be a delivery with no proof at all,
    // which is exactly the state a dispute turns on.
    if (values.method !== 'pin' && !values.imagePath) {
      ctx.addIssue({ code: 'custom', path: ['imagePath'], message: 'Preuve requise' });
    }
  });

export type CompleteDeliveryInput = z.infer<typeof completeDeliverySchema>;
