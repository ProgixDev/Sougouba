import { money, orderReference, type Locale } from '../../notifications/messages.js';
import { GST_RATE, QST_RATE, roundCad } from '../pricing.js';

/**
 * A receipt: one paid order, written down for the person who paid.
 *
 * Everything here is pure. `buildReceipt` turns the rows an order already
 * snapshots — line names and prices, both taxes, the delivery fee, the address —
 * into one value, and `describeReceipt` turns that value into the words and
 * figures a reader sees. The email and the PDF both render from
 * `describeReceipt` and compute nothing themselves, so the two cannot disagree
 * about a total: there is one place a receipt's arithmetic and wording live.
 *
 * Nothing is re-priced. A receipt that recomputed a tax from today's rate, or a
 * line from today's catalogue, would stop matching what was charged the day the
 * rate or the price moved — the order's own columns are the record.
 */

/** Receipts are dated where the order happened, not where the server runs (`REPORTING_TZ` in the back office). */
const RECEIPT_TZ = 'America/Montreal';

/** Who sold the goods: the shop, with the legal identity its registration file gave. */
export interface ReceiptSeller {
  name: string;
  legalName: string | null;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  /** The shop's own TPS/TVQ registration numbers — printed only when the merchant supplied them. */
  gstNumber: string | null;
  qstNumber: string | null;
}

/**
 * Sougouba's own legal identity, from the environment (`PLATFORM_*`).
 *
 * Every field is optional and a missing one simply prints nothing: a receipt
 * with no company line is honest, one with an invented company is not.
 */
export interface PlatformIdentity {
  legalName: string | null;
  address: string | null;
  gstNumber: string | null;
  qstNumber: string | null;
  supportEmail: string | null;
}

/** How the order was paid, as Stripe reports it. Null when Stripe could not be asked. */
export interface ReceiptPayment {
  brand: string | null;
  last4: string | null;
  /** `apple_pay`, `google_pay`, … when the card was presented through a wallet. */
  wallet: string | null;
}

export interface ReceiptLine {
  name: string;
  qty: number;
  unitPriceCad: number;
  totalCad: number;
}

export interface Receipt {
  orderId: string;
  /** The `#A1B2` reference the app and the pushes already use for this order. */
  reference: string;
  /** `R-000123`. Null against a database that has not had `0051` applied yet. */
  number: string | null;
  issuedAt: string;
  cancelled: boolean;
  customerName: string | null;
  deliveryAddress: { street: string; unit: string | null; city: string; postalCode: string };
  seller: ReceiptSeller;
  platform: PlatformIdentity;
  lines: ReceiptLine[];
  subtotalCad: number;
  gstCad: number;
  qstCad: number;
  deliveryFeeCad: number;
  pointsRedeemed: number;
  pointsDiscountCad: number;
  couponCode: string | null;
  couponDiscountCad: number;
  totalCad: number;
  payment: ReceiptPayment | null;
  /** `amountCad` is null on imported history that recorded a refund without its amount. */
  refund: { at: string; amountCad: number | null } | null;
}

// ── rows in ─────────────────────────────────────────────────────────────────

/** `numeric` columns reach JSON as strings through PostgREST, whatever the generated types say. */
type Numeric = number | string;

/** The `orders` columns a receipt reads. `select('*')` supplies them; nothing else is touched. */
export interface ReceiptOrderRow {
  id: string;
  status: string;
  created_at: string;
  customer_name: string | null;
  subtotal_cad: Numeric;
  gst_cad: Numeric;
  qst_cad: Numeric;
  delivery_fee_cad: Numeric;
  total_cad: Numeric;
  points_redeemed: number | null;
  points_discount_cad: Numeric | null;
  coupon_code: string | null;
  coupon_discount_cad: Numeric | null;
  delivery_address_street: string;
  delivery_address_city: string;
  delivery_address_postal_code: string;
  delivery_unit?: string | null;
  refunded_at: string | null;
  refund_amount_cad: Numeric | null;
  /** Absent before migration `0051` — the receipt then goes out unnumbered rather than not at all. */
  receipt_number?: Numeric | null;
}

export interface ReceiptItemRow {
  name: string;
  qty: number;
  unitPriceCad: Numeric;
}

export interface ReceiptVendorRow {
  name: string;
  city: string | null;
  addressStreet: string | null;
  addressPostalCode: string | null;
}

export interface ReceiptRegistrationRow {
  legalName: string | null;
  gstNumber: string | null;
  qstNumber: string | null;
}

