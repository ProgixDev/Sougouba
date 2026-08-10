import { vendors as seedVendors } from '../seed/vendors';
import type { ID, Vendor } from '../types';
import { delay } from '../utils/delay';

export async function getVendors(): Promise<Vendor[]> {
  await delay();
  return seedVendors;
}

export async function getVendorById(id: ID): Promise<Vendor | undefined> {
  await delay(150, 300);
  return seedVendors.find((v) => v.id === id);
}

export async function getVendorBySlug(slug: string): Promise<Vendor | undefined> {
  await delay(150, 300);
  return seedVendors.find((v) => v.slug === slug);
}

export async function getVendorsByCategory(categoryId: ID): Promise<Vendor[]> {
  await delay();
  return seedVendors.filter((v) => v.categoryIds.includes(categoryId));
}

export async function getVendorByOwnerId(ownerId: ID): Promise<Vendor | undefined> {
  await delay(150, 300);
  return seedVendors.find((v) => v.ownerId === ownerId);
}
