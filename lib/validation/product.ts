import { z } from 'zod';

/**
 * Numeric fields arrive as strings from `TextInput`, and an empty field is `''`
 * rather than undefined — `z.coerce.number()` would turn that into 0 and
 * silently accept a blank price as free. These helpers require a non-empty
 * string first, then convert by hand.
 *
 * A French keyboard produces "4,50", so the comma is normalised before parsing;
 * without that, a perfectly reasonable price is rejected as NaN.
 */
function toNumber(value: string): number {
  return Number(value.replace(',', '.'));
}

const requiredNumber = (message: string, { allowZero = true } = {}) =>
  z
    .string()
    .trim()
    .min(1, message)
    .transform(toNumber)
    .refine((n) => Number.isFinite(n), message)
    .refine((n) => (allowZero ? n >= 0 : n > 0), message);

const optionalNumber = () =>
  z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : toNumber(value)))
    .refine((n) => n === undefined || (Number.isFinite(n) && n > 0), 'Doit être supérieur à 0');

export const productSchema = z
  .object({
    name: z.string().trim().min(2, 'Nom du produit requis'),
    description: z.string().trim().min(10, 'Décrivez le produit en quelques mots'),
    categoryId: z.string().min(1, 'Choisissez une catégorie'),
    sectionId: z.string().min(1, 'Choisissez un rayon'),
    priceCad: requiredNumber('Prix requis', { allowZero: false }),
    compareAtPriceCad: optionalNumber(),
    stockQty: requiredNumber('Quantité en stock requise'),
    isAvailable: z.boolean(),
    tags: z.string().trim(),
    calories: requiredNumber('Requis'),
    proteinG: requiredNumber('Requis'),
    fatG: requiredNumber('Requis'),
    weightG: requiredNumber('Requis'),
  })
  // A "was" price below the selling price would render as a negative discount.
  .refine(
    (data) => data.compareAtPriceCad === undefined || data.compareAtPriceCad > data.priceCad,
    { message: 'Le prix barré doit être supérieur au prix de vente', path: ['compareAtPriceCad'] }
  );

/** Post-parse shape: numbers are numbers. */
export type ProductFormValues = z.output<typeof productSchema>;
/** Pre-parse shape: what the form fields actually hold. */
export type ProductFormInput = z.input<typeof productSchema>;

/** `"bio, frais"` → `['bio', 'frais']`, dropping blanks and duplicates. */
export function parseTags(raw: string): string[] {
  return [...new Set(raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))];
}
