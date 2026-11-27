import { montrealMidnight, REPORTING_TZ } from '../../admin/stats-window.js';
import { money, orderReference, type Locale } from '../../notifications/messages.js';
import { roundCad } from '../../orders/pricing.js';

/**
 * A merchant's monthly statement: what the shop earned, what was taken back,
 * what was sent to it, and what is still owed.
 *
 * Pure, like the receipt it sits beside. `buildStatement` adds up a month from
 * rows; `describeStatement` words the result. The PDF and the email render the
 * description and compute nothing.
 *
 * ── Where the figures come from ─────────────────────────────────────────────
 *
 * Not from the orders: from the shop's **account** — the ledger
 * `merchant_ledger` returns (`drizzle/0059_merchant_payouts.sql`), one line per
 * order delivered, refund given and payment sent. It is the record the weekly
 * payout pays from, so a statement cannot disagree with what was paid, and the
 * balance one month closes on is the balance the next opens on.
 *
 * - An order counts in the month it was **delivered** — a sale is a sale once
 *   the bag is handed over, and a delivered order cannot be cancelled later, so
 *   a statement never has to take one back.
 * - A refund counts in the month it was **given**, whichever month its order
 *   was delivered in. A statement already sent is never rewritten.
 * - A payment counts in the month it was **sent**.
 * - Only orders with a real payment behind them. Seeded history moved no money.
 *
 * ── The rule behind a share ─────────────────────────────────────────────────
 *
 * `orders/split.ts`, and only there: the shop's share of an order is its goods
 * and the taxes on them, less its own promo code and the commission. The
 * delivery fee is Sougouba's, and so is the cost of loyalty points — neither
 * appears on a statement. A refund costs the shop the same fraction of its
 * share that the shopper got back of their payment. ⚠️ Decided with the
 * developer, not signed by the client. This file never works a share out: it
 * prints the one the ledger holds, and derives the commission from it, so the
 * lines of a statement always add up to the cent.
 *
 * It is a **statement, not a tax invoice**: no TPS/TVQ is shown on the
 * commission, because whether there should be is the accountant's to say.
 */

// ── the month ───────────────────────────────────────────────────────────────

/** `2026-11` — the month a statement covers, in Montréal. */
export type Period = `${number}-${string}`;

export interface PeriodWindow {
  period: Period;
  /** First day of the month, and of the next one (`yyyy-mm-dd`). */
  startDate: string;
  endDate: string;
  /** The same two as instants: Montréal midnight, so an order delivered at 23:50 on the 31st is in this month. */
  start: Date;
  end: Date;
}

const two = (n: number) => String(n).padStart(2, '0');

export function periodWindow(period: string): PeriodWindow {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  if (!match || month < 1 || month > 12) throw new Error(`Not a month: "${period}" (expected YYYY-MM)`);

  const startDate = `${year}-${two(month)}-01`;
  const endDate = month === 12 ? `${year + 1}-01-01` : `${year}-${two(month + 1)}-01`;
  return { period: `${year}-${two(month)}` as Period, startDate, endDate, start: montrealMidnight(startDate), end: montrealMidnight(endDate) };
}

/** The month before the one `now` falls in, in Montréal — what the job on the 1st closes. */
export function previousPeriod(now: Date): Period {
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: REPORTING_TZ, year: 'numeric', month: '2-digit' })
    .format(now)
    .split('-')
    .map(Number);
  return (month === 1 ? `${year - 1}-12` : `${year}-${two(month - 1)}`) as Period;
}

/** The month `now` falls in, in Montréal. */
export function currentPeriod(now: Date): Period {
  return new Intl.DateTimeFormat('en-CA', { timeZone: REPORTING_TZ, year: 'numeric', month: '2-digit' }).format(now) as Period;
}

// ── rows in ─────────────────────────────────────────────────────────────────

type Numeric = number | string;

/**
 * One line of the shop's account, as `merchant_ledger` returns it. `numeric`
 * columns arrive as strings through PostgREST.
 */
export interface LedgerRow {
  kind: 'order' | 'refund' | 'payout';
  /** When it counts: delivered, refunded, paid. */
  at: string;
  /** The order — or, for a payment, the payout. */
  ref_id: string | null;
  /** Signed: what it did to the balance. */
  amount_cad: Numeric;
  receipt_number?: Numeric | null;
  // The order's own figures — on an `order` line only.
  subtotal_cad?: Numeric | null;
  gst_cad?: Numeric | null;
  qst_cad?: Numeric | null;
  coupon_discount_cad?: Numeric | null;
}

