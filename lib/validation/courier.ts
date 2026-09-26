import { z } from 'zod';

import { OTHER_BANK_ID, banks } from '@/data/banks';
import type { MessageKey } from '@/lib/i18n';

import { citySchema, postalCodeSchema, refinePostalCodeCity } from './address';

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

export const courierIdentitySchema = z
  .object({
    fullName: z.string().trim().min(2, 'validation.fullName.required'),
    phone: z
      .string()
      .trim()
      .min(10, 'validation.phone.required')
      // Deliberately loose: Québec numbers get written +1 514…, (514) …, 514-… and
      // all three are the same number. Rejecting a real number over its spacing is
      // a worse failure than accepting a badly formatted one.
      .regex(/^[\d\s()+.-]+$/, 'validation.phone.invalid'),
    city: citySchema,
    postalCode: postalCodeSchema,
  })
  .superRefine(refinePostalCodeCity);
export type CourierIdentityInput = z.input<typeof courierIdentitySchema>;
export type CourierIdentityValues = z.output<typeof courierIdentitySchema>;

export const courierVehicleSchema = z
  .object({
    vehicle: z.enum(['bike', 'scooter', 'car'], { message: 'validation.courier.vehicleRequired' }),
    plate: z.string().trim().optional(),
    licenceNumber: z.string().trim().optional(),
    /** Insurer, policy number and expiry — asked of moto and voiture only. */
    insurerName: z.string().trim().optional(),
    insurancePolicy: z.string().trim().optional(),
    insuranceExpiry: z.string().trim().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.vehicle === 'bike') return;
    // A motorised courier without a plate, a licence or an insurance policy is a
    // file an administrator would send straight back, so the form asks here
    // rather than letting it sit in the queue for a day first. Insurance joined
    // the list at the client's request — it was only ever promised in a helper
    // line that said it would be asked for "à la validation".
    if (!values.plate || values.plate.length < 4) {
      ctx.addIssue({ code: 'custom', path: ['plate'], message: 'validation.courier.plateRequired' });
    }
    if (!values.licenceNumber || values.licenceNumber.length < 5) {
      ctx.addIssue({ code: 'custom', path: ['licenceNumber'], message: 'validation.courier.licenceRequired' });
    }
    if (!values.insurerName || values.insurerName.length < 2) {
      ctx.addIssue({ code: 'custom', path: ['insurerName'], message: 'validation.courier.insurerRequired' });
    }
    if (!values.insurancePolicy || values.insurancePolicy.length < 4) {
      ctx.addIssue({
        code: 'custom',
        path: ['insurancePolicy'],
        message: 'validation.courier.policyRequired',
      });
    }
    if (!values.insuranceExpiry || !/^(0[1-9]|1[0-2])\/\d{4}$/.test(values.insuranceExpiry)) {
      ctx.addIssue({
        code: 'custom',
        path: ['insuranceExpiry'],
        message: 'validation.courier.expiryFormat',
      });
    } else if (isExpired(values.insuranceExpiry)) {
      ctx.addIssue({
        code: 'custom',
        path: ['insuranceExpiry'],
        message: 'validation.courier.policyExpired',
      });
    }
  });
export type CourierVehicleValues = z.infer<typeof courierVehicleSchema>;

/**
 * A policy that lapsed last month is not cover.
 *
 * Compared at month granularity — an insurer's "03/2027" means the end of
 * March, so the whole of March is still covered.
 */
function isExpired(mmYyyy: string, now = new Date()): boolean {
  const [month, year] = mmYyyy.split('/').map(Number);
  if (year < now.getFullYear()) return true;
  return year === now.getFullYear() && month < now.getMonth() + 1;
}

export const courierPayoutSchema = z
  .object({
    /**
     * The bank, chosen from `data/banks.ts` rather than typed.
     *
     * It was a free-text "Institution financière", which accepted "RBC",
     * "Royale" and "banque royale" as three institutions and left nothing to
     * reconcile a deposit against. `other` keeps the escape hatch the client
     * asked for.
     */
    bankId: z.string().min(1, 'validation.courier.bankRequired'),
    bankNameOther: z.string().trim().optional(),
    transit: z.string().trim().regex(/^\d{5}$/, 'validation.courier.transitFormat'),
    account: z.string().trim().regex(/^\d{7,12}$/, 'validation.courier.accountFormat'),
  })
  .superRefine((values, ctx) => {
    if (values.bankId !== OTHER_BANK_ID) {
      if (!banks.some((b) => b.id === values.bankId)) {
        ctx.addIssue({ code: 'custom', path: ['bankId'], message: 'validation.courier.bankUnknown' });
      }
      return;
    }
    if (!values.bankNameOther || values.bankNameOther.length < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['bankNameOther'],
        message: 'validation.courier.bankOtherRequired',
      });
    }
  });
export type CourierPayoutValues = z.infer<typeof courierPayoutSchema>;

export const courierSchema = z.object({
  identity: courierIdentitySchema,
  vehicle: courierVehicleSchema,
  payout: courierPayoutSchema,
});
export type CourierValues = z.infer<typeof courierSchema>;

/**
 * "Moto", not "Scooter" (client, août 2026).
 *
 * The stored value stays `scooter`: it is the key of `VEHICLE_SPEED_KMH` in
 * `data/delivery.ts` and it sits in every seeded courier row and every
 * persisted application, so renaming it would be a data migration to change a
 * word on a button. What the courier is asked, and what every screen shows, is
 * the label — which now lives in `domain.vehicle.*`, where English can honestly
 * say "Scooter" while French says "Moto".
 */
export const VEHICLE_KEYS: Record<CourierVehicleValues['vehicle'], MessageKey> = {
  bike: 'domain.vehicle.bike',
  scooter: 'domain.vehicle.scooter',
  car: 'domain.vehicle.car',
};

/** Vehicles the platform treats as motorised: plate, licence and insurance. */
export function isMotorised(vehicle: CourierVehicleValues['vehicle']): boolean {
  return vehicle !== 'bike';
}
