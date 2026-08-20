import { z } from 'zod';

/**
 * The courier's file, in three steps.
 *
 * Split into three schemas rather than one so the form can validate each step
 * as it is left, instead of dropping every error at once on the last screen.
 * `courierSchema` is the union the submit path validates against.
 *
 * The document list is indicative and still to be confirmed with the client —
 * the CDC flags the same caveat for merchants. What is modelled here is the
 * shape (identity, vehicle, papers, where the money goes), not the final legal
 * requirements.
 */

export const courierIdentitySchema = z.object({
  fullName: z.string().trim().min(2, 'Nom complet requis'),
  phone: z
    .string()
    .trim()
    .min(10, 'Numéro de téléphone requis')
    // Deliberately loose: Québec numbers get written +1 514…, (514) …, 514-… and
    // all three are the same number. Rejecting a real number over its spacing is
    // a worse failure than accepting a badly formatted one.
    .regex(/^[\d\s()+.-]+$/, 'Numéro de téléphone invalide'),
  city: z.string().trim().min(2, 'Ville requise'),
  postalCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]\d[A-Za-z][ ]?\d[A-Za-z]\d$/, 'Code postal invalide (ex. H2S 3K9)'),
});
export type CourierIdentityValues = z.infer<typeof courierIdentitySchema>;

export const courierVehicleSchema = z
  .object({
    vehicle: z.enum(['bike', 'scooter', 'car'], { message: 'Choisissez un véhicule' }),
    plate: z.string().trim().optional(),
    licenceNumber: z.string().trim().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.vehicle === 'bike') return;
    // A motorised courier without a plate or a licence is a file an
    // administrator would send straight back, so the form asks here rather than
    // letting it sit in the queue for a day first.
    if (!values.plate || values.plate.length < 4) {
      ctx.addIssue({ code: 'custom', path: ['plate'], message: 'Plaque requise' });
    }
    if (!values.licenceNumber || values.licenceNumber.length < 5) {
      ctx.addIssue({ code: 'custom', path: ['licenceNumber'], message: 'Numéro de permis requis' });
    }
  });
export type CourierVehicleValues = z.infer<typeof courierVehicleSchema>;

export const courierPayoutSchema = z.object({
  /** Institution + transit + account, as a Canadian direct deposit slip prints them. */
  institution: z.string().trim().min(3, 'Institution requise'),
  transit: z.string().trim().regex(/^\d{5}$/, 'Transit à 5 chiffres'),
  account: z.string().trim().regex(/^\d{7,12}$/, 'Numéro de compte invalide'),
});
export type CourierPayoutValues = z.infer<typeof courierPayoutSchema>;

export const courierSchema = z.object({
  identity: courierIdentitySchema,
  vehicle: courierVehicleSchema,
  payout: courierPayoutSchema,
});
export type CourierValues = z.infer<typeof courierSchema>;

export const VEHICLE_LABELS: Record<CourierVehicleValues['vehicle'], string> = {
  bike: 'Vélo',
  scooter: 'Scooter',
  car: 'Voiture',
};
