import { z } from 'zod';

/**
 * A merchant's own promo code.
 *
 * The merchant creates it because the merchant pays for it: the discount comes
 * off what the shop receives, while the platform's commission is still taken on
 * the full subtotal (see `OrdersService.createPaymentIntent`). So a coupon made
 * here is always scoped to the caller's shop — there is no `vendorId` in the
 * body to aim it anywhere else.
 *
 * `validDays` rather than an end date: the app has no date picker, and "valable
 * 30 jours" is how a shop thinks about a promotion anyway. The API turns it
 * into `ends_at` so the stored rule stays an instant, not a duration.
 */
export const createCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      // Letters and digits only: a code is read off a poster and typed on a
      // phone, and `%`/`_` would also be wildcards in the `ilike` that looks it up.
      .regex(/^[A-Z0-9]{3,20}$/, 'Le code doit contenir de 3 à 20 lettres ou chiffres, sans espace'),
    discountType: z.enum(['percentage', 'fixed'], { message: 'Choisissez un type de réduction' }),
    discountValue: z.number({ message: 'Valeur requise' }).positive('La valeur doit être supérieure à 0'),
    /** Total redemptions across all customers. Absent = unlimited. */
    usageLimit: z.number().int('Nombre entier requis').min(1, 'Au moins 1 utilisation').max(100_000).optional(),
    /** Absent = no expiry; the merchant ends it by deactivating it. */
    validDays: z.number().int('Nombre entier requis').min(1, 'Au moins 1 jour').max(365, 'Un an au maximum').optional(),
  })
  .superRefine((value, ctx) => {
    if (value.discountType === 'percentage') {
      // `couponDiscountFor` reads this as a percent (15 → 15 %). Whole numbers
      // only — nobody advertises "12,5 % de rabais", and 100 % would give the
      // goods away while the shop still owes commission on them.
      if (!Number.isInteger(value.discountValue) || value.discountValue > 90) {
        ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'Le pourcentage doit être un nombre entier de 1 à 90' });
      }
    } else if (value.discountValue > 500 || Math.round(value.discountValue * 100) !== value.discountValue * 100) {
      ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'Le montant doit être de 0,01 $ à 500 $' });
    }
  });

export type CreateCouponInput = z.infer<typeof createCouponSchema>;
