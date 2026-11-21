import { z } from 'zod';

import { citySchema, postalCodeSchema, refinePostalCodeCity } from './address';

/**
 * A shop's registration file, in three steps.
 *
 * Split like the courier's (`lib/validation/courier.ts`) so each step validates
 * as it is left rather than dropping every error at once on the last screen.
 *
 * Numeric fields are strings and coerced here — RN text inputs have no number
 * type, and holding them as numbers means fighting `NaN` on every keystroke
 * while the field is mid-edit. Same call `lib/validation/product.ts` makes.
 *
 * There is deliberately no delivery-fee field: the shop does not price the run.
 * See `data/deliveryPricing.ts`.
 */

export const shopIdentitySchema = z.object({
  name: z.string().trim().min(2, 'validation.merchant.nameRequired'),
  vendorType: z.enum(['grocery', 'restaurant'], { message: 'validation.merchant.typeRequired' }),
  /** An entry of the back-office list (`specialtiesApi`), no longer free text. */
  specialtyId: z.string().min(1, 'validation.merchant.specialtyRequired'),
  isHalalCertified: z.boolean(),
});
export type ShopIdentityValues = z.infer<typeof shopIdentitySchema>;

/** Minutes, typed as text. The API holds the same 10–180 bounds (`updateVendorSchema`). */
const deliveryEtaMinSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3}$/, 'validation.merchant.etaFormat')
  .refine((v) => Number(v) >= 10 && Number(v) <= 180, 'validation.merchant.etaRange');

export const shopAddressSchema = z
  .object({
    street: z.string().trim().min(4, 'validation.address.streetRequired'),
    city: citySchema,
    postalCode: postalCodeSchema,
    deliveryEtaMin: deliveryEtaMinSchema,
  })
  .superRefine(refinePostalCodeCity);
export type ShopAddressInput = z.input<typeof shopAddressSchema>;

/** `HH:MM`, 24-hour — what `vendor_hours` stores and `setHoursSchema` accepts. */
const clockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'validation.merchant.hoursFormat');

/**
 * One day of the week as the shop editor holds it. A closed day keeps its
 * times (the API still wants valid ones) but they are not checked against each
 * other — the merchant cannot see them. No overnight hours: the API compares
 * the two times as strings, so `22:00 – 02:00` is refused here too.
 */
export const shopHoursDaySchema = z
  .object({ day: z.number().int().min(0).max(6), open: clockSchema, close: clockSchema, closed: z.boolean() })
  .refine((h) => h.closed || h.open < h.close, { message: 'validation.merchant.hoursOrder', path: ['close'] });

/** The "Edit my shop" screen — the self-service subset of `updateVendorSchema`, plus the week. */
export const shopSettingsSchema = z.object({
  name: shopIdentitySchema.shape.name,
  isHalalCertified: z.boolean(),
  deliveryEtaMin: deliveryEtaMinSchema,
  hours: z.array(shopHoursDaySchema).length(7),
});
export type ShopSettingsValues = z.infer<typeof shopSettingsSchema>;
export type ShopAddressValues = z.infer<typeof shopAddressSchema>;

/**
 * A file picked on the device, not yet uploaded. It goes up only when the whole
 * application is sent (see `app/(business)/signup.tsx`), so going back and
 * changing an answer never leaves an orphan upload behind.
 */
export const pickedDocumentSchema = z.object({
  uri: z.string(),
  name: z.string(),
  mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/heic']),
});
export type PickedDocument = z.infer<typeof pickedDocumentSchema>;

/** Same upper bound as the `merchant-documents` bucket. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/**
 * The client's registration list (2026-09-27): legal name, NEQ *or* a proof of
 * registration, TPS/TVQ numbers, a valid MAPAQ permit, and the authorised
 * officer's ID and contact details. The bank account is its own step — see
 * `shopPayoutSchema`.
 *
 * `api/`'s `applyVendorSchema` holds the same rules; this copy exists
 * so errors land on the field as it is left rather than after a round trip.
 */
