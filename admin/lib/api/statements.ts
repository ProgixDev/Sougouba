import { apiGet, apiUrl, merchantApiGet } from './client';
import type { ID } from '../types';

/**
 * Merchant statements: what a shop sold in a month, what Sougouba keeps, what
 * Stripe has already sent the shop and what is still owed to it. The figures
 * and the rules behind them are the API's (`api/src/billing/statements/`).
 */
export interface StatementTotals {
  orderCount: number;
  goodsCad: number;
  gstCad: number;
  qstCad: number;
  deliveryCad: number;
  discountsCad: number;
  /** Everything shoppers paid for the orders delivered in the month. */
  collectedCad: number;
  refundCount: number;
  refundsCad: number;
  commissionCad: number;
  commissionRate: number | null;
  /** Already sent to the shop by Stripe. */
  paidCad: number;
  /** Still owed to the shop — negative when the shop owes instead. */
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
  return new Intl.DateTimeFormat('fr-CA', { month: 'long', year: 'numeric' }).format(new Date(`${period}-15T12:00:00`));
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
