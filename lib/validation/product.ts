import { z } from 'zod';

/**
 * Numeric fields arrive as strings from `TextInput`, and an empty field is `''`
 * rather than undefined — `z.coerce.number()` would turn that into 0 and
 * silently accept a blank price as free. These helpers require a non-empty
 * string first, then convert by hand.
 *
 * "4,50", "12.99", "1 250,50" and "1,250.50" are the same number typed on four
 * keyboards. The previous version replaced only the first comma, which parsed
 * "1,250" as 1.25 — a merchant's $1,250 sack of rice saved at $1.25, with no
 * error shown. That became reachable the moment a keyboard produced grouped
 * digits.
 *
 * The rule: the **last** separator is the decimal mark and everything before it
 * is grouping — except for the one genuinely ambiguous shape, a single
 * separator followed by exactly three digits ("1,250"). French reads that as
 * 1.25, English as 1250. It resolves as **grouping**, because a price with three
 * decimal places is not a thing a merchant types, while a thousands separator
 * is: French writes $1.25 as "1,25", never "1,250".
 *
 * Deliberately not driven by the app's locale: the app's language is not the
 * keyboard's, and a francophone merchant on an English phone still types "4,50".
 */
function toNumber(value: string): number {
  // Spaces, NBSP and narrow NBSP are all grouping separators in fr-CA; the
  // apostrophe is one on some keyboards.
  const cleaned = value.replace(/[\s  ']/g, '');
  const mark = Math.max(cleaned.lastIndexOf(','), cleaned.lastIndexOf('.'));
  if (mark === -1) return Number(cleaned);

  const head = cleaned.slice(0, mark);
  const tail = cleaned.slice(mark + 1);
  if (!/^\d+$/.test(tail)) return NaN;

  // Plain digits before the mark: an ordinary decimal, or the ambiguous
  // three-digit shape resolved as grouping per the note above.
  if (/^\d+$/.test(head)) {
    return /^\d{1,3}$/.test(head) && /^\d{3}$/.test(tail)
      ? Number(head + tail)
      : Number(`${head}.${tail}`);
  }

  // Otherwise the head must itself be well-formed grouping — a 1-3 digit lead
  // then three-digit groups, all on the *same* separator. Without this, "1.2.3"
  // strips down to a plausible-looking 12.3 instead of being rejected.
  if (!/^\d{1,3}(?:([.,])\d{3})(?:\1\d{3})*$/.test(head)) return NaN;
  return Number(`${head.replace(/[.,]/g, '')}.${tail}`);
}

const requiredNumber = (message: string, { allowZero = true } = {}) =>
  z
    .string()
    .trim()
    .min(1, message)
    .transform(toNumber)
    .refine((n) => Number.isFinite(n), message)
    .refine((n) => (allowZero ? n >= 0 : n > 0), message);

const optionalNumber = ({ allowZero = true } = {}) =>
  z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : toNumber(value)))
    .refine(
      (n) => n === undefined || (Number.isFinite(n) && (allowZero ? n >= 0 : n > 0)),
      allowZero ? 'validation.product.numberInvalid' : 'validation.product.mustBePositive'
    );

export const productSchema = z
  .object({
    name: z.string().trim().min(2, 'validation.product.nameRequired'),
    description: z.string().trim().min(10, 'validation.product.descriptionRequired'),
    categoryId: z.string().min(1, 'validation.product.categoryRequired'),
    sectionId: z.string().min(1, 'validation.product.sectionRequired'),
    priceCad: requiredNumber('validation.product.priceRequired', { allowZero: false }),
    compareAtPriceCad: optionalNumber({ allowZero: false }),
    stockQty: requiredNumber('validation.product.stockRequired'),
    isAvailable: z.boolean(),
    tags: z.string().trim(),
    /**
     * Opt-in (client, août 2026). A merchant could not save a sack of rice
     * without typing four numbers nobody prints on a sack of rice; the section
     * is collapsed until this is ticked.
     */
    hasNutrition: z.boolean(),
    calories: optionalNumber(),
    proteinG: optionalNumber(),
    fatG: optionalNumber(),
    weightG: optionalNumber(),
  })
  // A "was" price below the selling price would render as a negative discount.
  .refine(
    (data) => data.compareAtPriceCad === undefined || data.compareAtPriceCad > data.priceCad,
    { message: 'validation.product.compareAtTooLow', path: ['compareAtPriceCad'] }
  )
  // Ticked but left blank is worse than not ticked at all: the product page
  // would draw a four-column strip with holes in it. Same shape as the MAPAQ
  // rule in `lib/validation/merchant.ts`.
  .superRefine((data, ctx) => {
    if (!data.hasNutrition) return;
    for (const field of NUTRITION_FIELDS) {
      if (data[field] === undefined) {
        ctx.addIssue({ code: 'custom', path: [field], message: 'validation.product.fieldRequired' });
      }
    }
  });

/** The four columns of `components/customer/NutritionRow.tsx`, in its order. */
export const NUTRITION_FIELDS = ['calories', 'proteinG', 'fatG', 'weightG'] as const;

/** Post-parse shape: numbers are numbers. */
export type ProductFormValues = z.output<typeof productSchema>;
/** Pre-parse shape: what the form fields actually hold. */
export type ProductFormInput = z.input<typeof productSchema>;

/** `"bio, frais"` → `['bio', 'frais']`, dropping blanks and duplicates. */
export function parseTags(raw: string): string[] {
  return [...new Set(raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))];
}
