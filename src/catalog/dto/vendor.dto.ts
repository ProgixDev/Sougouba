import { z } from 'zod';

import { citySchema, postalCodeSchema, refinePostalCodeCity } from '../../geo/address-validation.js';
import { paginationSchema, queryBool } from './query.dto.js';

const vendorTypeSchema = z.enum(['grocery', 'restaurant'], { message: 'Choisissez une catégorie' });

// ── browse ──────────────────────────────────────────────────────────────────

/**
 * The customer-facing shop list. Every filter the mobile app applies over a
 * fully-fetched array (`getVendorsByType`, `getVendorsByCategory`, and the home
 * screen's own city filtering) is a query param here instead.
 */
export const vendorQuerySchema = paginationSchema.extend({
  type: vendorTypeSchema.optional(),
  categoryId: z.uuid().optional(),
  city: z.string().trim().min(1).optional(),
  /** Matches the shop name or its specialty line — the same substring test the mock's search does. */
  q: z.string().trim().min(1).optional(),
  /** Only shops trading right now, by their own posted hours in Montreal time. */
  openNow: queryBool,
});

export type VendorQuery = z.infer<typeof vendorQuerySchema>;

// ── registration ────────────────────────────────────────────────────────────

/**
 * Port of the three-step `lib/validation/merchant.ts` form in the mobile repo,
 * flattened into the single request the form submits at the end.
 *
 * The mobile schemas take every numeric field as a *string* — a deliberate
 * choice there, because an RN `TextInput` has no number type and holding these
 * as numbers means fighting `NaN` on every keystroke mid-edit. That reasoning
 * is about text inputs, not about JSON, so the rules are ported and the string
 * coercion is not: `deliveryEtaMin` is a number here.
 */
export const applyVendorSchema = z
  .object({
    name: z.string().trim().min(2, 'Nom de la boutique requis'),
    vendorType: vendorTypeSchema,
    specialtyFr: z
      .string()
      .trim()
      .min(3, 'Spécialité requise')
      .max(40, 'Trop long — une ligne sous le nom de la boutique'),
    isHalalCertified: z.boolean(),

    street: z.string().trim().min(4, 'Adresse requise'),
    city: citySchema,
    postalCode: postalCodeSchema,
    deliveryEtaMin: z
      .number()
      .int('Délai en minutes')
      .min(10, 'Entre 10 et 180 minutes')
      .max(180, 'Entre 10 et 180 minutes'),

    // The registraire prints it as 10 digits; people paste it with spaces.
    neq: z
      .string()
      .trim()
      .transform((v) => v.replace(/\s/g, ''))
      .refine((v) => /^\d{10}$/.test(v), 'NEQ à 10 chiffres'),
    contactName: z.string().trim().min(2, 'Nom du responsable requis'),
    contactPhone: z
      .string()
      .trim()
      .min(10, 'Téléphone requis')
      .regex(/^[\d\s()+.-]+$/, 'Numéro de téléphone invalide'),
    mapaqNumber: z.string().trim().optional(),
  })
  .superRefine((values, ctx) => {
    refinePostalCodeCity(values, ctx);
    // A restaurant without a MAPAQ permit is a file an administrator would send
    // straight back, so it is refused here rather than sitting in the queue for
    // a day first. Same rule as `shopDocumentsSchema`'s.
    if (values.vendorType !== 'restaurant') return;
    if (!values.mapaqNumber || values.mapaqNumber.length < 4) {
      ctx.addIssue({ code: 'custom', path: ['mapaqNumber'], message: 'Permis MAPAQ requis pour un restaurant' });
    }
  });

export type ApplyVendorInput = z.infer<typeof applyVendorSchema>;

// ── merchant self-service ───────────────────────────────────────────────────

/**
 * What a merchant may change about their own shop after registration.
 *
 * Deliberately absent: `status` (only Phase 8's admin endpoints set that),
 * `rating`/`reviewCount` (earned, never claimed — the mock is explicit that
 * inventing a reputation "is the kind of lie a marketplace cannot walk back"),
 * `ownerId`, and `slug` (a shop's public URL should not move under everyone who
 * has linked to it; renaming is a support action, not a self-service one).
 */
export const updateVendorSchema = z
  .object({
    name: z.string().trim().min(2, 'Nom de la boutique requis').optional(),
    specialtyFr: z.string().trim().min(3, 'Spécialité requise').max(40, 'Trop long').optional(),
    isHalalCertified: z.boolean().optional(),
    deliveryEtaMin: z.number().int().min(10, 'Entre 10 et 180 minutes').max(180, 'Entre 10 et 180 minutes').optional(),
    /** Storage paths, validated against this vendor's own prefix — see `media-paths.ts`. */
    logoUrl: z.string().trim().optional(),
    coverUrl: z.string().trim().optional(),
    /** The platform categories this shop carries. Replaces the whole set. */
    categoryIds: z.array(z.uuid()).max(20).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Aucun champ à modifier');

export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;

const clockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure au format HH:MM');

/**
 * Opening hours are replaced as a whole week, never patched day by day: a
 * merchant editing their hours is looking at all seven rows at once, and a
 * partial update is how you end up with a shop that is open Tuesday according
 * to one screen and closed according to another.
 */
export const setHoursSchema = z
  .array(
    z
      .object({
        day: z.number().int().min(0).max(6),
        open: clockSchema,
        close: clockSchema,
        closed: z.boolean().default(false),
      })
      .refine((h) => h.closed || h.open < h.close, {
        message: "L'heure de fermeture doit suivre l'heure d'ouverture",
        path: ['close'],
      })
  )
  .length(7, 'Les sept jours de la semaine sont requis')
  .refine((week) => new Set(week.map((h) => h.day)).size === 7, 'Chaque jour doit apparaître une seule fois');

export type SetHoursInput = z.infer<typeof setHoursSchema>;

export const sectionSchema = z.object({
  nameFr: z.string().trim().min(1, 'Nom du rayon requis').max(40, 'Trop long'),
  position: z.number().int().min(0).optional(),
});

export type SectionInput = z.infer<typeof sectionSchema>;
