/**
 * The static cast the seed builds its world from.
 *
 * Names, cities and specialities are transcribed from the mobile repo's
 * `data/seed/vendors.ts` and `data/seed/couriers.ts`, plus the pending and
 * suspended files that `admin/lib/api/seed.ts` had to invent — the real mobile
 * seed ships every shop and courier pre-approved, so without those the back
 * office's approval queues would be empty and the screens that matter most
 * would be untestable.
 *
 * Transcribed rather than imported: this repo cannot reach `../sougouba/data/`
 * without making CI depend on a sibling checkout, and the shapes differ anyway
 * (nested `address` vs flat columns, string section ids vs uuids).
 */

export type VendorType = 'grocery' | 'restaurant';
export type VendorStatus = 'pending' | 'approved' | 'suspended' | 'rejected';
export type CourierStatus = 'pending' | 'approved' | 'suspended' | 'rejected';
export type VehicleType = 'bike' | 'scooter' | 'car';

/** The 8 category uuids fixed by `drizzle/0007_seed_categories.sql`. */
export const CATEGORY_IDS = {
  fruitsLegumes: '7f3a1c00-0000-4000-8000-000000000001',
  epicesCondiments: '7f3a1c00-0000-4000-8000-000000000002',
  viandeHalal: '7f3a1c00-0000-4000-8000-000000000003',
  boissons: '7f3a1c00-0000-4000-8000-000000000004',
  platsPrepares: '7f3a1c00-0000-4000-8000-000000000005',
  produitsLaitiers: '7f3a1c00-0000-4000-8000-000000000006',
  cerealesLegumineuses: '7f3a1c00-0000-4000-8000-000000000007',
  painsPatisseries: '7f3a1c00-0000-4000-8000-000000000008',
} as const;

export interface VendorFixture {
  key: string;
  name: string;
  slug: string;
  vendorType: VendorType;
  specialtyFr: string;
  city: string;
  neighborhood: string;
  addressStreet: string;
  addressPostalCode: string;
  lat: number;
  lng: number;
  status: VendorStatus;
  /** Required by the route for anything but an approval; mirrored into `status_reason`. */
  statusReason?: string;
  categoryKeys: (keyof typeof CATEGORY_IDS)[];
  /** Owner's display name; the account is derived from `key`. */
  ownerName: string;
}

