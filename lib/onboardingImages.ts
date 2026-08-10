import type { ImageSourcePropType } from 'react-native';

/**
 * Onboarding photography, kept apart from the catalogue.
 *
 * These are the only images in the app that run edge to edge, and the catalogue
 * is square (900×900) because it was cut for product cards and vendor covers —
 * stretched to fill a phone it upscales roughly 1.3×, which is exactly the
 * softness a brand screen cannot afford. These are 1400×2800 portrait crops of
 * the same Pexels originals, so they land sharp on every current iPhone and the
 * subject is framed for a tall frame rather than centre-cropped out of a square.
 *
 * Re-cut any of them with (id from assets/images/CREDITS.md):
 *   curl -o assets/images/onboarding/<name>.jpg \
 *     "https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=700&h=1400&fit=crop"
 */
export const onboardingImages: Record<string, ImageSourcePropType> = {
  /** Shop shelves: glass jars, dried goods, a brass scale. A store, not a crate of produce. */
  market: require('@/assets/images/onboarding/market.jpg'),
  /** Marrakech spice stall, jars above and pyramids below. */
  spices: require('@/assets/images/onboarding/spices.jpg'),
  /** Couscous, low-key — dark at the top for the skip link, warm where the headline sits. */
  table: require('@/assets/images/onboarding/table.jpg'),
  /** A hand choosing eggs at a market stall — the act of shopping, not the meal after it. */
  shopping: require('@/assets/images/onboarding/shopping.jpg'),
};
