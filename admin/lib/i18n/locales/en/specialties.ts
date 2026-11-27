import type { Shape } from '../../types';
import type { specialties as fr } from '../fr/specialties';

export const specialties: Shape<typeof fr> = {
  title: 'Specialties',
  description: 'The list offered to merchants when they sign up. A retired specialty is no longer offered, but the shops that chose it keep it.',
  actionFailed: 'The action could not be completed.',
  lists: {
    groceryTitle: 'Grocery stores',
    groceryHint: 'The type of shop: African grocery, halal butcher…',
    restaurantTitle: 'Restaurants',
    restaurantHint: 'The cuisine served: Senegalese, Ethiopian…',
  },
  kpi: {
    groceryActive: 'Grocery stores · active',
    groceryActiveHint: 'Offered to grocery stores',
    restaurantActive: 'Restaurants · active',
    restaurantActiveHint: 'Offered to restaurants',
    shopsClassified: 'Categorized shops',
    shopsClassifiedHint: 'Shops that chose a specialty from the list',
    retired: 'Retired',
    retiredHint: 'Kept by the shops that chose them',
  },
  list: {
    empty: 'No specialties.',
    nameFr: 'Name in French',
    nameEn: 'Name in English',
    renameReach: {
      one: 'The new name will appear on {count} shop.',
      other: 'The new name will appear on {count} shops.',
    },
    retiredBadge: 'Retired',
    shopCount: { one: '{count} shop', other: '{count} shops' },
    moveUp: 'Move up',
    moveDown: 'Move down',
    rename: 'Rename',
    retire: 'Retire',
    reactivate: 'Reactivate',
  },
  toast: {
    added: '“{name}” added.',
    renamed: 'Specialty renamed.',
    retired: '“{name}” retired.',
    reactivated: '“{name}” reactivated.',
  },
};