/** Ten approved shops, straight from the mobile seed, plus five files to review. */
export const VENDORS: VendorFixture[] = [
  { key: 'bamako', name: 'Marché Bamako', slug: 'marche-bamako', vendorType: 'grocery', specialtyFr: 'Épicerie ouest-africaine', city: 'Montréal', neighborhood: 'Côte-des-Neiges', addressStreet: '6820 Chemin de la Côte-des-Neiges', addressPostalCode: 'H3S 2B6', lat: 45.4952, lng: -73.6284, status: 'approved', categoryKeys: ['fruitsLegumes', 'cerealesLegumineuses', 'epicesCondiments'], ownerName: 'Ousmane Traoré' },
  { key: 'atlas', name: 'Épicerie Atlas', slug: 'epicerie-atlas', vendorType: 'grocery', specialtyFr: 'Épicerie maghrébine', city: 'Montréal', neighborhood: 'Villeray', addressStreet: '7255 Rue Saint-Hubert', addressPostalCode: 'H2R 2N3', lat: 45.5401, lng: -73.6178, status: 'approved', categoryKeys: ['epicesCondiments', 'painsPatisseries', 'boissons'], ownerName: 'Karim Benali' },
  { key: 'sahel', name: 'Boucherie du Sahel', slug: 'boucherie-du-sahel', vendorType: 'grocery', specialtyFr: 'Boucherie halal', city: 'Montréal', neighborhood: 'Montréal-Nord', addressStreet: '5410 Boulevard Henri-Bourassa Est', addressPostalCode: 'H1G 2S8', lat: 45.6072, lng: -73.6294, status: 'approved', categoryKeys: ['viandeHalal'], ownerName: 'Ibrahim Cissé' },
  { key: 'dakar', name: 'Saveurs de Dakar', slug: 'saveurs-de-dakar', vendorType: 'restaurant', specialtyFr: 'Sénégalais · Poisson et riz', city: 'Montréal', neighborhood: 'Parc-Extension', addressStreet: '755 Rue Jean-Talon Ouest', addressPostalCode: 'H3N 1S1', lat: 45.5348, lng: -73.6294, status: 'approved', categoryKeys: ['platsPrepares'], ownerName: 'Aminata Diop' },
  { key: 'maghreb', name: 'Douceurs du Maghreb', slug: 'douceurs-du-maghreb', vendorType: 'restaurant', specialtyFr: 'Pâtisserie · Salon de thé', city: 'Montréal-Nord', neighborhood: 'Montréal-Nord', addressStreet: '4180 Rue de Charleroi', addressPostalCode: 'H1H 1T5', lat: 45.5921, lng: -73.6337, status: 'approved', categoryKeys: ['painsPatisseries', 'boissons'], ownerName: 'Leila Haddad' },
  { key: 'teranga', name: 'Épicerie Teranga', slug: 'epicerie-teranga', vendorType: 'grocery', specialtyFr: 'Épicerie sénégalaise', city: 'Montréal-Nord', neighborhood: 'Montréal-Nord', addressStreet: '10420 Boulevard Pie-IX', addressPostalCode: 'H1H 4A5', lat: 45.5983, lng: -73.6221, status: 'approved', categoryKeys: ['fruitsLegumes', 'cerealesLegumineuses'], ownerName: 'Mamadou Sow' },
  { key: 'medina', name: 'Souk El Medina', slug: 'souk-el-medina', vendorType: 'grocery', specialtyFr: 'Épicerie maghrébine · Épices', city: 'Laval', neighborhood: 'Chomedey', addressStreet: '1560 Boulevard Curé-Labelle', addressPostalCode: 'H7V 2W1', lat: 45.5613, lng: -73.7503, status: 'approved', categoryKeys: ['epicesCondiments', 'cerealesLegumineuses'], ownerName: 'Youssef El Amrani' },
  { key: 'kilimandjaro', name: 'Marché Kilimandjaro', slug: 'marche-kilimandjaro', vendorType: 'grocery', specialtyFr: 'Épicerie est-africaine', city: 'Laval', neighborhood: 'Chomedey', addressStreet: '3035 Boulevard Saint-Martin Ouest', addressPostalCode: 'H7T 1A1', lat: 45.5726, lng: -73.7621, status: 'approved', categoryKeys: ['fruitsLegumes', 'produitsLaitiers', 'boissons'], ownerName: 'Zawadi Mwangi' },
  { key: 'tanit', name: 'Café Tanit', slug: 'cafe-tanit', vendorType: 'restaurant', specialtyFr: 'Maghrébin · Petit-déjeuner', city: 'Longueuil', neighborhood: 'Villeray', addressStreet: '215 Rue Saint-Charles Ouest', addressPostalCode: 'J4H 1C6', lat: 45.5372, lng: -73.5104, status: 'approved', categoryKeys: ['platsPrepares', 'boissons'], ownerName: 'Nadia Bouazizi' },
  { key: 'adjoa', name: 'Chez Mama Adjoa', slug: 'chez-mama-adjoa', vendorType: 'restaurant', specialtyFr: 'Ouest-africain · Cuisine maison', city: 'Longueuil', neighborhood: 'Vieux-Longueuil', addressStreet: '1180 Chemin de Chambly', addressPostalCode: 'J4J 3W6', lat: 45.5289, lng: -73.4822, status: 'approved', categoryKeys: ['platsPrepares'], ownerName: 'Adjoa Mensah' },

  // ── the review queue ──────────────────────────────────────────────────────
  { key: 'kabylie', name: 'Marché de Kabylie', slug: 'marche-de-kabylie', vendorType: 'grocery', specialtyFr: 'Épicerie algérienne', city: 'Montréal', neighborhood: 'Saint-Michel', addressStreet: '7340 Boulevard Saint-Michel', addressPostalCode: 'H2A 2Z8', lat: 45.5673, lng: -73.6021, status: 'pending', categoryKeys: ['epicesCondiments', 'fruitsLegumes'], ownerName: 'Salima Ait Ahmed' },
  { key: 'abidjan', name: "Grillades d'Abidjan", slug: 'grillades-abidjan', vendorType: 'restaurant', specialtyFr: 'Ivoirien · Grillades', city: 'Montréal', neighborhood: 'Rosemont', addressStreet: '3410 Rue Masson', addressPostalCode: 'H1X 1S2', lat: 45.5537, lng: -73.5798, status: 'pending', categoryKeys: ['platsPrepares'], ownerName: 'Kouassi N’Guessan' },
  { key: 'nil', name: 'Épicerie du Nil', slug: 'epicerie-du-nil', vendorType: 'grocery', specialtyFr: 'Épicerie égyptienne', city: 'Laval', neighborhood: 'Sainte-Rose', addressStreet: '2250 Boulevard Sainte-Rose', addressPostalCode: 'H7L 1L5', lat: 45.6098, lng: -73.7812, status: 'pending', categoryKeys: ['cerealesLegumineuses', 'produitsLaitiers'], ownerName: 'Hoda Mansour' },
  { key: 'zanzibar', name: 'Épices de Zanzibar', slug: 'epices-de-zanzibar', vendorType: 'grocery', specialtyFr: 'Épices et thés', city: 'Montréal', neighborhood: 'Ahuntsic', addressStreet: '1425 Rue Fleury Est', addressPostalCode: 'H2C 1S1', lat: 45.5601, lng: -73.6598, status: 'suspended', statusReason: "Documents d'exploitation expirés — MAPAQ à renouveler.", categoryKeys: ['epicesCondiments', 'boissons'], ownerName: 'Rashid Juma' },
  { key: 'casbah', name: 'Traiteur Casbah', slug: 'traiteur-casbah', vendorType: 'restaurant', specialtyFr: 'Traiteur maghrébin', city: 'Montréal', neighborhood: 'LaSalle', addressStreet: '7580 Rue Centrale', addressPostalCode: 'H8P 1L1', lat: 45.4302, lng: -73.6178, status: 'rejected', statusReason: 'NEQ invalide et permis MAPAQ absent au dossier.', categoryKeys: ['platsPrepares'], ownerName: 'Farid Belkacem' },
];