/**
 * `R-000123`.
 *
 * Its own sequence rather than the `#A1B2` order reference: that one is four
 * hex characters hashed from the id, built to be said down a phone line, and
 * two orders can share it. A receipt number has to name exactly one receipt.
 * Six digits is padding, not a ceiling — the millionth receipt is `R-1000000`.
 */
export function formatReceiptNumber(value: Numeric | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return `R-${String(n).padStart(6, '0')}`;
}

const text = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const amount = (value: Numeric | null | undefined): number => (value === null || value === undefined ? 0 : Number(value));

export function buildReceipt(input: {
  order: ReceiptOrderRow;
  items: ReceiptItemRow[];
  vendor: ReceiptVendorRow | null;
  registration: ReceiptRegistrationRow | null;
  platform: PlatformIdentity;
  payment: ReceiptPayment | null;
}): Receipt {
  const { order, vendor, registration } = input;

  return {
    orderId: order.id,
    reference: orderReference(order.id),
    number: formatReceiptNumber(order.receipt_number),
    issuedAt: order.created_at,
    cancelled: order.status === 'cancelled',
    customerName: text(order.customer_name),
    deliveryAddress: {
      street: order.delivery_address_street,
      unit: text(order.delivery_unit),
      city: order.delivery_address_city,
      postalCode: order.delivery_address_postal_code,
    },
    seller: {
      name: text(vendor?.name) ?? 'Sougouba',
      legalName: text(registration?.legalName),
      street: text(vendor?.addressStreet),
      city: text(vendor?.city),
      postalCode: text(vendor?.addressPostalCode),
      gstNumber: text(registration?.gstNumber),
      qstNumber: text(registration?.qstNumber),
    },
    platform: input.platform,
    lines: input.items.map((item) => {
      const unitPriceCad = Number(item.unitPriceCad);
      return { name: item.name, qty: item.qty, unitPriceCad, totalCad: roundCad(unitPriceCad * item.qty) };
    }),
    subtotalCad: amount(order.subtotal_cad),
    gstCad: amount(order.gst_cad),
    qstCad: amount(order.qst_cad),
    deliveryFeeCad: amount(order.delivery_fee_cad),
    pointsRedeemed: order.points_redeemed ?? 0,
    pointsDiscountCad: amount(order.points_discount_cad),
    couponCode: text(order.coupon_code),
    couponDiscountCad: amount(order.coupon_discount_cad),
    totalCad: amount(order.total_cad),
    payment: input.payment,
    refund: order.refunded_at
      ? {
          at: order.refunded_at,
          amountCad: order.refund_amount_cad === null ? null : Number(order.refund_amount_cad),
        }
      : null,
  };
}

// ── words out ───────────────────────────────────────────────────────────────

export type AmountKind = 'base' | 'minor' | 'discount' | 'total' | 'refund' | 'net';

/**
 * A receipt as the reader meets it: every label chosen, every figure formatted.
 * The renderers lay these out and decide nothing.
 */
export interface ReceiptDocument {
  locale: Locale;
  title: string;
  /** `Reçu nº R-000123`, or null while the receipt has no number. */
  numberLine: string | null;
  orderLine: string;
  dateLine: string;
  /** A cancelled order says so at the top — a receipt must not read as a delivery that happened. */
  notice: string | null;
  seller: { label: string; lines: string[] };
  customer: { label: string; lines: string[] };
  columns: { item: string; qty: string; unitPrice: string; amount: string };
  lines: { name: string; qty: string; unitPrice: string; amount: string }[];
  amounts: { kind: AmountKind; label: string; value: string }[];
  payment: { label: string; value: string };
  footer: string[];
}

