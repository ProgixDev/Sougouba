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
  signIn: '/(auth)/sign-in',
  signUp: '/(auth)/sign-up',
  forgotPassword: '/(auth)/forgot-password',
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
  accountPayment: '/(customer)/account/payment',
  accountNotifications: '/(customer)/account/notifications',
  accountAbout: '/(customer)/account/about',
  businessDashboard: '/(business)/(tabs)/dashboard',
  businessCatalog: '/(business)/(tabs)/catalog',
  businessOrders: '/(business)/(tabs)/orders',
  businessAnalytics: '/(business)/(tabs)/analytics',
  businessProfile: '/(business)/(tabs)/profile',
  businessProductNew: '/(business)/product/new',
} as const;

/**
 * Dynamic routes are pushed in object form (`router.push({ pathname, params })`)
 * rather than as an interpolated string — typed routes then check the param
 * names for you, and there is no chance of an unescaped id breaking the path.
 */
export const dynamicRoutes = {
  productDetail: '/(customer)/product/[id]',
  vendorDetail: '/(customer)/vendor/[id]',
  orderDetail: '/(customer)/order/[id]',
  /** Post-checkout success screen — separate from order detail so it can't be back-navigated into. */
  orderConfirmed: '/(customer)/order-confirmed/[id]',
  businessOrderDetail: '/(business)/order/[id]',
  /** Product editor. The create case is the static sibling `/(business)/product/new`. */
  businessProductEdit: '/(business)/product/[id]',
} as const;

/** Landing route for a user who has completed the full sign-up + role gate. */
export function homeRouteForRole(role: UserRole) {
  return role === 'business' ? routes.businessDashboard : routes.customerHome;
}
