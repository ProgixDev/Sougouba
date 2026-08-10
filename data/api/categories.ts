import { categories as seedCategories } from '../seed/categories';
import type { Category, ID } from '../types';
import { delay } from '../utils/delay';

export async function getCategories(): Promise<Category[]> {
  await delay();
  return seedCategories;
}

export async function getCategoryById(id: ID): Promise<Category | undefined> {
  await delay(150, 300);
  return seedCategories.find((c) => c.id === id);
}