export const shopDocumentsSchema = z
  .object({
    legalName: z.string().trim().min(2, 'validation.merchant.legalNameRequired'),
    // The registraire prints it as 10 digits; people paste it with spaces.
    neq: z
      .string()
      .trim()
      .transform((v) => v.replace(/\s/g, ''))
      .refine((v) => v === '' || /^\d{10}$/.test(v), 'validation.merchant.neqFormat'),
    registrationProof: pickedDocumentSchema.nullable(),
    // Revenu Québec prints them as `123456789 RT0001` and `1234567890 TQ0001`.
    gstNumber: z
      .string()
      .trim()
      .transform((v) => v.replace(/\s/g, '').toUpperCase())
      .refine((v) => /^\d{9}RT\d{4}$/.test(v), 'validation.merchant.gstFormat'),
    qstNumber: z
      .string()
      .trim()
      .transform((v) => v.replace(/\s/g, '').toUpperCase())
      .refine((v) => /^\d{10}TQ\d{4}$/.test(v), 'validation.merchant.qstFormat'),
    // Every shop that sells food in Quebec holds one, grocery or restaurant.
    mapaqNumber: z.string().trim().min(4, 'validation.merchant.mapaqRequired'),
    /** Typed as `JJ/MM/AAAA`; handed on as `YYYY-MM-DD`. */
    mapaqExpiry: z.string().trim(),
    mapaqPermit: pickedDocumentSchema.nullable(),
    contactName: z.string().trim().min(2, 'validation.merchant.contactRequired'),
    contactPhone: z
      .string()
      .trim()
      .min(10, 'validation.phone.required')
      .regex(/^[\d\s()+.-]+$/, 'validation.phone.invalid'),
    idDocument: pickedDocumentSchema.nullable(),
  })
  .superRefine((values, ctx) => {
    if (!values.neq && !values.registrationProof) {
      ctx.addIssue({ code: 'custom', path: ['neq'], message: 'validation.merchant.neqOrProof' });
    }
    const iso = parseDayMonthYear(values.mapaqExpiry);
    if (!iso) {
      ctx.addIssue({ code: 'custom', path: ['mapaqExpiry'], message: 'validation.merchant.mapaqExpiryFormat' });
    } else if (iso <= todayIso()) {
      ctx.addIssue({ code: 'custom', path: ['mapaqExpiry'], message: 'validation.merchant.mapaqExpired' });
    }
    if (!values.mapaqPermit) {
      ctx.addIssue({ code: 'custom', path: ['mapaqPermit'], message: 'validation.merchant.mapaqPermitRequired' });
    }
    if (!values.idDocument) {
      ctx.addIssue({ code: 'custom', path: ['idDocument'], message: 'validation.merchant.idRequired' });
    }
  })
  .transform((values) => ({ ...values, mapaqExpiresOn: parseDayMonthYear(values.mapaqExpiry)! }));
export type ShopDocumentsInput = z.input<typeof shopDocumentsSchema>;
export type ShopDocumentsValues = z.infer<typeof shopDocumentsSchema>;

/**
 * How the shop gets paid. Not every merchant has — or wants — a Stripe
 * account, so the client asked for a choice: Stripe Connect (set up after
 * approval, on Stripe's own pages — the API refuses to open a Connect account
 * for a shop that may yet be rejected), or an official document from the bank
 * now.
 */
export const shopPayoutSchema = z
  .object({
    payoutMethod: z.enum(['stripe', 'bank_document'], { message: 'validation.merchant.payoutRequired' }),
    bankDocument: pickedDocumentSchema.nullable(),
  })
  .superRefine((values, ctx) => {
    if (values.payoutMethod === 'bank_document' && !values.bankDocument) {
      ctx.addIssue({ code: 'custom', path: ['bankDocument'], message: 'validation.merchant.bankDocumentRequired' });
    }
  });
export type ShopPayoutInput = z.input<typeof shopPayoutSchema>;
export type ShopPayoutValues = z.infer<typeof shopPayoutSchema>;

/** `31/12/2027` → `2027-12-31`, or null for anything that is not a real day. */
export function parseDayMonthYear(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  // Rejects 31/02 and friends, which `Date` would otherwise roll into March.
  if (date.getUTCDate() !== Number(dd) || date.getUTCMonth() !== Number(mm) - 1) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const VENDOR_TYPE_LABELS: Record<ShopIdentityValues['vendorType'], string> = {
  grocery: 'Épicerie',
  restaurant: 'Restaurant',
};
