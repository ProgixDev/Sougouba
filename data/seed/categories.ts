import type { Category } from '../types';

export const categories: Category[] = [
  { id: 'cat_produce', slug: 'fruits-legumes', nameFr: 'Fruits & Légumes', shortNameFr: 'Fruits', icon: 'carrot', colorToken: 'forest' },
  { id: 'cat_spices', slug: 'epices-condiments', nameFr: 'Épices & Condiments', shortNameFr: 'Épices', icon: 'flame', colorToken: 'terracotta' },
  { id: 'cat_meat', slug: 'viande-halal', nameFr: 'Viande Halal', shortNameFr: 'Viande', icon: 'drumstick', colorToken: 'mustard' },
  { id: 'cat_beverages', slug: 'boissons', nameFr: 'Boissons', shortNameFr: 'Boissons', icon: 'cup-soda', colorToken: 'forest' },
  { id: 'cat_prepared', slug: 'plats-prepares', nameFr: 'Plats Préparés', shortNameFr: 'Plats', icon: 'utensils', colorToken: 'terracotta' },
  { id: 'cat_dairy', slug: 'produits-laitiers', nameFr: 'Produits Laitiers', shortNameFr: 'Laitiers', icon: 'milk', colorToken: 'mustard' },
  { id: 'cat_grains', slug: 'cereales-legumineuses', nameFr: 'Céréales & Légumineuses', shortNameFr: 'Céréales', icon: 'wheat', colorToken: 'forest' },
  // "Boulangerie" was withdrawn from the v1 scope (CDC addendum v1.1, §01) — as a
  // browse vertical, which is where the shopper met it. These thirteen products
  // are still real and still need a search filter, so the shelf is renamed for
  // what is actually on it rather than emptied into "Plats Préparés", which
  // would have to hold baklava, chapati and khobz to absorb them.
  { id: 'cat_bakery', slug: 'pains-patisseries', nameFr: 'Pains & Pâtisseries', shortNameFr: 'Pains', icon: 'croissant', colorToken: 'terracotta' },
];
