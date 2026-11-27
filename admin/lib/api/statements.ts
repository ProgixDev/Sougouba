import { apiGet, apiUrl, merchantApiGet } from './client';
import type { ID } from '../types';
import { intlLocale } from '../i18n';

/**
 * Merchant statements: what a month's orders were worth to the shop, what was
 * taken back in refunds, what was sent to it and what is still owed. The
 * figures and the rule behind them are the API's
 * (`api/src/billing/statements/`, `api/src/orders/split.ts`).
 */
export interface StatementTotals {
  orderCount: number;
  goodsCad: number;
  gstCad: number;
  qstCad: number;
  /** The shop's own promo codes, which the shop pays for. */
  couponsCad: number;
  commissionCad: number;
  commissionRate: number | null;
  /** The shop's share of the month's orders: goods and taxes, less its promo codes and the commission. */
  earnedCad: number;
  refundCount: number;
  /** The shop's part of the month's refunds. */
  refundsCad: number;
  /** Owed to the shop when the month began. */
  openingCad: number;
  payoutCount: number;
  /** Sent to the shop's bank during the month. */
  paidCad: number;
  /** Owed to the shop at the end of the month — negative when the shop owes instead. */
  balanceCad: number;
}

export interface Statement {
  id: ID;
  /** `RM-000123`. */
  number: string | null;
  /** `2026-11`. */
  period: string;
  issuedAt: string;
  emailedAt: string | null;
  totals: StatementTotals;
}

/** `2026-11` → « novembre 2026 ». Mid-month, so no time zone tips it into a neighbour. */
export function statementMonth(period: string): string {
  return new Intl.DateTimeFormat(intlLocale, { month: 'long', year: 'numeric' }).format(new Date(`${period}-15T12:00:00`));
}

// ── the merchant portal ─────────────────────────────────────────────────────

/** The signed-in shop: the month so far, then every statement issued, newest first. */
export function listMyStatements(): Promise<{ current: { period: string; totals: StatementTotals }; statements: Statement[] }> {
  return merchantApiGet('/vendors/me/statements');
}

/** A short-lived link to one of the shop's own statements, as a PDF. Ask for a fresh one on every click. */
export async function getMyStatementUrl(id: ID): Promise<string> {
  const { path } = await merchantApiGet<{ path: string }>(`/vendors/me/statements/${id}/link`);
  return apiUrl(path);
}

// ── the back office ─────────────────────────────────────────────────────────

export function listVendorStatements(vendorId: ID): Promise<Statement[]> {
  return apiGet<Statement[]>(`/admin/vendors/${vendorId}/statements`);
}

export async function getStatementUrl(id: ID): Promise<string> {
  const { path } = await apiGet<{ path: string }>(`/admin/statements/${id}/link`);
  return apiUrl(path);
}
