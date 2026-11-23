export type ID = string;

/** The languages the app ships. Declared here because `data/` must not import from `lib/`. */
export type Locale = 'fr' | 'en';

/**
 * A string owned by a back-office or by a merchant, in the languages it has
 * actually been written in.
 *
 * `fr` is required rather than optional because it *is* the fallback; a type
 * that let it be missing would push a `?? '—'` into every read site. A third
 * language is one more union member, not a schema migration — which is why this
 * is a record and not an `nameEn` sitting beside an `nameFr`.
 *
 * Merchant-authored text arrives as `{ fr: 'Épicerie maghrébine' }` and stays
 * that way: the app cannot translate what a shopkeeper typed, and a field shaped
 * to pretend otherwise would be a lie with better types. Read it through
 * `localized()` / `useLocalized()` in `lib/localized.ts`.
 *
 * Note this is deliberately *not* how the closed sets work. `Vertical` and the
 * order-status vocabulary are code, so their words live in the message
 * catalogue; these are rows in a table someone will edit, so a catalogue key
 * would render literally on screen the day a new row appears.
 */
export type LocalizedText = { fr: string } & Partial<Record<Locale, string>>;

export interface NutritionInfo {
  calories: number;
  proteinG: number;
  fatG: number;
  weightG: number;
}

export interface Category {
  id: ID;
  slug: string;
  name: LocalizedText;
  /** Compact one-word label for tight spaces (category circles, chips). */
  shortName: LocalizedText;
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
  /** How to reach the door, reused on every order to this address. */
  unit?: string | null;
  doorCode?: string | null;
  deliveryNotes?: string | null;
  dropoff?: DropoffOption;
}

/** `hand`: given to the shopper in person. `door`: left at the door, proved with a photo. */
export type DropoffOption = 'hand' | 'door';

/**
 * How to reach the door, copied onto the order at checkout. `doorCode` is only
 * sent to the shopper and to the courier carrying the run — never the shop.
 */
export interface DeliveryInstructions {
  unit: string | null;
  doorCode?: string | null;
  notes: string | null;
  dropoff: DropoffOption;
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
  /** The merchant's own heading — single-language in practice. See `LocalizedText`. */
  name: LocalizedText;
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
  specialty: LocalizedText;
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
  /**
   * Set when the Sougouba team hid the product: shoppers no longer see it.
   * Only present on the merchant's own reads — a shopper never receives one.
   */
  hiddenByAdmin?: { at: string; reason: string | null };
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
  /** `resolved` is an administrator's decision in the back office, with or without a shop reply. */
  status: 'open' | 'answered' | 'resolved';
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
  /** The shop's name, joined by the API — so an order list needs no separate shop lookup. */
  vendorName?: string | null;
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
  /**
   * Points spent at checkout and what they were worth, snapshot the same way
   * `deliveryFeeCad` is: the rules in `data/loyalty.ts` can change tomorrow,
   * but a receipt must still say what was actually redeemed. Both absent on an
   * order that redeemed nothing — not zeroed, so a list can tell "redeemed
   * none" from "redemption didn't exist yet" if that ever matters.
   */
  pointsRedeemed?: number;
  pointsDiscountCad?: number;
  /** The promo code applied at checkout and what it took off — null on an order that used none. */
  couponCode?: string | null;
  couponDiscountCad?: number | null;
  totalCad: number;
  deliveryAddress: Address;
  /** Absent on an order read from before the field existed. */
  deliveryInstructions?: DeliveryInstructions;
  createdAt: string;
  statusHistory: OrderStatusEvent[];
  /** Absent unless the shopper reported a problem. */
  dispute?: OrderDispute;
  /** Absent until a courier accepts the run. */
  delivery?: OrderDelivery;
  /** Absent unless the courier flagged a problem on the road. */
  courierIssue?: CourierIssue;
  /** Absent until the shopper rates the order. Null-ish for a courier, who is never shown it. */
  review?: OrderReview | null;
}

/**
 * What the shopper thought, once the order arrived. One per order and never
 * edited. `courierRating` is only present in the shopper's own view — a shop
 * sees its mark and the comment, not what was said about the courier.
 */
export interface OrderReview {
  vendorRating: number;
  courierRating?: number | null;
  comment: string | null;
  createdAt: string;
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
  /** Local file URI for a photo; absent for a PIN or a signature. */
  imageUri?: string;
  /** The photo's type as the camera reported it — what the upload is signed for. */
  imageMimeType?: string;
  /** The drawn strokes, with the pad's size, for a signature. */
  signature?: { width: number; height: number; paths: string[] };
  /** The four digits the shopper read out — sent to the server to check, never compared on the phone. */
  pin?: string;
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
  /**
   * Four digits the shopper reads out, checked by the server. Only in the
   * shopper's view — and a courier's on their own demonstration run.
   */
  pin?: string;
  proof?: DeliveryProof;
  /**
   * Who is carrying it — sent to the shopper and the shop only, since neither
   * can read another person's courier file. Absent on the courier's own view.
   */
  courier?: Pick<Courier, 'id' | 'fullName' | 'photoUrl' | 'phone' | 'vehicle' | 'plate' | 'rating' | 'deliveryCount'>;
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
  /**
   * Id of the customer whose referral code was entered at sign-up. Set once,
   * at account creation, and never rewritten — see `data/loyalty.ts` for what
   * it takes to turn this into a reward.
   */
  referredBy?: ID;
}

/**
 * Why a Points Sougouba balance moved (client brief, août 2026, "Portefeuille
 * Points Sougouba"). `order_refunded` exists for a reversal path nothing in
 * the app can trigger yet — see `reverseForOrder` in `data/api/loyalty.ts`.
 */
export type LoyaltyReason =
  | 'order_delivered'
  | 'referral_referrer'
  | 'referral_referred'
  | 'redeemed'
  | 'order_refunded';

/**
 * One line of a shopper's points ledger. `points` is signed — positive for an
 * earn, negative for a redemption or a reversal — so the balance is always
 * just a sum, the same way `Order.totalCad` is a sum of signed lines rather
 * than a value tracked separately from what produced it.
 */
export interface LoyaltyTransaction {
  id: ID;
  customerId: ID;
  points: number;
  reason: LoyaltyReason;
  /** Absent for a manual adjustment — every earn, redemption and referral traces back to one. */
  orderId?: ID;
  createdAt: string;
  /** Only an earn expires. Absent means the points never age out — a redemption's -100 has no shelf life. */
  expiresAt?: string;
}

/**
 * A promo code a merchant created for their own shop.
 *
 * The merchant funds it: the discount comes off the product subtotal the shop
 * is paid from. `active` is computed by the API from the window and the usage
 * limit, so a list never has to re-derive "would this work right now".
 */
export interface Coupon {
  id: ID;
  code: string;
  discountType: 'percentage' | 'fixed';
  /** A percent (15 → 15 %) or an amount in CAD, depending on `discountType`. */
  discountValue: number;
  usageLimit: number | null;
  usedCount: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  active: boolean;
}