// ── the statement ───────────────────────────────────────────────────────────

export interface StatementOrderLine {
  orderId: string;
  reference: string;
  receiptNumber: number | null;
  deliveredAt: string;
  goodsCad: number;
  taxesCad: number;
  /** The shop's own promo code, which the shop pays for. */
  couponCad: number;
  commissionCad: number;
  /** What the shop is owed for this order — the figure a payout pays. */
  shareCad: number;
}

export interface StatementRefundLine {
  orderId: string | null;
  reference: string;
  receiptNumber: number | null;
  refundedAt: string;
  /** The shop's part of the refund, not what the shopper got back. */
  amountCad: number;
}

export interface StatementPayoutLine {
  payoutId: string | null;
  paidAt: string;
  amountCad: number;
}

export interface StatementTotals {
  orderCount: number;
  goodsCad: number;
  gstCad: number;
  qstCad: number;
  /** The shop's own promo codes. */
  couponsCad: number;
  commissionCad: number;
  /** The rate behind `commissionCad`, when every order shares one; null on a month that straddles a rate change. */
  commissionRate: number | null;
  /** The shop's share of the month's orders: goods and taxes, less its promo codes and the commission. */
  earnedCad: number;
  refundCount: number;
  /** The shop's part of the month's refunds. */
  refundsCad: number;
  /** Owed to the shop when the month began — negative when the shop owed. */
  openingCad: number;
  payoutCount: number;
  /** Sent to the shop during the month. */
  paidCad: number;
  /** Owed to the shop when the month ended — or, when negative, owed by it. */
  balanceCad: number;
}

export interface StatementLines {
  orders: StatementOrderLine[];
  refunds: StatementRefundLine[];
  payouts: StatementPayoutLine[];
}

const amount = (value: Numeric | null | undefined): number => (value === null || value === undefined ? 0 : Number(value));

