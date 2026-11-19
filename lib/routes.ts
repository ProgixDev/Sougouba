import type { UserRole } from '@/data/types';

/**
 * Every navigable path in one place.
 *
 * Each route group deliberately avoids an `index` file: with four groups all
 * exposing `/`, Expo Router disambiguated the bare path using whichever
 * segments you happened to be on, so a guard redirecting to `/` from inside a
 * tab group resolved right back into that same group and looped. Named leaves
 * (`/welcome`, `/home`, `/dashboard`) keep every path unambiguous.
 */
export const routes = {
  splash: '/',
  onboarding: '/onboarding',
  authWelcome: '/(auth)/welcome',
  roleSelect: '/role-select',
  customerHome: '/(customer)/(tabs)/home',
  customerSearch: '/(customer)/(tabs)/search',
  customerCart: '/(customer)/(tabs)/cart',
  customerOrders: '/(customer)/(tabs)/orders',
  customerProfile: '/(customer)/(tabs)/profile',
  checkout: '/(customer)/checkout',
  favorites: '/(customer)/favorites',
  // Account sub-screens live under `account/`, not `profile/`: the profile tab
  // already owns `/profile`, and a sibling directory of the same name is one
  // more chance for Expo Router to resolve the wrong leaf.
  accountEdit: '/(customer)/account/edit',
  accountAddresses: '/(customer)/account/addresses',
  accountNotifications: '/(customer)/account/notifications',
  accountAbout: '/(customer)/account/about',
  accountPoints: '/(customer)/account/points',
  accountRefer: '/(customer)/account/refer',
  accountSupport: '/(customer)/account/support',
  businessDashboard: '/(business)/(tabs)/dashboard',
  businessCatalog: '/(business)/(tabs)/catalog',
  businessOrders: '/(business)/(tabs)/orders',
  businessAnalytics: '/(business)/(tabs)/analytics',
  businessProfile: '/(business)/(tabs)/profile',
  businessProductNew: '/(business)/product/new',
  /** The merchant's own promo codes: the list and the form that adds to it. */
  businessCoupons: '/(business)/coupons',
  businessSignup: '/(business)/signup',
  /** Post-registration confirmation — separate so the form can't be back-navigated into. */
  businessSignupConfirmed: '/(business)/signup-confirmed',
  courierMissions: '/(courier)/(tabs)/missions',
  courierHistory: '/(courier)/(tabs)/history',
  courierEarnings: '/(courier)/(tabs)/earnings',
  courierProfile: '/(courier)/(tabs)/profile',
  courierSignup: '/(courier)/signup',
  /** Twin of `businessSignupConfirmed`, for the same reason. */
  courierSignupConfirmed: '/(courier)/signup-confirmed',
} as const;

/**
 * Dynamic routes are pushed in object form (`router.push({ pathname, params })`)
 * rather than as an interpolated string — typed routes then check the param
 * names for you, and there is no chance of an unescaped id breaking the path.
 */
export const dynamicRoutes = {
  /** Level 1 of the browse: every shop in one vertical (épicerie or restaurant). */
  vendorList: '/(customer)/vertical/[type]',
  productDetail: '/(customer)/product/[id]',
  vendorDetail: '/(customer)/vendor/[id]',
  orderDetail: '/(customer)/order/[id]',
  /** Post-checkout success screen — separate from order detail so it can't be back-navigated into. */
  orderConfirmed: '/(customer)/order-confirmed/[id]',
  businessOrderDetail: '/(business)/order/[id]',
  /** Product editor. The create case is the static sibling `/(business)/product/new`. */
  businessProductEdit: '/(business)/product/[id]',
  /** The courier's live run: map, pickup and drop-off. */
  courierDelivery: '/(courier)/delivery/[id]',
  /** Proof of delivery capture — photo, signature or PIN. */
  courierProof: '/(courier)/proof/[id]',
  courierReport: '/(courier)/report/[id]',
} as const;

/**
 * Landing route for a user who has completed the full sign-up + role gate.
 *
 * A `Record` rather than a ternary chain on purpose: the previous binary version
 * fell through to the customer home for anything that was not `business`, so
 * adding a third role would have silently dropped livreurs into the shopper app
 * instead of failing to compile.
 */
// `satisfies` rather than an annotation: the annotation would widen every value
// to the union of all routes, and callers pass this straight to `router.replace`,
// where typed routes want the literal.
const HOME_BY_ROLE = {
  customer: routes.customerHome,
  business: routes.businessDashboard,
  courier: routes.courierMissions,
} as const satisfies Record<UserRole, string>;

export function homeRouteForRole(role: UserRole) {
  return HOME_BY_ROLE[role];
}
