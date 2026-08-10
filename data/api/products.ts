import { products as seedProducts } from '../seed/products';
import type { ID, Product } from '../types';
import { delay } from '../utils/delay';
import { generateId } from '../utils/ids';
import { createPersistedTable } from '../utils/persistedTable';

/**
 * Persisted so business-owner catalogue edits survive a restart — a shop owner
 * adding a product, relaunching, and finding it gone reads as data loss.
 */
const table = createPersistedTable<Product>('sougouba-mock-products', seedProducts);

/** Copies out, so callers can't mutate the catalogue by holding a reference. */
function snapshot(product: Product): Product {
  return { ...product, nutrition: { ...product.nutrition }, tags: [...product.tags] };
}

export async function getProducts(): Promise<Product[]> {
  await table.ready;
  await delay();
  return table.rows().map(snapshot);
}

export async function getProductById(id: ID): Promise<Product | undefined> {
  await table.ready;
  await delay(150, 300);
  const found = table.rows().find((p) => p.id === id);
  return found ? snapshot(found) : undefined;
}

export async function getProductsByVendor(vendorId: ID): Promise<Product[]> {
  await table.ready;
  await delay();
  return table.rows().filter((p) => p.vendorId === vendorId).map(snapshot);
}

export async function getProductsByCategory(categoryId: ID): Promise<Product[]> {
  await table.ready;
  await delay();
  return table.rows().filter((p) => p.categoryId === categoryId).map(snapshot);
}

export async function searchProducts(query: string): Promise<Product[]> {
  await table.ready;
  await delay();
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return table
    .rows()
    .filter((p) => p.name.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q)))
    .map(snapshot);
}

export async function createProduct(input: Omit<Product, 'id'>): Promise<Product> {
  await table.ready;
  await delay();
  const product: Product = { ...input, id: generateId('prd') };
  await table.add(product);
  return snapshot(product);
}

export async function updateProduct(id: ID, patch: Partial<Product>): Promise<Product | undefined> {
  await table.ready;
  await delay();
  const rows = table.rows();
  const index = rows.findIndex((p) => p.id === id);
  if (index === -1) return undefined;
  rows[index] = { ...rows[index], ...patch };
  await table.save(id);
  return snapshot(rows[index]);
}

export async function deleteProduct(id: ID): Promise<void> {
  await table.ready;
  await delay();
  await table.remove(id);
}
