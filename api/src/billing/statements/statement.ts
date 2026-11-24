import { montrealMidnight, REPORTING_TZ } from '../../admin/stats-window.js';
import { money, orderReference, type Locale } from '../../notifications/messages.js';
import { roundCad } from '../../orders/pricing.js';

/**
 * A merchant's monthly statement: what the shop sold, what Sougouba keeps, what
 * Stripe has already sent the shop, and what is still owed to it.
 *
 * Pure, like the receipt it sits beside. `buildStatement` adds up a month from
 * rows; `describeStatement` words the result. The PDF and the email render the
 * description and compute nothing.
 *
 * ── What counts ─────────────────────────────────────────────────────────────
 *
 * - An order counts in the month it was **delivered** — a sale is a sale once
 *   the bag is handed over, and a delivered order cannot be cancelled later, so
 *   a statement never has to take one back.
 * - A refund counts in the month it was **issued**, whichever month its order
 *   was delivered in. A statement already sent is never rewritten.
 * - Only orders with a real payment behind them. Seeded history moved no money.
 *
 * ── The rules it adds up under ──────────────────────────────────────────────
 *
 * ⚠️ These are the rules the payment code applies today, not rules anyone has
 * signed off: the delivery fee and both taxes are the shop's, and so is the
 * cost of a points or promo discount (the shop receives what the shopper
 * actually paid, less the commission). Who keeps the delivery fee and who pays
 * for points are open questions with the client. When they are answered,
 * `balanceOf` is the one function to change.
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

/** An order delivered in the month. `numeric` columns arrive as strings through PostgREST. */
export interface StatementOrderRow {
  id: string;
  receipt_number?: Numeric | null;
  deliveredAt: string;
  subtotal_cad: Numeric;
  gst_cad: Numeric;
  qst_cad: Numeric;
  delivery_fee_cad: Numeric;
  total_cad: Numeric;
  points_discount_cad: Numeric | null;
  coupon_discount_cad: Numeric | null;
  /** Null on an order paid before these were recorded and never backfilled — see `commissionOf`. */
  commission_cad: Numeric | null;
  merchant_paid_cad: Numeric | null;
}

/** A refund issued in the month. */
export interface StatementRefundRow {
  id: string;
  receipt_number?: Numeric | null;
  refunded_at: string;
  refund_amount_cad: Numeric | null;
  total_cad: Numeric;
}

// ── the statement ───────────────────────────────────────────────────────────

export interface StatementOrderLine {
  orderId: string;
  reference: string;
  receiptNumber: number | null;
  deliveredAt: string;
  goodsCad: number;
  taxesCad: number;
  deliveryCad: number;
  discountsCad: number;
  /** What the shopper paid. */
  collectedCad: number;
  commissionCad: number;
  /** What Stripe already sent the shop for this order. */
  paidCad: number;
}

export interface StatementRefundLine {
  orderId: string;
  reference: string;
  receiptNumber: number | null;
  refundedAt: string;
  amountCad: number;
}

export interface StatementTotals {
  orderCount: number;
  goodsCad: number;
  gstCad: number;
  qstCad: number;
  deliveryCad: number;
  discountsCad: number;
  /** Everything shoppers paid for these orders. */
  collectedCad: number;
  refundCount: number;
  refundsCad: number;
  commissionCad: number;
  /** The rate behind `commissionCad`, when every order shares one; null on a month that straddles a rate change. */
  commissionRate: number | null;
  /** Already sent to the shop by Stripe, at payment. */
  paidCad: number;
  /** Still owed to the shop — or, when negative, owed by it. */
  balanceCad: number;
}

export interface StatementLines {
  orders: StatementOrderLine[];
  refunds: StatementRefundLine[];
}

const amount = (value: Numeric | null | undefined): number => (value === null || value === undefined ? 0 : Number(value));

