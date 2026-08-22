import { vendors as seedVendors } from '../seed/vendors';
import type {
  Address,
  ID,
  ShopRegistration,
  Vendor,
  VendorSection,
  VendorStatus,
  VendorType,
} from '../types';
import { delay } from '../utils/delay';
import { generateId } from '../utils/ids';
import { createPersistedTable } from '../utils/persistedTable';

/**
 * Shops persist now that they can be created in the app: a merchant who
 * registers during a demo, kills the app and comes back to an empty account
 * would read that as a bug rather than a mock. Same rules as every other table —
 * seeds re-read from code each launch, only app-written rows stored.
 */
const table = createPersistedTable<Vendor>('sougouba-mock-vendors', seedVendors);

/** Copies out, so callers can't mutate the table by holding a reference. */
function snapshot(vendor: Vendor): Vendor {
  return {
    ...vendor,
    categoryIds: [...vendor.categoryIds],
    hours: vendor.hours.map((h) => ({ ...h })),
    sections: vendor.sections.map((s) => ({ ...s })),
    address: { ...vendor.address },
    ...(vendor.registration ? { registration: { ...vendor.registration } } : {}),
  };
}

/**
 * Only shops an administrator has cleared.
 *
 * Every list a shopper browses goes through this. A shop whose file is still in
 * the queue is not "a shop that happens to be closed" — it is one the platform
 * has not vouched for, and putting it in front of someone who could order from
 * it is the thing the approval step exists to prevent.
 *
 * Id and owner lookups deliberately do *not* filter: the merchant has to be able
 * to see their own pending shop, and those callers know which shop they asked
 * for.
 */
function live(): Vendor[] {
  return table.rows().filter((v) => v.status === 'approved');
}

export async function getVendors(): Promise<Vendor[]> {
  await table.ready;
  await delay();
  return live().map(snapshot);
}

export async function getVendorById(id: ID): Promise<Vendor | undefined> {
  await table.ready;
  await delay(150, 300);
  const found = table.rows().find((v) => v.id === id);
  return found ? snapshot(found) : undefined;
}

export async function getVendorBySlug(slug: string): Promise<Vendor | undefined> {
  await table.ready;
  await delay(150, 300);
  const found = live().find((v) => v.slug === slug);
  return found ? snapshot(found) : undefined;
}

export async function getVendorsByType(vendorType: VendorType): Promise<Vendor[]> {
  await table.ready;
  await delay();
  return live()
    .filter((v) => v.vendorType === vendorType)
    .map(snapshot);
}

export async function getVendorsByCategory(categoryId: ID): Promise<Vendor[]> {
  await table.ready;
  await delay();
  return live()
    .filter((v) => v.categoryIds.includes(categoryId))
    .map(snapshot);
}

export async function getVendorByOwnerId(ownerId: ID): Promise<Vendor | undefined> {
  await table.ready;
  await delay(150, 300);
  const found = table.rows().find((v) => v.ownerId === ownerId);
  return found ? snapshot(found) : undefined;
}

// ── registration ────────────────────────────────────────────────────────────

export interface ShopApplication {
  ownerId: ID;
  name: string;
  vendorType: VendorType;
  specialtyFr: string;
  isHalalCertified: boolean;
  address: Address;
  deliveryEtaMin: number;
  registration: Omit<ShopRegistration, 'submittedAt'>;
}

/** Nine to nine, seven days. A starting point the merchant edits, not a claim. */
const DEFAULT_HOURS = Array.from({ length: 7 }, (_, day) => ({
  day,
  open: '09:00',
  close: '21:00',
}));

/**
 * Headings a new shop starts with, so its page is not a single unsorted list on
 * day one. They are the merchant's own words to change (CDC addendum v1.1, §01)
 * — these are a first draft, not a taxonomy.
 */
function defaultSections(id: ID, vendorType: VendorType): VendorSection[] {
  const labels =
    vendorType === 'restaurant'
      ? ['Entrées', 'Plats', 'Desserts', 'Boissons']
      : ['Fruits & légumes', 'Épices', 'Conserves', 'Boissons'];
  return labels.map((nameFr, index) => ({ id: `sec_${id}_${index + 1}`, nameFr }));
}

/** Lowercase, accent-free, hyphenated — the shop's own address on the platform. */
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * A merchant registers their shop.
 *
 * The shop is created `pending` and stays out of every customer-facing list
 * until an administrator clears it. Rating and review count start at zero rather
 * than at a flattering default — a shop that has never sold anything has no
 * reputation, and inventing one is the kind of lie a marketplace cannot walk
 * back.
 *
 * `categoryIds` starts empty on purpose: which platform categories a shop
 * belongs to falls out of what it actually stocks, so it fills in as the
 * catalogue does rather than being claimed up front.
 */
export async function submitShopApplication(input: ShopApplication): Promise<Vendor> {
  await table.ready;
  await delay(500, 900);
  const id = generateId('vnd');
  const vendor: Vendor = {
    id,
    slug: slugify(input.name) || id,
    name: input.name,
    vendorType: input.vendorType,
    specialtyFr: input.specialtyFr,
    // Empty is the seeded value too — `CatalogImage` draws a stable tinted
    // placeholder from the id, so a shop with no photography still has a face.
    logoUrl: '',
    coverUrl: '',
    categoryIds: [],
    city: input.address.city,
    neighborhood: input.address.city,
    address: input.address,
    rating: 0,
    reviewCount: 0,
    deliveryEtaMin: input.deliveryEtaMin,
    isHalalCertified: input.isHalalCertified,
    hours: DEFAULT_HOURS,
    sections: defaultSections(id, input.vendorType),
    ownerId: input.ownerId,
    status: 'pending',
    registration: { ...input.registration, submittedAt: new Date().toISOString() },
  };
  await table.add(vendor);
  return snapshot(vendor);
}

export async function setVendorStatus(id: ID, status: VendorStatus): Promise<Vendor | undefined> {
  await table.ready;
  await delay(300, 600);
  const vendor = table.rows().find((v) => v.id === id);
  if (!vendor) return undefined;
  vendor.status = status;
  await table.save(vendor.id);
  return snapshot(vendor);
}
