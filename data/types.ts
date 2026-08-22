export type ID = string;

export interface NutritionInfo {
  calories: number;
  proteinG: number;
  fatG: number;
  weightG: number;
}

export interface Category {
  id: ID;
  slug: string;
  nameFr: string;
  /** Compact one-word label for tight spaces (category circles, chips). */
  shortNameFr: string;
  icon: string;
  colorToken: string;
}

/**
 * A point on the map.
 *
 * Lives here rather than in `lib/geo.ts` — where it started — because `data/`
 * must not import from `lib/` (same reason `data/taxes.ts` sits where it does),
 * and couriers, vendors and addresses all traffic in coordinates. `lib/geo.ts`
 * re-exports it, so every existing import still resolves.
 */
export interface LatLng {
  lat: number;
  lng: number;
}

export interface Address {
  id: ID;
  label: string;
  street: string;
  city: string;
  postalCode: string;
  lat: number;
  lng: number;
  isDefault: boolean;
}

export interface VendorHours {
  day: number; // 0 = Sunday
  open: string; // "09:00"
  close: string; // "21:00"
  closed?: boolean;
}

/**
 * The two verticals the catalogue is organised around (CDC addendum v1.1, §01).
 * Boulangerie was withdrawn from the v1 scope; the two shops that traded as one
 * now trade as the cafés and pâtisseries they always were.
 */
export type VendorType = 'grocery' | 'restaurant';

/**
 * One shelf, or one course, as the merchant names it.
 *
 * Deliberately not a `Category`: the global category table is a platform
 * taxonomy that search filters across every shop at once, while these are the
 * merchant's own headings on their own page — "Entrées / Plats / Desserts" for a
 * restaurant, "Fruits / Épices / Conserves" for a grocery, worded by whoever
 * runs the shop (CDC addendum v1.1, §01). Ordered as the merchant lists them.
 */
export interface VendorSection {
  id: ID;
  nameFr: string;
}

/**
 * Where a shop sits with the platform.
 *
 * Same three positions a courier's file has, and for the same reason: the CDC
 * puts a human between "someone registered" and "the shop is on the platform"
 * (addendum v1.1, §02). `suspended` is modelled but unreachable from the app —
 * only the back-office is entitled to take a shop offline.
 */
export type VendorStatus = 'pending' | 'approved' | 'suspended';

/**
 * The paperwork behind a shop, as submitted.
 *
 * The CDC calls for a piece of ID for the person responsible, a business number,
 * and — for restaurants — a valid MAPAQ permit, while noting the list is
 * indicative until the client confirms it. What is modelled here is that shape;
 * the app captures the references, and an administrator reads the documents
 * themselves out of band.
 */
export interface ShopRegistration {
  /** Numéro d'entreprise du Québec, as the registraire prints it. */
  neq: string;
  contactName: string;
  contactPhone: string;
  /** Permis de restauration MAPAQ. Restaurants only. */
  mapaqNumber?: string;
  submittedAt: string;
}

export interface Vendor {
  id: ID;
  slug: string;
  name: string;
  vendorType: VendorType;
  /**
   * The single line under the shop name in a listing: cuisine for a restaurant,
   * trade for a grocery. The CDC calls for a "type de cuisine" on the shop list,
   * and a grocery needs the same slot filled with something true of a grocery.
   */
  specialtyFr: string;
  logoUrl: string;
  coverUrl: string;
  categoryIds: ID[];
  city: string;
  neighborhood: string;
  address: Address;
  rating: number;
  reviewCount: number;
  deliveryEtaMin: number;
  isHalalCertified: boolean;
  hours: VendorHours[];
  /** The shop's own headings, in the order it wants them read. */
  sections: VendorSection[];
  ownerId: ID;
  status: VendorStatus;
  /** Absent on shops that predate in-app registration — every seeded shop. */
  registration?: ShopRegistration;
}

export interface Product {
  id: ID;
  vendorId: ID;
  /** Platform taxonomy — what search and the home grid filter on. */
  categoryId: ID;
  /** Which of its own shop's `sections` this sits under. */
  sectionId: ID;
  name: string;
  description: string;
  priceCad: number;
  compareAtPriceCad?: number;
  imageUrl: string;
  /**
   * Optional (client, août 2026): a merchant opts in with a checkbox on the
   * product form. Absent means "not declared" — `NutritionRow` is not rendered
   * at all rather than drawn with holes in it.
   */
  nutrition?: NutritionInfo;
  stockQty: number;
  isAvailable: boolean;
  tags: string[];
}

