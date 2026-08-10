import { Carrot, Croissant, CupSoda, Drumstick, Flame, type LucideIcon, Milk, Utensils, Wheat } from 'lucide-react-native';

/** Maps Category.icon (data/seed/categories.ts) to its Lucide component. */
export const categoryIcons: Record<string, LucideIcon> = {
  carrot: Carrot,
  flame: Flame,
  drumstick: Drumstick,
  'cup-soda': CupSoda,
  utensils: Utensils,
  milk: Milk,
  wheat: Wheat,
  croissant: Croissant,
};