const receiptNumber = (value: Numeric | null | undefined): number | null => {
  const n = value === null || value === undefined ? NaN : Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * Sougouba's commission on an order: what was fixed at checkout, or — for an
 * order that somehow has no record — the current rate on the goods, which is
 * how every such order was priced.
 */
function commissionOf(order: StatementOrderRow, fallbackRate: number): number {
  return order.commission_cad === null ? roundCad(amount(order.subtotal_cad) * fallbackRate) : amount(order.commission_cad);
}

/**
 * What is still owed to the shop.
 *
 * Everything shoppers paid, less what was given back to them, less Sougouba's
 * commission, less what Stripe has already sent the shop. This is the one
 * place the open questions land — see the note at the top of the file.
 */
export function balanceOf(totals: Pick<StatementTotals, 'collectedCad' | 'refundsCad' | 'commissionCad' | 'paidCad'>): number {
  return roundCad(totals.collectedCad - totals.refundsCad - totals.commissionCad - totals.paidCad);
}

export function buildStatement(input: {
  orders: StatementOrderRow[];
  refunds: StatementRefundRow[];
  /** The rate in force now, for an order with no recorded commission. */
  commissionRate: number;
}): { totals: StatementTotals; lines: StatementLines } {
  const orders: StatementOrderLine[] = [...input.orders]
    .sort((a, b) => Date.parse(a.deliveredAt) - Date.parse(b.deliveredAt))
    .map((order) => ({
      orderId: order.id,
      reference: orderReference(order.id),
      receiptNumber: receiptNumber(order.receipt_number),
      deliveredAt: order.deliveredAt,
      goodsCad: amount(order.subtotal_cad),
      taxesCad: roundCad(amount(order.gst_cad) + amount(order.qst_cad)),
      deliveryCad: amount(order.delivery_fee_cad),
      discountsCad: roundCad(amount(order.points_discount_cad) + amount(order.coupon_discount_cad)),
      collectedCad: amount(order.total_cad),
      commissionCad: commissionOf(order, input.commissionRate),
      paidCad: amount(order.merchant_paid_cad),
    }));

  const refunds: StatementRefundLine[] = [...input.refunds]
    .sort((a, b) => Date.parse(a.refunded_at) - Date.parse(b.refunded_at))
    .map((refund) => ({
      orderId: refund.id,
      reference: orderReference(refund.id),
      receiptNumber: receiptNumber(refund.receipt_number),
      refundedAt: refund.refunded_at,
      // A refund recorded without its amount is taken as the whole order —
      // understating what went back would overstate what is owed.
      amountCad: refund.refund_amount_cad === null ? amount(refund.total_cad) : amount(refund.refund_amount_cad),
    }));

  const sum = <T>(rows: T[], pick: (row: T) => number) => roundCad(rows.reduce((total, row) => total + pick(row), 0));

  const goodsCad = sum(orders, (o) => o.goodsCad);
  const commissionCad = sum(orders, (o) => o.commissionCad);
  // Stated only when it is true of the whole month: "12 %" beside a total that
  // mixes two rates would be a figure nobody could reproduce.
  const rates = new Set(orders.filter((o) => o.goodsCad > 0).map((o) => Math.round((o.commissionCad / o.goodsCad) * 1000) / 1000));
  const commissionRate = rates.size === 1 ? [...rates][0] : orders.length === 0 ? input.commissionRate : null;

  const partial = {
    collectedCad: sum(orders, (o) => o.collectedCad),
    refundsCad: sum(refunds, (r) => r.amountCad),
    commissionCad,
    paidCad: sum(orders, (o) => o.paidCad),
  };

  return {
    totals: {
      orderCount: orders.length,
      goodsCad,
      gstCad: sum(input.orders, (o) => amount(o.gst_cad)),
      qstCad: sum(input.orders, (o) => amount(o.qst_cad)),
      deliveryCad: sum(orders, (o) => o.deliveryCad),
      discountsCad: sum(orders, (o) => o.discountsCad),
      refundCount: refunds.length,
      commissionRate,
      ...partial,
      balanceCad: balanceOf(partial),
    },
    lines: { orders, refunds },
  };
}

/** A month with nothing delivered and nothing refunded is not sent — an empty statement is noise. */
export const isEmpty = (totals: StatementTotals): boolean => totals.orderCount === 0 && totals.refundCount === 0;

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

export type FigureKind = 'base' | 'minor' | 'minus' | 'total' | 'balance';

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
    delivery: 'Frais de livraison',
    discounts: 'Rabais accordés (points et codes promo)',
    collected: 'Total payé par les clients',
    refunds: (n: number) => (n > 1 ? `Remboursements (${n})` : 'Remboursement'),
    commission: (rate: string | null) => (rate ? `Commission Sougouba (${rate})` : 'Commission Sougouba'),
    paid: 'Déjà versé par Stripe',
    balance: 'Solde à vous verser',
    balanceOwedByShop: 'Solde dû à Sougouba',
    noteOwed: 'Ce montant vous est dû et n’a pas encore été versé.',
    noteSettled: 'Tout a été versé : aucun solde.',
    noteOwedByShop: 'Les remboursements du mois dépassent ce qui vous restait dû.',
    orderColumns: ['Livrée le', 'Commande', 'Payé par le client', 'Commission', 'Déjà versé'],
    refundsTitle: 'Remboursements du mois',
    refundColumns: ['Remboursé le', 'Commande', 'Montant'],
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
    delivery: 'Delivery fees',
    discounts: 'Discounts given (points and promo codes)',
    collected: 'Total paid by customers',
    refunds: (n: number) => (n > 1 ? `Refunds (${n})` : 'Refund'),
    commission: (rate: string | null) => (rate ? `Sougouba commission (${rate})` : 'Sougouba commission'),
    paid: 'Already paid out by Stripe',
    balance: 'Balance owed to you',
    balanceOwedByShop: 'Balance owed to Sougouba',
    noteOwed: 'This amount is owed to you and has not been paid out yet.',
    noteSettled: 'Everything has been paid out: no balance.',
    noteOwedByShop: 'This month’s refunds exceed what was still owed to you.',
    orderColumns: ['Delivered', 'Order', 'Paid by customer', 'Commission', 'Already paid'],
    refundsTitle: 'Refunds this month',
    refundColumns: ['Refunded', 'Order', 'Amount'],
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

  // Built up the way the money actually moves: what came in, what it was made
  // of, what comes off, what is left.
  const figures: StatementDocument['figures'] = [
    { kind: 'base', label: copy.orders(totals.orderCount), value: '' },
    { kind: 'minor', label: copy.goods, value: cad(totals.goodsCad) },
    { kind: 'minor', label: copy.taxes, value: cad(roundCad(totals.gstCad + totals.qstCad)) },
    { kind: 'minor', label: copy.delivery, value: cad(totals.deliveryCad) },
  ];
  if (totals.discountsCad > 0) figures.push({ kind: 'minor', label: copy.discounts, value: cad(-totals.discountsCad) });
  figures.push({ kind: 'total', label: copy.collected, value: cad(totals.collectedCad) });
  if (totals.refundCount > 0) figures.push({ kind: 'minus', label: copy.refunds(totals.refundCount), value: cad(-totals.refundsCad) });
  figures.push({
    kind: 'minus',
    label: copy.commission(totals.commissionRate === null ? null : percent(totals.commissionRate, locale)),
    value: cad(-totals.commissionCad),
  });
  if (totals.paidCad > 0) figures.push({ kind: 'minus', label: copy.paid, value: cad(-totals.paidCad) });

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
      rows: lines.orders.map((o) => [day(o.deliveredAt, locale), label(o), cad(o.collectedCad), cad(-o.commissionCad), cad(o.paidCad)]),
    },
    refunds:
      lines.refunds.length === 0
        ? null
        : {
            title: copy.refundsTitle,
            columns: [...copy.refundColumns],
            rows: lines.refunds.map((r) => [day(r.refundedAt, locale), label(r), cad(-r.amountCad)]),
          },
    footer: [
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