const COPY = {
  fr: {
    title: 'Reçu',
    number: (n: string) => `Reçu nº ${n}`,
    order: (ref: string) => `Commande ${ref}`,
    cancelled: 'Commande annulée',
    soldBy: 'Vendu par',
    customer: 'Client',
    customerFallback: 'Client Sougouba',
    gstNumber: (n: string) => `Nº TPS : ${n}`,
    qstNumber: (n: string) => `Nº TVQ : ${n}`,
    columns: { item: 'Article', qty: 'Qté', unitPrice: 'Prix unitaire', amount: 'Montant' },
    subtotal: 'Sous-total',
    gst: (rate: string) => `TPS (${rate})`,
    qst: (rate: string) => `TVQ (${rate})`,
    delivery: 'Livraison',
    points: (points: number) => (points > 0 ? `Points Sougouba (${points} pts)` : 'Points Sougouba'),
    coupon: (code: string | null) => (code ? `Code promo (${code})` : 'Code promo'),
    total: 'Total payé',
    refund: (date: string) => `Remboursement du ${date}`,
    refundNoAmount: (date: string) => `Commande remboursée le ${date}`,
    net: 'Montant net payé',
    payment: 'Paiement',
    paymentOnline: 'En ligne',
    platform: (identity: string) => `Livraison et plateforme : ${identity}`,
    platformTax: (gst: string | null, qst: string | null) =>
      [gst ? `TPS ${gst}` : null, qst ? `TVQ ${qst}` : null].filter(Boolean).join(' · '),
    support: (email: string) => `Une question sur cette commande ? ${email}`,
    generated: 'Reçu généré automatiquement par Sougouba.',
  },
  en: {
    title: 'Receipt',
    number: (n: string) => `Receipt no. ${n}`,
    order: (ref: string) => `Order ${ref}`,
    cancelled: 'Order cancelled',
    soldBy: 'Sold by',
    customer: 'Customer',
    customerFallback: 'Sougouba customer',
    gstNumber: (n: string) => `GST no.: ${n}`,
    qstNumber: (n: string) => `QST no.: ${n}`,
    columns: { item: 'Item', qty: 'Qty', unitPrice: 'Unit price', amount: 'Amount' },
    subtotal: 'Subtotal',
    gst: (rate: string) => `GST (${rate})`,
    qst: (rate: string) => `QST (${rate})`,
    delivery: 'Delivery',
    points: (points: number) => (points > 0 ? `Sougouba points (${points} pts)` : 'Sougouba points'),
    coupon: (code: string | null) => (code ? `Promo code (${code})` : 'Promo code'),
    total: 'Total paid',
    refund: (date: string) => `Refund on ${date}`,
    refundNoAmount: (date: string) => `Order refunded on ${date}`,
    net: 'Net amount paid',
    payment: 'Payment',
    paymentOnline: 'Online',
    platform: (identity: string) => `Delivery and platform: ${identity}`,
    platformTax: (gst: string | null, qst: string | null) =>
      [gst ? `GST ${gst}` : null, qst ? `QST ${qst}` : null].filter(Boolean).join(' · '),
    support: (email: string) => `A question about this order? ${email}`,
    generated: 'Receipt generated automatically by Sougouba.',
  },
} as const;

const tag = (locale: Locale) => (locale === 'fr' ? 'fr-CA' : 'en-CA');

/** What sits between a label and its value: French sets a space before the colon, English does not. */
export const labelSeparator = (locale: Locale): string => (locale === 'fr' ? ' : ' : ': ');

/** `23 novembre 2026 à 14 h 05` / `November 23, 2026 at 2:05 p.m.` — Montréal time. */
export function receiptDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(tag(locale), { dateStyle: 'long', timeStyle: 'short', timeZone: RECEIPT_TZ }).format(
    new Date(iso)
  );
}

export function receiptDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(tag(locale), { dateStyle: 'long', timeZone: RECEIPT_TZ }).format(new Date(iso));
}

/** `5 %` / `9,975 %` in French, `5%` / `9.975%` in English — the rate as each locale writes it. */
function rate(value: number, locale: Locale): string {
  return new Intl.NumberFormat(tag(locale), { style: 'percent', maximumFractionDigits: 3 }).format(value);
}

/** What Stripe calls a card network → what is printed on the card. Unknown ones are shown capitalised. */
const CARD_BRANDS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  interac: 'Interac',
};

const WALLETS: Record<string, string> = { apple_pay: 'Apple Pay', google_pay: 'Google Pay' };

