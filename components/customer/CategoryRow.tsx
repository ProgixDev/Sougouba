import { ScrollView } from 'react-native';

import type { Category, ID } from '@/data/types';
import { CategoryCircle } from './CategoryCircle';

export interface CategoryRowProps {
  categories: Category[];
  selectedId?: ID | null;
  onSelect?: (id: ID) => void;
}

/**
 * Horizontal category strip. Deliberately transparent — it now sits inside the
 * Home header's gradient panel, so painting its own background would double up.
 * The trailing padding leaves the last badge partly cut off at rest, which is
 * what tells you the row scrolls.
 */
export function CategoryRow({ categories, selectedId, onSelect }: CategoryRowProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // The selection ring sits a few points outside each badge, so the row
      // needs vertical slack or the top of the ring is clipped by the scroller.
      contentContainerClassName="px-5 gap-4 pt-1.5 pb-1.5"
    >
      {categories.map((category) => (
        <CategoryCircle
          key={category.id}
          category={category}
          selected={selectedId === category.id}
          onPress={() => onSelect?.(category.id)}
        />
      ))}
    </ScrollView>
  );
}
