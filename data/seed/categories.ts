import type { Category } from '../types';

export const categories: Category[] = [
  { id: 'cat_produce', slug: 'fruits-legumes', nameFr: 'Fruits & Légumes', shortNameFr: 'Fruits', icon: 'carrot', colorToken: 'forest' },
  { id: 'cat_spices', slug: 'epices-condiments', nameFr: 'Épices & Condiments', shortNameFr: 'Épices', icon: 'flame', colorToken: 'terracotta' },
  { id: 'cat_meat', slug: 'viande-halal', nameFr: 'Viande Halal', shortNameFr: 'Viande', icon: 'drumstick', colorToken: 'mustard' },
  { id: 'cat_beverages', slug: 'boissons', nameFr: 'Boissons', shortNameFr: 'Boissons', icon: 'cup-soda', colorToken: 'forest' },
  { id: 'cat_prepared', slug: 'plats-prepares', nameFr: 'Plats Préparés', shortNameFr: 'Plats', icon: 'utensils', colorToken: 'terracotta' },
  { id: 'cat_dairy', slug: 'produits-laitiers', nameFr: 'Produits Laitiers', shortNameFr: 'Laitiers', icon: 'milk', colorToken: 'mustard' },
  { id: 'cat_grains', slug: 'cereales-legumineuses', nameFr: 'Céréales & Légumineuses', shortNameFr: 'Céréales', icon: 'wheat', colorToken: 'forest' },
  { id: 'cat_bakery', slug: 'boulangerie-patisserie', nameFr: 'Boulangerie & Pâtisserie', shortNameFr: 'Boulangerie', icon: 'croissant', colorToken: 'terracotta' },
];
