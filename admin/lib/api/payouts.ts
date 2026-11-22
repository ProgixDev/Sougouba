import { apiGet, apiPost, type Page, type PageQuery } from './client';
import type { ID } from '../types';

export type PayoutAttemptStatus = 'paid' | 'skipped' | 'failed';
export type PayoutFailureReason = 'no_account' | 'stripe_error' | 'record_error';
export type PayoutOwedFilter = 'all' | 'no_account' | 'failed';

export interface PayoutRunSummary {
  id: ID;
  trigger: 'schedule' | 'admin';
  status: 'running' | 'done' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  paidCount: number;
  skippedCount: number;
  failedCount: number;
  paidCad: number;
}

export interface PayoutInsights {
  owedCad: number;
  owedCouriers: number;
  owedRuns: number;
  oldestUnpaidAt: string | null;
  noAccountCad: number;
  noAccountCouriers: number;
  paid30Cad: number;
  paid30Couriers: number;
  failed30: number;
  paidAllTimeCad: number;
  lastRun: PayoutRunSummary | null;
}

/** One courier with delivered, unpaid runs. */
export interface OwedCourier {
  courierId: ID;
  courierName: string;
  photoUrl: string | null;
  courierStatus: string;
  pendingCad: number;
  runCount: number;
  oldestAt: string;
  accountId: string | null;
  connectStatus: string | null;
  lastAttempt: { status: PayoutAttemptStatus; reason: PayoutFailureReason | null; error: string | null; at: string } | null;
}

/** One courier's line in one run. */
export interface PayoutAttempt {
  id: ID;
  runId: ID;
  trigger: 'schedule' | 'admin';
  courierId: ID;
  courierName: string | null;
  amountCad: number;
  runCount: number;
  status: PayoutAttemptStatus;
  reason: PayoutFailureReason | null;
  error: string | null;
  stripeTransferId: string | null;
  createdAt: string;
}

export interface PayoutRun extends PayoutRunSummary {
  actorName: string | null;
  error: string | null;
}

export interface PayoutRunResult {
  runId: ID;
  paid: number;
  skipped: number;
  failed: number;
  totalCad: number;
}

export function getPayoutInsights(): Promise<PayoutInsights> {
  return apiGet<PayoutInsights>('/admin/payouts/insights');
}

export function listOwed(filter: PayoutOwedFilter, search: string, page: PageQuery): Promise<Page<OwedCourier>> {
  return apiGet<Page<OwedCourier>>('/admin/payouts/owed', {
    filter,
    search: search.trim() || undefined,
    offset: page.offset,
    limit: page.limit,
    sort: page.sort,
    dir: page.dir,
  });
}

export function listPayoutAttempts(status: PayoutAttemptStatus | undefined, page: PageQuery): Promise<Page<PayoutAttempt>> {
  return apiGet<Page<PayoutAttempt>>('/admin/payouts/attempts', { status, offset: page.offset, limit: page.limit });
}

export function listPayoutRuns(page: PageQuery): Promise<Page<PayoutRun>> {
  return apiGet<Page<PayoutRun>>('/admin/payouts/runs', { offset: page.offset, limit: page.limit });
}

/** Pays every courier owed money who has a Stripe account. Written to the audit log. */
export function runPayouts(): Promise<PayoutRunResult> {
  return apiPost<PayoutRunResult>('/admin/payouts/run');
}

export const FAILURE_REASON_LABELS: Record<PayoutFailureReason, string> = {
  no_account: 'Pas de compte Stripe',
  stripe_error: 'Refusé par Stripe',
  record_error: 'Envoyé, non enregistré',
};