export interface CourierFixture {
  key: string;
  fullName: string;
  phone: string;
  vehicle: VehicleType;
  plate?: string;
  licenceNumber?: string;
  city: string;
  lat: number;
  lng: number;
  status: CourierStatus;
  statusReason?: string;
  isOnline: boolean;
  /** Absent for a bike — `courier_insurance` is deliberately not required for one. */
  insurance?: { insurerName: string; policyNumber: string; expiry: string };
}

export const COURIERS: CourierFixture[] = [
  { key: 'moussa', fullName: 'Moussa Keïta', phone: '+15145550142', vehicle: 'car', plate: 'H72 KLM', licenceNumber: 'K1234-567890-01', city: 'Montréal', lat: 45.5289, lng: -73.6103, status: 'approved', isOnline: true, insurance: { insurerName: 'Intact Assurance', policyNumber: 'INT-4471902', expiry: '07/2027' } },
  { key: 'fatou', fullName: 'Fatou Ndiaye', phone: '+15145550187', vehicle: 'scooter', plate: 'V88 3QT', licenceNumber: 'N4567-891234-02', city: 'Montréal', lat: 45.5401, lng: -73.6178, status: 'approved', isOnline: true, insurance: { insurerName: 'Desjardins Assurances', policyNumber: 'DSJ-8820347', expiry: '03/2027' } },
  { key: 'hakim', fullName: 'Hakim Bouzid', phone: '+15145550231', vehicle: 'bike', city: 'Montréal', lat: 45.5348, lng: -73.6294, status: 'approved', isOnline: false },
  { key: 'aissatou', fullName: 'Aïssatou Barry', phone: '+15145550298', vehicle: 'car', plate: 'R41 88Z', licenceNumber: 'B7788-112233-03', city: 'Laval', lat: 45.5613, lng: -73.7503, status: 'approved', isOnline: true, insurance: { insurerName: 'Belairdirect', policyNumber: 'BEL-2298471', expiry: '11/2026' } },
  { key: 'samuel', fullName: 'Samuel Okonkwo', phone: '+15145550312', vehicle: 'scooter', plate: 'T20 6PP', licenceNumber: 'O2211-334455-04', city: 'Montréal', lat: 45.6072, lng: -73.6294, status: 'approved', isOnline: false, insurance: { insurerName: 'La Capitale', policyNumber: 'CAP-5540118', expiry: '09/2027' } },
  { key: 'yasmine', fullName: 'Yasmine Cherif', phone: '+15145550376', vehicle: 'bike', city: 'Montréal', lat: 45.5372, lng: -73.5904, status: 'approved', isOnline: true },
  { key: 'daniel', fullName: 'Daniel Mbeki', phone: '+15145550401', vehicle: 'car', plate: 'W09 4LC', licenceNumber: 'M9900-556677-05', city: 'Longueuil', lat: 45.5289, lng: -73.4822, status: 'approved', isOnline: false, insurance: { insurerName: 'Intact Assurance', policyNumber: 'INT-6612093', expiry: '05/2027' } },
  { key: 'rokia', fullName: 'Rokia Sangaré', phone: '+15145550455', vehicle: 'scooter', plate: 'B55 2XN', licenceNumber: 'S3344-778899-06', city: 'Laval', lat: 45.5726, lng: -73.7621, status: 'approved', isOnline: true, insurance: { insurerName: 'Desjardins Assurances', policyNumber: 'DSJ-1170582', expiry: '01/2027' } },

  // ── the review queue ──────────────────────────────────────────────────────
  { key: 'jonas', fullName: 'Jonas Kamdem', phone: '+15145550510', vehicle: 'car', plate: 'C33 7RD', licenceNumber: 'K5566-990011-07', city: 'Montréal', lat: 45.5537, lng: -73.5798, status: 'pending', isOnline: false, insurance: { insurerName: 'Belairdirect', policyNumber: 'BEL-7734021', expiry: '12/2026' } },
  { key: 'nour', fullName: 'Nour Benslimane', phone: '+15145550566', vehicle: 'bike', city: 'Montréal', lat: 45.5601, lng: -73.6598, status: 'pending', isOnline: false },
  { key: 'thierry', fullName: 'Thierry Abega', phone: '+15145550623', vehicle: 'scooter', plate: 'G18 9MK', licenceNumber: 'A1122-334455-08', city: 'Montréal', lat: 45.4952, lng: -73.6284, status: 'suspended', statusReason: "Attestation d'assurance échue depuis plus de 30 jours.", isOnline: false },
];