export interface CartItem {
  productId: ID;
  vendorId: ID;
  qty: number;
  unitPriceCad: number;
}

export interface Cart {
  vendorId: ID | null;
  items: CartItem[];
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

/**
 * Why a shopper opened a dispute (CDC addendum v1.1, §04).
 *
 * A fixed list rather than free text alone: the back-office that will eventually
 * triage these needs to sort them, and "the tomatoes were mouldy" and "il
 * manquait le riz" are the same complaint typed two ways.
 */
export type DisputeReason = 'missing_items' | 'wrong_order' | 'quality' | 'late' | 'other';

/**
 * A dispute raised on a delivered or cancelled order.
 *
 * Two states, not three. The CDC puts *resolution* in the platform back-office —
 * an administrator arbitrating between the parties — which does not exist yet,
 * so the app models only what it can honestly do: the shopper reports, the
 * merchant answers. Nothing here marks a dispute settled, because nothing in the
 * app is entitled to.
 */
export interface OrderDispute {
  reason: DisputeReason;
  message: string;
  openedAt: string;
  status: 'open' | 'answered';
  merchantReply?: string;
  answeredAt?: string;
}

/**
 * Why a courier flagged a run.
 *
 * A separate list from `DisputeReason`, not a superset of it. A shopper reports
 * what was in the bag; a courier reports what stopped them delivering it, and
 * the two only look similar from far away. Ordered by how often each actually
 * happens, with the escape hatch last.
 */
export type CourierIssueReason =
  | 'customer_absent'
  | 'wrong_address'
  | 'access_problem'
  | 'shop_not_ready'
  | 'order_incomplete'
  | 'other';

/**
 * A problem raised by the courier, addressed to the platform.
 *
 * Deliberately not an `OrderDispute`: that one is a conversation between shopper
 * and merchant and carries a `merchantReply`, which is the wrong shape here.
 * A courier's report goes to whoever arbitrates between the three parties
 * (CDC addendum v1.1, §04) and there is no back-office yet to answer it — so it
 * records what happened and stops there, rather than promising a reply the app
 * cannot deliver.
 *
 * It does not change the order's status. A courier who cannot find the door
 * still has the food, and the run is not over until someone says where it went.
 */
export interface CourierIssue {
  reason: CourierIssueReason;
  message: string;
  at: string;
}

export interface OrderItem {
  productId: ID;
  name: string;
  qty: number;
  unitPriceCad: number;
}

export interface OrderStatusEvent {
  status: OrderStatus;
  at: string;
}

export interface Order {
  id: ID;
  customerId: ID;
  /**
   * Display name captured when the order was placed, for the shop-side queue.
   * Seeded orders leave it unset and resolve through `lib/customerNames.ts`;
   * accounts created in-app are not in that table, so they carry it here.
   */
  customerName?: string;
  vendorId: ID;
  items: OrderItem[];
  status: OrderStatus;
  subtotalCad: number;
  /** TPS and TVQ, charged on `subtotalCad` alone — never on the delivery fee. See `data/taxes.ts`. */
  gstCad: number;
  qstCad: number;
  /**
   * What delivery actually cost this shopper, snapshot at checkout.
   *
   * Derived from the distance through `data/deliveryPricing.ts` rather than read
   * off the shop — but stored, not recomputed on read: the grid can be
   * re-priced tomorrow and a receipt must still say what was charged.
   */
  deliveryFeeCad: number;
  totalCad: number;
  deliveryAddress: Address;
  createdAt: string;
  statusHistory: OrderStatusEvent[];
  /** Absent unless the shopper reported a problem. */
  dispute?: OrderDispute;
  /** Absent until a courier accepts the run. */
  delivery?: OrderDelivery;
  /** Absent unless the courier flagged a problem on the road. */
  courierIssue?: CourierIssue;
}

/** How a livreur gets around. Sets the speed the delivery simulation runs at. */
export type VehicleType = 'bike' | 'scooter' | 'car';

/**
 * Three states, mirroring what a merchant account goes through. `suspended` is
 * modelled but not reachable from the app: only the platform back-office
 * (CDC addendum v1.1, §04) is entitled to take someone off the road.
 */
export type CourierStatus = 'pending' | 'approved' | 'suspended';

/**
 * A livreur's file — the thing an administrator approves.
 *
 * Separate from `User` for the same reason `Vendor` is: the account is who signs
 * in, the file is what the platform vets, and an order references the file. A
 * courier who changes their email is still the courier on yesterday's delivery.
 */
/**
 * The papers behind a motorised courier.
 *
 * Absent on a bike, and absent on the eight seeded couriers — they predate
 * in-app registration, the same way `Vendor.registration` does. An
 * administrator reads the documents themselves out of band; what the app holds
 * is the references.
 */
export interface CourierInsurance {
  insurerName: string;
  policyNumber: string;
  /** MM/AAAA, as an insurer prints it. */
  expiry: string;
}

/** Where a courier is paid. `bankId` indexes `data/banks.ts`. */
export interface CourierPayout {
  bankId: string;
  /** Only when `bankId` is `other` — the name the courier typed. */
  bankNameOther?: string;
  transit: string;
  account: string;
}

export interface Courier {
  id: ID;
  /** The account this file belongs to. */
  userId: ID;
  fullName: string;
  photoUrl?: string;
  phone: string;
  vehicle: VehicleType;
  /** Absent for a bike. */
  plate?: string;
  /** Absent for a bike. */
  licenceNumber?: string;
  /** Absent for a bike. Required of moto and voiture at registration. */
  insurance?: CourierInsurance;
  /**
   * Absent on the seeded couriers. Collected at registration and, until this
   * was fixed, thrown away between the form and the API — the payout step
   * validated a bank account nothing ever stored.
   */
  payout?: CourierPayout;
  city: string;
  postalCode?: string;
  /** Where a courier sits while online and idle — the origin every offer is ranked from. */
  base: LatLng;
  rating: number;
  deliveryCount: number;
  status: CourierStatus;
  joinedAt: string;
}

/** How the courier proved the order arrived. */
export type ProofMethod = 'photo' | 'signature' | 'pin';

export interface DeliveryProof {
  method: ProofMethod;
  /** Local file URI for a photo or a captured signature; absent for a PIN. */
  imageUri?: string;
  note?: string;
  at: string;
}

/**
 * The delivery leg of an order, once a courier has accepted it.
 *
 * Written onto the order rather than kept in a table of its own — the same call
 * `Order.dispute` makes, and for the same reason: a delivery has no life
 * independent of the order it delivers, and every screen that shows one already
 * holds the order.
 *
 * Note what is *not* here: the courier's current position. That is derived at
 * read time from `acceptedAt` / `pickedUpAt` against a route regenerated from
 * the order id (`lib/courierRoute.ts`), so a remount, a backgrounded app or a
 * cold start all land on the same point. Storing a moving coordinate would mean
 * the position only advances while some screen happens to be mounted.
 */
export interface OrderDelivery {
  courierId: ID;
  /** When the courier accepted — the clock the whole simulation runs against. */
  acceptedAt: string;
  /** Set when the courier confirms pickup at the shop (`ready` -> `out_for_delivery`). */
  pickedUpAt?: string;
  deliveredAt?: string;
  /** Leg durations, frozen at acceptance so the ETA does not drift between renders. */
  pickupEtaMin: number;
  dropoffEtaMin: number;
  /** Shop -> shopper, in kilometres. What the courier is paid on. */
  distanceKm: number;
  /** Four digits the shopper reads out. Derived from the order id, so it is stable. */
  pin: string;
  proof?: DeliveryProof;
  tipCad: number;
  /** The courier's take for this run. See `lib/courierPay.ts`. */
  earningsCad: number;
}

/**
 * The three sides of the platform. `courier` is the livreur (CDC addendum v1.1,
 * §04, which already counts them among the parties a dispute can involve).
 *
 * Adding to this union is deliberately load-bearing: `homeRouteForRole` in
 * `lib/routes.ts` maps it exhaustively, so a fourth role fails to compile until
 * it has somewhere to land.
 */
export type UserRole = 'customer' | 'business' | 'courier';

export interface User {
  id: ID;
  fullName: string;
  email: string;
  avatarUrl?: string;
  /** ISO date the account was created. Absent on accounts predating the field. */
  memberSince?: string;
  role: UserRole | null;
  /** Set once an administrator links a shop to a merchant account. */
  vendorId?: ID;
  /** Set once an administrator approves a courier's file. Mirror of `vendorId`. */
  courierId?: ID;
  favoriteProductIds: ID[];
  favoriteVendorIds: ID[];
  addresses: Address[];
}
