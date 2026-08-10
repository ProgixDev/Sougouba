import type { ImageSourcePropType } from 'react-native';

import { productImages } from '@/data/images.generated';

/**
 * The photo that stands for each category in the Home strip.
 *
 * Each one is a real product from that category's own shelf rather than a
 * generic stand-in — the mangoes, the ras el hanout and the thieboudienne are
 * the same photographs the shopper meets further down the catalogue, so the
 * strip previews the goods instead of labelling them.
 *
 * Picked for how they survive a 64px circular crop: a single subject, filling
 * the frame, readable at a glance. Anything absent falls back to the tinted
 * placeholder in CategoryCircle.
 */
export const categoryImages: Record<string, ImageSourcePropType | undefined> = {
  cat_produce: productImages.prd_mangue_kent,
  cat_spices: productImages.prd_ras_el_hanout,
  cat_meat: productImages.prd_merguez_maison,
  cat_beverages: productImages.prd_jus_bissap,
  cat_prepared: productImages.prd_thieboudienne,
  cat_dairy: productImages.prd_lben,
  cat_grains: productImages.prd_riz_brise,
  cat_bakery: productImages.prd_cornes_gazelle,
};