const receiptNumber = (value: Numeric | null | undefined): number | null => {
  const n = value === null || value === undefined ? NaN : Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * What is owed to the shop at the end of the month: what was owed when it
 * began, plus what it earned, less its part of the refunds, less what it was
 * sent.
 */
export function balanceOf(totals: Pick<StatementTotals, 'openingCad' | 'earnedCad' | 'refundsCad' | 'paidCad'>): number {
  return roundCad(totals.openingCad + totals.earnedCad - totals.refundsCad - totals.paidCad);
}

export function buildStatement(input: {
  /** The balance when the month began (`merchant_balance_at`). */
  openingCad: Numeric;
  /** The month's lines of the shop's account (`merchant_ledger`). */
  entries: LedgerRow[];
  /** The rate in force now — what an empty month is labelled with. */
  commissionRate: number;
}): { totals: StatementTotals; lines: StatementLines } {
  const inOrder = (kind: LedgerRow['kind']) =>
    input.entries.filter((entry) => entry.kind === kind).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const orders: StatementOrderLine[] = inOrder('order').map((entry) => {
    const goodsCad = amount(entry.subtotal_cad);
    const taxesCad = roundCad(amount(entry.gst_cad) + amount(entry.qst_cad));
    const couponCad = amount(entry.coupon_discount_cad);
    const shareCad = amount(entry.amount_cad);
    return {
      orderId: entry.ref_id ?? '',
      reference: orderReference(entry.ref_id ?? ''),
      receiptNumber: receiptNumber(entry.receipt_number),
      deliveredAt: entry.at,
      goodsCad,
      taxesCad,
      couponCad,
      // Whatever stands between the order's figures and the share — which is
      // the commission, by the rule the share was worked out under. Derived
      // rather than read, so the line always adds up.
      commissionCad: roundCad(goodsCad + taxesCad - couponCad - shareCad),
      shareCad,
    };
  });

  const refunds: StatementRefundLine[] = inOrder('refund').map((entry) => ({
    orderId: entry.ref_id,
    // A refund whose order has since been deleted still counts; it just has no name.
    reference: entry.ref_id ? orderReference(entry.ref_id) : '—',
    receiptNumber: receiptNumber(entry.receipt_number),
    refundedAt: entry.at,
    amountCad: roundCad(-amount(entry.amount_cad)),
  }));

  const payouts: StatementPayoutLine[] = inOrder('payout').map((entry) => ({
    payoutId: entry.ref_id,
    paidAt: entry.at,
    amountCad: roundCad(-amount(entry.amount_cad)),
  }));

  const sum = <T>(rows: T[], pick: (row: T) => number) => roundCad(rows.reduce((total, row) => total + pick(row), 0));

  const goodsCad = sum(orders, (o) => o.goodsCad);
  const commissionCad = sum(orders, (o) => o.commissionCad);
  // Stated only when it is true of the whole month: "12 %" beside a total that
  // mixes two rates would be a figure nobody could reproduce.
  const rates = new Set(orders.filter((o) => o.goodsCad > 0).map((o) => Math.round((o.commissionCad / o.goodsCad) * 1000) / 1000));
  const commissionRate = rates.size === 1 ? [...rates][0] : orders.length === 0 ? input.commissionRate : null;

  const partial = {
    openingCad: roundCad(amount(input.openingCad)),
    earnedCad: sum(orders, (o) => o.shareCad),
    refundsCad: sum(refunds, (r) => r.amountCad),
    paidCad: sum(payouts, (p) => p.amountCad),
  };

  return {
    totals: {
      orderCount: orders.length,
      goodsCad,
      gstCad: sum(inOrder('order'), (o) => amount(o.gst_cad)),
      qstCad: sum(inOrder('order'), (o) => amount(o.qst_cad)),
      couponsCad: sum(orders, (o) => o.couponCad),
      commissionCad,
      commissionRate,
      refundCount: refunds.length,
      payoutCount: payouts.length,
      ...partial,
      balanceCad: balanceOf(partial),
    },
    lines: { orders, refunds, payouts },
  };
}

/**
 * A month in which the shop's account did not move is not sent — an empty
 * statement is noise. A month with only a payment in it is not empty: the shop
 * should have a record of what it received.
 */
export const isEmpty = (totals: StatementTotals): boolean =>
  totals.orderCount === 0 && totals.refundCount === 0 && totals.payoutCount === 0;

/** `RM-000123` — « relevé mensuel ». Padding, not a ceiling, like the receipt number. */
export function formatStatementNumber(value: Numeric | null | undefined): string | null {
  const n = receiptNumber(value);
  return n === null ? null : `RM-${String(n).padStart(6, '0')}`;
}

// ── words out ───────────────────────────────────────────────────────────────

export interface Statement {
  number: string | null;
  period: Period;
  issuedAt: string;
  shop: { name: string; legalName: string | null; street: string | null; city: string | null; postalCode: string | null };
  /** Sougouba's own identity (`PLATFORM_*`), as on a receipt: an unset one prints nothing. */
  platform: { legalName: string | null; address: string | null; supportEmail: string | null };
  totals: StatementTotals;
  lines: StatementLines;
}

export type FigureKind = 'base' | 'minor' | 'plus' | 'minus' | 'total' | 'balance';

export interface StatementDocument {
  locale: Locale;
  title: string;
  /** `Relevé de novembre 2026`. */
  heading: string;
  numberLine: string | null;
  issuedLine: string;
  shop: { label: string; lines: string[] };
  /** The money column: sales, what comes off, what is left. */
  figures: { kind: FigureKind; label: string; value: string }[];
  /** One line saying which way the balance runs. */
  balanceNote: string;
  orders: { columns: string[]; rows: string[][] };
  refunds: { title: string; columns: string[]; rows: string[][] } | null;
  payouts: { title: string; columns: string[]; rows: string[][] } | null;
  footer: string[];
}

const tag = (locale: Locale) => (locale === 'fr' ? 'fr-CA' : 'en-CA');

/** `novembre 2026` / `November 2026`. */
export function periodLabel(period: string, locale: Locale): string {
  const { start } = periodWindow(period);
  return new Intl.DateTimeFormat(tag(locale), { month: 'long', year: 'numeric', timeZone: REPORTING_TZ }).format(start);
}

const day = (iso: string, locale: Locale) =>
  new Intl.DateTimeFormat(tag(locale), { day: 'numeric', month: 'short', timeZone: REPORTING_TZ }).format(new Date(iso));

const longDate = (iso: string, locale: Locale) =>
  new Intl.DateTimeFormat(tag(locale), { dateStyle: 'long', timeZone: REPORTING_TZ }).format(new Date(iso));

const percent = (rate: number, locale: Locale) =>
  new Intl.NumberFormat(tag(locale), { style: 'percent', maximumFractionDigits: 3 }).format(rate);

const COPY = {
  fr: {
    title: 'Relevé mensuel',
    // « d’avril », « d’août », « d’octobre » — French elides before a vowel.
    heading: (month: string) => (/^[aeiouyàâéèêîôû]/i.test(month) ? `Relevé d’${month}` : `Relevé de ${month}`),
    number: (n: string) => `Relevé nº ${n}`,
    issued: (date: string) => `Émis le ${date}`,
    shop: 'Commerce',
    orders: (n: number) => (n > 1 ? `${n} commandes livrées` : `${n} commande livrée`),
    goods: 'Ventes de produits',
    taxes: 'TPS et TVQ perçues',
    coupons: 'Vos codes promo',
    commission: (rate: string | null) => (rate ? `Commission Sougouba (${rate})` : 'Commission Sougouba'),
    earned: 'Votre part des ventes',
    refunds: (n: number) => (n > 1 ? `Remboursements, votre part (${n})` : 'Remboursement, votre part'),
    opening: 'Solde reporté du mois précédent',
    paid: (n: number) => (n > 1 ? `Versé sur votre compte (${n} virements)` : 'Versé sur votre compte'),
    balance: 'Solde à vous verser',
    balanceOwedByShop: 'Solde dû à Sougouba',
    noteOwed: 'Ce montant vous est dû et n’a pas encore été versé.',
    noteSettled: 'Tout a été versé : aucun solde.',
    noteOwedByShop: 'Les remboursements dépassent ce qui vous restait dû : la différence sera retenue sur vos prochains versements.',
    orderColumns: ['Livrée le', 'Commande', 'Produits et taxes', 'Commission', 'Votre part'],
    refundsTitle: 'Remboursements du mois',
    refundColumns: ['Remboursé le', 'Commande', 'Votre part'],
    payoutsTitle: 'Versements du mois',
    payoutColumns: ['Versé le', 'Mode', 'Montant'],
    payoutMethod: 'Virement Stripe',
    rule: 'Les frais de livraison reviennent à Sougouba, qui rémunère le livreur. Les points de fidélité utilisés par vos clients sont à la charge de Sougouba.',
    subscription: 'L’abonnement mensuel est facturé séparément par Stripe et ne figure pas sur ce relevé.',
    notInvoice: 'Ce relevé est un état de compte. Ce n’est pas une facture fiscale.',
    support: (email: string) => `Une question sur ce relevé ? ${email}`,
  },
  en: {
    title: 'Monthly statement',
    heading: (month: string) => `Statement for ${month}`,
    number: (n: string) => `Statement no. ${n}`,
    issued: (date: string) => `Issued on ${date}`,
    shop: 'Shop',
    orders: (n: number) => (n > 1 ? `${n} orders delivered` : `${n} order delivered`),
    goods: 'Product sales',
    taxes: 'GST and QST collected',
    coupons: 'Your promo codes',
    commission: (rate: string | null) => (rate ? `Sougouba commission (${rate})` : 'Sougouba commission'),
    earned: 'Your share of sales',
    refunds: (n: number) => (n > 1 ? `Refunds, your part (${n})` : 'Refund, your part'),
    opening: 'Balance carried over from last month',
    paid: (n: number) => (n > 1 ? `Paid to your account (${n} transfers)` : 'Paid to your account'),
    balance: 'Balance owed to you',
    balanceOwedByShop: 'Balance owed to Sougouba',
    noteOwed: 'This amount is owed to you and has not been paid out yet.',
    noteSettled: 'Everything has been paid out: no balance.',
    noteOwedByShop: 'Refunds exceed what was still owed to you: the difference will be taken off your next payments.',
    orderColumns: ['Delivered', 'Order', 'Goods and taxes', 'Commission', 'Your share'],
    refundsTitle: 'Refunds this month',
    refundColumns: ['Refunded', 'Order', 'Your part'],
    payoutsTitle: 'Payments this month',
    payoutColumns: ['Paid', 'Method', 'Amount'],
    payoutMethod: 'Stripe transfer',
    rule: 'Delivery fees go to Sougouba, which pays the courier. Loyalty points used by your customers are paid for by Sougouba.',
    subscription: 'The monthly subscription is billed separately by Stripe and is not part of this statement.',
    notInvoice: 'This is an account statement. It is not a tax invoice.',
    support: (email: string) => `A question about this statement? ${email}`,
  },
} as const;

export function describeStatement(statement: Statement, locale: Locale): StatementDocument {
  const copy = COPY[locale];
  const cad = (value: number) => money(value, locale);
  const { totals, lines } = statement;

  const shop = statement.shop;
  const shopLines = [
    shop.name,
    shop.legalName && shop.legalName.toLowerCase() !== shop.name.toLowerCase() ? shop.legalName : null,
    shop.street,
    [shop.city, shop.postalCode].filter(Boolean).join(' ') || null,
  ].filter((line): line is string => Boolean(line));

  // Built up the way the shop's account moves: what the month's orders were
  // worth to it, what came off, what was carried in, what was sent, what is left.
  const figures: StatementDocument['figures'] = [
    { kind: 'base', label: copy.orders(totals.orderCount), value: '' },
    { kind: 'minor', label: copy.goods, value: cad(totals.goodsCad) },
    { kind: 'minor', label: copy.taxes, value: cad(roundCad(totals.gstCad + totals.qstCad)) },
  ];
  if (totals.couponsCad > 0) figures.push({ kind: 'minor', label: copy.coupons, value: cad(-totals.couponsCad) });
  figures.push({
    kind: 'minor',
    label: copy.commission(totals.commissionRate === null ? null : percent(totals.commissionRate, locale)),
    value: cad(-totals.commissionCad),
  });
  figures.push({ kind: 'total', label: copy.earned, value: cad(totals.earnedCad) });
  if (totals.refundCount > 0) figures.push({ kind: 'minus', label: copy.refunds(totals.refundCount), value: cad(-totals.refundsCad) });
  if (totals.openingCad !== 0) figures.push({ kind: 'plus', label: copy.opening, value: cad(totals.openingCad) });
  if (totals.payoutCount > 0) figures.push({ kind: 'minus', label: copy.paid(totals.payoutCount), value: cad(-totals.paidCad) });

  const owedByShop = totals.balanceCad < 0;
  figures.push({
    kind: 'balance',
    label: owedByShop ? copy.balanceOwedByShop : copy.balance,
    value: cad(Math.abs(totals.balanceCad)),
  });

  const label = (line: { reference: string; receiptNumber: number | null }) =>
    line.receiptNumber === null ? line.reference : `${line.reference} · R-${String(line.receiptNumber).padStart(6, '0')}`;

  const platform = statement.platform;
  const platformIdentity = [platform.legalName, platform.address].filter(Boolean).join(', ');

  return {
    locale,
    title: copy.title,
    heading: copy.heading(periodLabel(statement.period, locale)),
    numberLine: statement.number ? copy.number(statement.number) : null,
    issuedLine: copy.issued(longDate(statement.issuedAt, locale)),
    shop: { label: copy.shop, lines: shopLines },
    figures,
    balanceNote: owedByShop ? copy.noteOwedByShop : totals.balanceCad === 0 ? copy.noteSettled : copy.noteOwed,
    orders: {
      columns: [...copy.orderColumns],
      rows: lines.orders.map((o) => [
        day(o.deliveredAt, locale),
        label(o),
        cad(roundCad(o.goodsCad + o.taxesCad - o.couponCad)),
        cad(-o.commissionCad),
        cad(o.shareCad),
      ]),
    },
    refunds:
      lines.refunds.length === 0
        ? null
        : {
            title: copy.refundsTitle,
            columns: [...copy.refundColumns],
            rows: lines.refunds.map((r) => [day(r.refundedAt, locale), label(r), cad(-r.amountCad)]),
          },
    // `?? []`: a statement frozen before payments were listed has no such lines.
    payouts:
      (lines.payouts ?? []).length === 0
        ? null
        : {
            title: copy.payoutsTitle,
            columns: [...copy.payoutColumns],
            rows: lines.payouts.map((p) => [day(p.paidAt, locale), copy.payoutMethod, cad(p.amountCad)]),
          },
    footer: [
      copy.rule,
      copy.subscription,
      copy.notInvoice,
      platformIdentity ? `Sougouba — ${platformIdentity}` : null,
      platform.supportEmail ? copy.support(platform.supportEmail) : null,
    ].filter((line): line is string => Boolean(line)),
  };
}

/** `releve-2026-11-RM-000123.pdf` / `statement-2026-11-RM-000123.pdf`. */
export function statementFileName(statement: Statement, locale: Locale): string {
  return [locale === 'fr' ? 'releve' : 'statement', statement.period, statement.number].filter(Boolean).join('-') + '.pdf';
}