export interface CustomerFixture {
  key: string;
  fullName: string;
  /** Where their default delivery address sits, so orders land somewhere plausible. */
  address: { label: string; street: string; city: string; postalCode: string; lat: number; lng: number };
}

export const CUSTOMERS: CustomerFixture[] = [
  { key: 'amina', fullName: 'Amina Sylla', address: { label: 'Domicile', street: '4820 Avenue Van Horne', city: 'Montréal', postalCode: 'H3W 1J2', lat: 45.5012, lng: -73.6392 } },
  { key: 'omar', fullName: 'Omar Tazi', address: { label: 'Domicile', street: '1290 Rue Jarry Est', city: 'Montréal', postalCode: 'H2E 1A5', lat: 45.5498, lng: -73.6201 } },
  { key: 'clarisse', fullName: 'Clarisse Nkurunziza', address: { label: 'Domicile', street: '2145 Rue Beaubien Est', city: 'Montréal', postalCode: 'H2G 1M8', lat: 45.5421, lng: -73.5891 } },
  { key: 'youssef', fullName: 'Youssef Lahlou', address: { label: 'Travail', street: '505 Boulevard de Maisonneuve Ouest', city: 'Montréal', postalCode: 'H3A 3C2', lat: 45.5045, lng: -73.5723 } },
  { key: 'grace', fullName: 'Grace Adeyemi', address: { label: 'Domicile', street: '7712 Rue Saint-Denis', city: 'Montréal', postalCode: 'H2R 2E9', lat: 45.5389, lng: -73.6144 } },
  { key: 'ismael', fullName: 'Ismaël Doumbia', address: { label: 'Domicile', street: '3390 Rue Ontario Est', city: 'Montréal', postalCode: 'H1W 1P9', lat: 45.5426, lng: -73.5442 } },
  { key: 'sofia', fullName: 'Sofia Marchetti', address: { label: 'Domicile', street: '1875 Boulevard Saint-Laurent', city: 'Montréal', postalCode: 'H2X 2T3', lat: 45.5142, lng: -73.5711 } },
  { key: 'abdoul', fullName: 'Abdoul Karim Sy', address: { label: 'Domicile', street: '9240 Boulevard Pie-IX', city: 'Montréal', postalCode: 'H1Z 3V4', lat: 45.5867, lng: -73.6182 } },
  { key: 'nadege', fullName: 'Nadège Kouame', address: { label: 'Domicile', street: '620 Rue Notre-Dame', city: 'Laval', postalCode: 'H7V 1B3', lat: 45.5589, lng: -73.7412 } },
  { key: 'reda', fullName: 'Reda Amrani', address: { label: 'Domicile', street: '155 Rue Saint-Jean', city: 'Longueuil', postalCode: 'J4H 2W9', lat: 45.5341, lng: -73.5178 } },
  { key: 'esther', fullName: 'Esther Bakayoko', address: { label: 'Domicile', street: '4455 Rue Wellington', city: 'Montréal', postalCode: 'H4G 1W6', lat: 45.4712, lng: -73.5698 } },
  { key: 'malik', fullName: 'Malik Ouedraogo', address: { label: 'Domicile', street: '2280 Rue Sherbrooke Est', city: 'Montréal', postalCode: 'H2K 1E4', lat: 45.5301, lng: -73.5589 } },
  { key: 'leila', fullName: 'Leila Mansouri', address: { label: 'Domicile', street: '8120 Boulevard Lacordaire', city: 'Montréal', postalCode: 'H1R 2Y5', lat: 45.5893, lng: -73.6012 } },
  { key: 'patrick', fullName: 'Patrick Mugisha', address: { label: 'Domicile', street: '1040 Rue Bélanger', city: 'Montréal', postalCode: 'H2S 1G8', lat: 45.5382, lng: -73.6089 } },
  { key: 'safia', fullName: 'Safia Toure', address: { label: 'Domicile', street: '3300 Chemin de la Côte-Sainte-Catherine', city: 'Montréal', postalCode: 'H3T 1C5', lat: 45.4978, lng: -73.6221 } },
];

