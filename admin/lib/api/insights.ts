import { apiGet } from './client';
import { formatNumber } from '../format';
import { intlLocale, t } from '../i18n';

/** `GET /admin/insights/*` — the KPIs above each back-office list (`admin_insights`, migration 0044). */

type Counts = Record<string, number>;

export interface VendorInsights {
  byStatus: Counts;
  byType: Counts;
  new30: number;
  avgRating: number | null;
  avgApprovalHours: number | null;
  sales30: number;
  orders30: number;
  signupsByWeek: { week: string; count: number }[];
  top: { id: string; name: string; sales: number; orders: number }[];
}

export interface CourierInsights {
  byStatus: Counts;
  byVehicle: Counts;
  online: number;
  avgRating: number | null;
  deliveries30: number;
  avgDeliveryMinutes: number | null;
  earnings30: number;
  deliveriesByDay: { date: string; count: number }[];
  top: { id: string; name: string; deliveries: number }[];
}

export interface OrderInsights {
  today: number;
  orders30: number;
  gmv30: number;
  avgBasket: number | null;
  cancelRate: number | null;
  refunded30: number;
  active: number;
  unassigned: number;
  byStatus: Counts;
  byDay: { date: string; count: number; gmv: number }[];
}

export interface UserInsights {
  byRole: Counts;
  new30: number;
  blocked: number;
  withOrders: number;
  signupsByWeek: { week: string; count: number }[];
}

export interface DisputeInsights {
  byStatus: Counts;
  byReason: Counts;
  opened30: number;
  avgResolutionHours: number | null;
  refunded30: number;
}

export interface CourierIssueInsights {
  byStatus: Counts;
  byReason: Counts;
  reported30: number;
  avgResolutionHours: number | null;
}

export interface SupportInsights {
  waiting: number;
  conversations30: number;
  escalated30: number;
  resolved30: number;
  avgResolutionHours: number | null;
  messages30: number;
}

export interface ModerationInsights {
  reviews: number;
  avgReview: number | null;
  lowReviews30: number;
  commentsHidden: number;
  reviewsRemoved: number;
  couponsActive: number;
  couponUses: number;
  products: number;
  productsHidden: number;
}

export const getVendorInsights = () => apiGet<VendorInsights>('/admin/insights/vendors');
export const getCourierInsights = () => apiGet<CourierInsights>('/admin/insights/couriers');
export const getOrderInsights = () => apiGet<OrderInsights>('/admin/insights/orders');
export const getUserInsights = () => apiGet<UserInsights>('/admin/insights/users');
export const getDisputeInsights = () => apiGet<DisputeInsights>('/admin/insights/disputes');
export const getCourierIssueInsights = () => apiGet<CourierIssueInsights>('/admin/insights/courier-issues');
export const getSupportInsights = () => apiGet<SupportInsights>('/admin/insights/support');
export const getModerationInsights = () => apiGet<ModerationInsights>('/admin/insights/moderation');

/** "3,2 h", "45 min", "2 j" — a duration a person reads, not a number of hours. */
export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return '—';
  if (hours < 1) return t('common.time.minutes', { count: Math.round(hours * 60) });
  if (hours < 48) return t('common.time.hours', { count: formatNumber(hours, { maximumFractionDigits: 1 }) });
  return t('common.time.days', { count: Math.round(hours / 24) });
}

/** Short day or week label for a chart axis: "21 nov.". */
export function shortDay(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(intlLocale, { day: 'numeric', month: 'short' });
}
