import type { Category } from '../types';

export const categories: Category[] = [
  { id: 'cat_produce', slug: 'fruits-legumes', name: { fr: 'Fruits & Légumes', en: 'Fruit & Vegetables' }, shortName: { fr: 'Fruits', en: 'Fruit' }, icon: 'carrot', colorToken: 'forest' },
  { id: 'cat_spices', slug: 'epices-condiments', name: { fr: 'Épices & Condiments', en: 'Spices & Condiments' }, shortName: { fr: 'Épices', en: 'Spices' }, icon: 'flame', colorToken: 'terracotta' },
  { id: 'cat_meat', slug: 'viande-halal', name: { fr: 'Viande Halal', en: 'Halal Meat' }, shortName: { fr: 'Viande', en: 'Meat' }, icon: 'drumstick', colorToken: 'mustard' },
  { id: 'cat_beverages', slug: 'boissons', name: { fr: 'Boissons', en: 'Drinks' }, shortName: { fr: 'Boissons', en: 'Drinks' }, icon: 'cup-soda', colorToken: 'forest' },
  { id: 'cat_prepared', slug: 'plats-prepares', name: { fr: 'Plats Préparés', en: 'Prepared Dishes' }, shortName: { fr: 'Plats', en: 'Dishes' }, icon: 'utensils', colorToken: 'terracotta' },
  { id: 'cat_dairy', slug: 'produits-laitiers', name: { fr: 'Produits Laitiers', en: 'Dairy' }, shortName: { fr: 'Laitiers', en: 'Dairy' }, icon: 'milk', colorToken: 'mustard' },
  { id: 'cat_grains', slug: 'cereales-legumineuses', name: { fr: 'Céréales & Légumineuses', en: 'Grains & Pulses' }, shortName: { fr: 'Céréales', en: 'Grains' }, icon: 'wheat', colorToken: 'forest' },
  // "Boulangerie" was withdrawn from the v1 scope (CDC addendum v1.1, §01) — as a
  // browse vertical, which is where the shopper met it. These thirteen products
  // are still real and still need a search filter, so the shelf is renamed for
  // what is actually on it rather than emptied into "Plats Préparés", which
  // would have to hold baklava, chapati and khobz to absorb them.
  { id: 'cat_bakery', slug: 'pains-patisseries', name: { fr: 'Pains & Pâtisseries', en: 'Breads & Pastries' }, shortName: { fr: 'Pains', en: 'Breads' }, icon: 'croissant', colorToken: 'terracotta' },
];