/** `Apple Pay · Visa •••• 4242`, or the generic line when Stripe told us nothing usable. */
export function paymentLabel(payment: ReceiptPayment | null, locale: Locale): string {
  if (!payment) return COPY[locale].paymentOnline;
  const brand = payment.brand ? (CARD_BRANDS[payment.brand] ?? capitalise(payment.brand)) : null;
  const card = [brand, payment.last4 ? `•••• ${payment.last4}` : null].filter(Boolean).join(' ');
  const wallet = payment.wallet ? (WALLETS[payment.wallet] ?? null) : null;
  return [wallet, card || null].filter(Boolean).join(' · ') || COPY[locale].paymentOnline;
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** `Montréal H2X 1Y4` — either half alone if the other is missing. */
const cityLine = (city: string | null, postalCode: string | null) => [city, postalCode].filter(Boolean).join(' ') || null;

export function describeReceipt(receipt: Receipt, locale: Locale): ReceiptDocument {
  const copy = COPY[locale];
  const cad = (value: number) => money(value, locale);

  const seller = receipt.seller;
  const sellerLines = [
    seller.name,
    // A shop trading under its own legal name would otherwise print it twice.
    seller.legalName && seller.legalName.toLowerCase() !== seller.name.toLowerCase() ? seller.legalName : null,
    seller.street,
    cityLine(seller.city, seller.postalCode),
    seller.gstNumber ? copy.gstNumber(seller.gstNumber) : null,
    seller.qstNumber ? copy.qstNumber(seller.qstNumber) : null,
  ].filter((line): line is string => Boolean(line));

  const address = receipt.deliveryAddress;
  const customerLines = [
    receipt.customerName ?? copy.customerFallback,
    address.street,
    address.unit,
    cityLine(address.city, address.postalCode),
  ].filter((line): line is string => Boolean(line));

  // The same order as the app's `PriceSummary`, so the receipt reads like the
  // checkout the shopper approved: goods, the two taxes on them, delivery, then
  // whatever was taken off.
  const amounts: ReceiptDocument['amounts'] = [
    { kind: 'base', label: copy.subtotal, value: cad(receipt.subtotalCad) },
    { kind: 'minor', label: copy.gst(rate(GST_RATE, locale)), value: cad(receipt.gstCad) },
    { kind: 'minor', label: copy.qst(rate(QST_RATE, locale)), value: cad(receipt.qstCad) },
    { kind: 'base', label: copy.delivery, value: cad(receipt.deliveryFeeCad) },
  ];
  if (receipt.pointsDiscountCad > 0) {
    amounts.push({ kind: 'discount', label: copy.points(receipt.pointsRedeemed), value: cad(-receipt.pointsDiscountCad) });
  }
  if (receipt.couponDiscountCad > 0) {
    amounts.push({ kind: 'discount', label: copy.coupon(receipt.couponCode), value: cad(-receipt.couponDiscountCad) });
  }
  amounts.push({ kind: 'total', label: copy.total, value: cad(receipt.totalCad) });

  let notice: string | null = receipt.cancelled ? copy.cancelled : null;
  if (receipt.refund) {
    const date = receiptDate(receipt.refund.at, locale);
    if (receipt.refund.amountCad !== null && receipt.refund.amountCad > 0) {
      amounts.push({ kind: 'refund', label: copy.refund(date), value: cad(-receipt.refund.amountCad) });
      amounts.push({ kind: 'net', label: copy.net, value: cad(roundCad(receipt.totalCad - receipt.refund.amountCad)) });
    } else {
      // A refund with no recorded amount cannot be subtracted, only stated.
      notice = [notice, copy.refundNoAmount(date)].filter(Boolean).join(' · ');
    }
  }

  const platform = receipt.platform;
  const platformIdentity = [platform.legalName, platform.address].filter(Boolean).join(', ');
  const platformTax = copy.platformTax(platform.gstNumber, platform.qstNumber);
  const footer = [
    platformIdentity ? copy.platform([platformIdentity, platformTax].filter(Boolean).join(' — ')) : null,
    platform.supportEmail ? copy.support(platform.supportEmail) : null,
    copy.generated,
  ].filter((line): line is string => Boolean(line));

  return {
    locale,
    title: copy.title,
    numberLine: receipt.number ? copy.number(receipt.number) : null,
    orderLine: copy.order(receipt.reference),
    dateLine: receiptDateTime(receipt.issuedAt, locale),
    notice,
    seller: { label: copy.soldBy, lines: sellerLines },
    customer: { label: copy.customer, lines: customerLines },
    columns: copy.columns,
    lines: receipt.lines.map((line) => ({
      name: line.name,
      qty: String(line.qty),
      unitPrice: cad(line.unitPriceCad),
      amount: cad(line.totalCad),
    })),
    amounts,
    payment: { label: copy.payment, value: paymentLabel(receipt.payment, locale) },
    footer,
  };
}

/** `recu-R-000123.pdf` / `receipt-R-000123.pdf` — falls back to the order reference while unnumbered. */
export function receiptFileName(receipt: Receipt, locale: Locale): string {
  const stem = locale === 'fr' ? 'recu' : 'receipt';
  const id = receipt.number ?? receipt.reference.replace('#', '');
  return `${stem}-${id}.pdf`;
}