export interface ItemFixture {
  name: string;
  /** Integer cents — never a float. See `cents()` in rng.ts. */
  priceCents: number;
  categoryKey: keyof typeof CATEGORY_IDS;
  sectionName: string;
}

/** The 15-item bank `admin/lib/api/seed.ts` draws order lines from. */
export const ITEM_BANK: ItemFixture[] = [
  { name: 'Riz brisé parfumé 5 kg', priceCents: 1899, categoryKey: 'cerealesLegumineuses', sectionName: 'Riz et céréales' },
  { name: 'Attiéké frais 1 kg', priceCents: 799, categoryKey: 'cerealesLegumineuses', sectionName: 'Riz et céréales' },
  { name: 'Huile de palme rouge 1 L', priceCents: 1249, categoryKey: 'epicesCondiments', sectionName: 'Épices et condiments' },
  { name: 'Pâte d’arachide 500 g', priceCents: 649, categoryKey: 'epicesCondiments', sectionName: 'Épices et condiments' },
  { name: 'Cube Maggi (paquet de 60)', priceCents: 899, categoryKey: 'epicesCondiments', sectionName: 'Épices et condiments' },
  { name: 'Ras el hanout 100 g', priceCents: 549, categoryKey: 'epicesCondiments', sectionName: 'Épices et condiments' },
  { name: 'Épaule d’agneau halal 1 kg', priceCents: 2299, categoryKey: 'viandeHalal', sectionName: 'Boucherie' },
  { name: 'Poulet fermier halal entier', priceCents: 1749, categoryKey: 'viandeHalal', sectionName: 'Boucherie' },
  { name: 'Tilapia entier surgelé 1 kg', priceCents: 1399, categoryKey: 'viandeHalal', sectionName: 'Boucherie' },
  { name: 'Igname fraîche 2 kg', priceCents: 999, categoryKey: 'fruitsLegumes', sectionName: 'Fruits et légumes' },
  { name: 'Gombo frais 500 g', priceCents: 599, categoryKey: 'fruitsLegumes', sectionName: 'Fruits et légumes' },
  { name: 'Bissap séché 200 g', priceCents: 749, categoryKey: 'boissons', sectionName: 'Boissons' },
  { name: 'Thé à la menthe Maghreb 250 g', priceCents: 899, categoryKey: 'boissons', sectionName: 'Boissons' },
  { name: 'Msemen (paquet de 6)', priceCents: 699, categoryKey: 'painsPatisseries', sectionName: 'Boulangerie' },
  { name: 'Yaourt nature 1 L', priceCents: 549, categoryKey: 'produitsLaitiers', sectionName: 'Produits laitiers' },
];

