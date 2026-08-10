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

export interface Vendor {
  id: ID;
  slug: string;
  name: string;
  logoUrl: string;
  coverUrl: string;
  categoryIds: ID[];
  city: string;
  neighborhood: string;
  address: Address;
  rating: number;
  reviewCount: number;
  deliveryEtaMin: number;
  deliveryFeeCad: number;
  isHalalCertified: boolean;
  hours: VendorHours[];
  ownerId: ID;
}

export interface Product {
  id: ID;
  vendorId: ID;
  categoryId: ID;
  name: string;
  description: string;
  priceCad: number;
  compareAtPriceCad?: number;
  imageUrl: string;
  nutrition: NutritionInfo;
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
  deliveryFeeCad: number;
  totalCad: number;
  deliveryAddress: Address;
  createdAt: string;
  statusHistory: OrderStatusEvent[];
}

export type UserRole = 'customer' | 'business';

export interface User {
  id: ID;
  fullName: string;
  email: string;
  avatarUrl?: string;
  /** ISO date the account was created. Absent on accounts predating the field. */
  memberSince?: string;
  role: UserRole | null;
  vendorId?: ID;
  favoriteProductIds: ID[];
  favoriteVendorIds: ID[];
  addresses: Address[];
}
