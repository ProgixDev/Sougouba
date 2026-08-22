/**
 * Where a courier gets paid.
 *
 * The field used to be "Institution financière", free text, `min(3)` — which
 * accepted "banque", "RBC", "Royale" and "rbq" as four different institutions
 * for the same account, and gave whoever eventually reconciles a direct deposit
 * nothing to reconcile against. The client asked for a list of the banks people
 * actually use, with a way out for the ones not on it.
 *
 * `code` is the Canada-wide institution number that prints on a direct-deposit
 * slip, next to the transit. Kept because it is the identifier a payment file
 * carries; the name is only what the courier recognises.
 *
 * Ordered by how likely a Québec courier is to bank there — Desjardins and the
 * Banque Nationale before the Toronto five — rather than alphabetically, which
 * would put an out-of-province bank first on a screen used in Montréal.
 */

export interface Bank {
  id: string;
  name: string;
  /** Three-digit institution number, blank for the manual entry. */
  code?: string;
}

/** The id the manual-entry branch uses. Referenced by the schema and the form. */
export const OTHER_BANK_ID = 'other';

export const banks: Bank[] = [
  { id: 'desjardins', name: 'Desjardins', code: '815' },
  { id: 'bnc', name: 'Banque Nationale du Canada', code: '006' },
  { id: 'rbc', name: 'RBC Banque Royale', code: '003' },
  { id: 'td', name: 'TD Canada Trust', code: '004' },
  { id: 'bmo', name: 'BMO Banque de Montréal', code: '001' },
  { id: 'scotia', name: 'Banque Scotia', code: '002' },
  { id: 'cibc', name: 'CIBC', code: '010' },
  { id: 'laurentienne', name: 'Banque Laurentienne', code: '039' },
  { id: 'tangerine', name: 'Tangerine', code: '614' },
  { id: 'eq', name: 'EQ Bank', code: '338' },
  { id: 'simplii', name: 'Simplii Financial', code: '010' },
  { id: OTHER_BANK_ID, name: 'Autre' },
];

export function bankById(id: string): Bank | undefined {
  return banks.find((b) => b.id === id);
}

/** What to show on a profile: the chosen bank, or what was typed under "Autre". */
export function bankLabel(id: string, otherName?: string): string {
  if (id === OTHER_BANK_ID) return otherName?.trim() || 'Autre';
  return bankById(id)?.name ?? id;
}