/**
 * The photo for each item, by name — a file in the app's
 * `assets/images/catalog/` (credits in `assets/images/CREDITS.md`).
 *
 * The app bundled these long before the database existed, keyed by the mock's
 * own ids (`prd_riz_brise`), which match nothing here — so every product
 * rendered as a placeholder icon. `npm run db:seed:images` uploads each one into
 * its shop's `product-media` folder and writes the path onto the row.
 *
 * Two are near matches rather than exact: the shoulder uses the leg-of-lamb
 * photo, and attiéké the attiéké-and-fish plate.
 */
export const ITEM_IMAGES: Record<string, string> = {
  'Riz brisé parfumé 5 kg': 'prd_riz_brise',
  'Attiéké frais 1 kg': 'prd_attieke_poisson',
  'Huile de palme rouge 1 L': 'prd_huile_palme',
  'Pâte d’arachide 500 g': 'prd_pate_arachide',
  'Cube Maggi (paquet de 60)': 'prd_cube_bouillon',
  'Ras el hanout 100 g': 'prd_ras_el_hanout',
  'Épaule d’agneau halal 1 kg': 'prd_gigot_agneau',
  'Poulet fermier halal entier': 'prd_poulet_fermier',
  'Tilapia entier surgelé 1 kg': 'prd_tilapia_entier',
  'Igname fraîche 2 kg': 'prd_igname',
  'Gombo frais 500 g': 'prd_gombo_frais',
  'Bissap séché 200 g': 'prd_bissap_sec',
  'Thé à la menthe Maghreb 250 g': 'prd_the_menthe',
  'Msemen (paquet de 6)': 'prd_msemen',
  'Yaourt nature 1 L': 'prd_yaourt_maison',
};

/**
 * Each shop's cover (also its logo), by fixture key. The five shops the mobile
 * seed never had borrow a product photo that says what they sell.
 */
export const VENDOR_IMAGES: Record<string, string> = {
  bamako: 'vnd_marche_bamako',
  atlas: 'vnd_epicerie_atlas',
  sahel: 'vnd_boucherie_sahel',
  dakar: 'vnd_saveurs_dakar',
  maghreb: 'vnd_douceurs_maghreb',
  teranga: 'vnd_teranga',
  medina: 'vnd_souk_medina',
  kilimandjaro: 'vnd_kilimandjaro',
  tanit: 'vnd_boulangerie_tanit',
  adjoa: 'vnd_mama_adjoa',
  kabylie: 'prd_olives_beldi',
  abidjan: 'prd_brochettes_poulet',
  nil: 'prd_dattes_deglet',
  zanzibar: 'prd_safran',
  casbah: 'prd_tajine_agneau',
};

/** Deduplicated aisle names, in a stable order — every product must sit in one. */
export const SECTION_NAMES = [...new Set(ITEM_BANK.map((i) => i.sectionName))];

export const DISPUTE_REASONS = ['missing_items', 'wrong_order', 'quality', 'late', 'other'] as const;

export const DISPUTE_MESSAGES: Record<(typeof DISPUTE_REASONS)[number], string> = {
  missing_items: 'Il manquait deux articles dans le sac, mais ils apparaissent sur la facture.',
  wrong_order: "J'ai reçu la commande de quelqu'un d'autre — rien ne correspond à ma liste.",
  quality: 'Les légumes étaient abîmés et la viande n’était plus froide à la livraison.',
  late: 'La commande est arrivée avec plus de deux heures de retard, tout était froid.',
  other: 'Le montant débité ne correspond pas au total affiché à la commande.',
};

export const COURIER_ISSUE_REASONS = [
  'customer_absent',
  'wrong_address',
  'access_problem',
  'shop_not_ready',
  'order_incomplete',
  'other',
] as const;

export const COURIER_ISSUE_MESSAGES: Record<(typeof COURIER_ISSUE_REASONS)[number], string> = {
  customer_absent: 'Personne ne répond à la porte ni au téléphone depuis 10 minutes.',
  wrong_address: "L'adresse indiquée n'existe pas, le numéro civique s'arrête avant.",
  access_problem: 'Immeuble fermé, interphone hors service, impossible d’entrer.',
  shop_not_ready: 'La commande n’était pas prête à mon arrivée, 25 minutes d’attente.',
  order_incomplete: 'Le commerçant m’a remis un sac de moins que ce qui est indiqué.',
  other: 'Route bloquée par des travaux, obligé de faire un long détour.',
};
