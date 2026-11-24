import { describe, expect, it } from 'vitest';

import { signReceiptLink, signStatementLink, receiptLinkKey, verifyReceiptLink, verifyStatementLink } from '../../orders/receipts/receipt-link.js';
import { renderStatementEmail } from './statement-email.js';
import { renderStatementPdf } from './statement-pdf.js';
import {
  balanceOf,
  buildStatement,
  currentPeriod,
  describeStatement,
  formatStatementNumber,
  isEmpty,
  periodLabel,
  periodWindow,
  previousPeriod,
  statementFileName,
  type Statement,
  type StatementOrderRow,
  type StatementRefundRow,
} from './statement.js';

const plain = (value: string) => value.replace(/[  ]/g, ' ');

/** The addendum's worked order: 32,50 $ of goods, 42,36 $ in all, 12 % commission = 3,90 $. */
const order = (over: Partial<StatementOrderRow> = {}): StatementOrderRow => ({
  id: '0b9f3c1e-7d2a-4e58-9a61-3f5c8d2e4b10',
  receipt_number: 253,
  deliveredAt: '2026-11-12T17:30:00.000Z',
  subtotal_cad: '32.50',
  gst_cad: '1.63',
  qst_cad: '3.24',
  delivery_fee_cad: '4.99',
  total_cad: '42.36',
  points_discount_cad: null,
  coupon_discount_cad: null,
  commission_cad: '3.90',
  merchant_paid_cad: '0.00',
  ...over,
});

const refund = (over: Partial<StatementRefundRow> = {}): StatementRefundRow => ({
  id: '11111111-1111-4111-8111-111111111111',
  receipt_number: 240,
  refunded_at: '2026-11-20T15:00:00.000Z',
  refund_amount_cad: '12.36',
  total_cad: '42.36',
  ...over,
});

const statement = (orders: StatementOrderRow[], refunds: StatementRefundRow[] = []): Statement => ({
  number: 'RM-000007',
  period: '2026-11',
  issuedAt: '2026-12-01T11:00:00.000Z',
  shop: { name: 'Épicerie Atlas', legalName: '9123-4567 Québec inc.', street: '1200 rue Jean-Talon Est', city: 'Montréal', postalCode: 'H2R 1W1' },
  platform: { legalName: null, address: null, supportEmail: null },
  ...buildStatement({ orders, refunds, commissionRate: 0.12 }),
});

describe('the month a statement covers', () => {
  it('runs from Montréal midnight to Montréal midnight', () => {
    const november = periodWindow('2026-11');
    expect(november).toMatchObject({ period: '2026-11', startDate: '2026-11-01', endDate: '2026-12-01' });
    // 1 November 2026 is the day the clocks go back, so it starts on summer
    // time (UTC−4) and 1 December starts on winter time (UTC−5).
    expect(november.start.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(november.end.toISOString()).toBe('2026-12-01T05:00:00.000Z');
  });

  it('rolls December into January', () => {
    expect(periodWindow('2026-12')).toMatchObject({ startDate: '2026-12-01', endDate: '2027-01-01' });
  });

  it('refuses anything that is not a month', () => {
    for (const bad of ['2026-13', '2026-00', '2026-1', '26-11', 'novembre']) expect(() => periodWindow(bad)).toThrow();
  });

  it('is told apart by Montréal’s calendar, not UTC’s', () => {
    // 03:00 UTC on 1 December is still 30 November in Montréal.
    const lateEvening = new Date('2026-12-01T03:00:00.000Z');
    expect(currentPeriod(lateEvening)).toBe('2026-11');
    expect(previousPeriod(lateEvening)).toBe('2026-10');
    // The job at 06:00 Montréal on the 1st closes the month just ended.
    expect(previousPeriod(new Date('2026-12-01T11:00:00.000Z'))).toBe('2026-11');
    expect(previousPeriod(new Date('2027-01-01T11:00:00.000Z'))).toBe('2026-12');
  });
});

describe('adding up a month', () => {
  it('owes the shop everything its customers paid, less the commission, when Stripe sent nothing', () => {
    const { totals } = buildStatement({ orders: [order()], refunds: [], commissionRate: 0.12 });
    expect(totals).toEqual({
      orderCount: 1,
      goodsCad: 32.5,
      gstCad: 1.63,
      qstCad: 3.24,
      deliveryCad: 4.99,
      discountsCad: 0,
      collectedCad: 42.36,
      refundCount: 0,
      refundsCad: 0,
      commissionCad: 3.9,
      commissionRate: 0.12,
      paidCad: 0,
      // 42,36 − 3,90
      balanceCad: 38.46,
    });
  });

  it('owes nothing more on an order Stripe already split', () => {
    const { totals } = buildStatement({ orders: [order({ merchant_paid_cad: '38.46' })], refunds: [], commissionRate: 0.12 });
    expect(totals.paidCad).toBe(38.46);
    expect(totals.balanceCad).toBe(0);
  });

  it('takes a refund off the month it was issued in', () => {
    const { totals, lines } = buildStatement({ orders: [order()], refunds: [refund()], commissionRate: 0.12 });
    expect(totals).toMatchObject({ refundCount: 1, refundsCad: 12.36, balanceCad: 26.1 });
    expect(lines.refunds[0]).toMatchObject({ amountCad: 12.36, receiptNumber: 240 });
  });

  it('runs negative when refunds exceed what was still owed', () => {
    // Everything already paid out by Stripe, then a full refund from Sougouba's balance.
    const { totals } = buildStatement({
      orders: [order({ merchant_paid_cad: '38.46' })],
      refunds: [refund({ refund_amount_cad: '42.36' })],
      commissionRate: 0.12,
    });
    expect(totals.balanceCad).toBe(-42.36);
  });

  it('counts a refund with no recorded amount as the whole order', () => {
    const { totals } = buildStatement({ orders: [], refunds: [refund({ refund_amount_cad: null })], commissionRate: 0.12 });
    expect(totals.refundsCad).toBe(42.36);
  });

  it('carries discounts as part of what customers paid, not as a separate deduction', () => {
    const discounted = order({ points_discount_cad: '2.50', coupon_discount_cad: '5.00', total_cad: '34.86' });
    const { totals } = buildStatement({ orders: [discounted], refunds: [], commissionRate: 0.12 });
    expect(totals.discountsCad).toBe(7.5);
    // The shop receives what the shopper actually paid, less the commission on the full goods.
    expect(totals.balanceCad).toBe(30.96);
  });

  it('falls back to the current rate for an order with no recorded commission', () => {
    const { totals } = buildStatement({ orders: [order({ commission_cad: null, merchant_paid_cad: null })], refunds: [], commissionRate: 0.12 });
    expect(totals.commissionCad).toBe(3.9);
  });

  it('names the rate only when the whole month shares one', () => {
    const mixed = buildStatement({
      orders: [order(), order({ id: 'b', subtotal_cad: '100.00', commission_cad: '15.00', total_cad: '120.00' })],
      refunds: [],
      commissionRate: 0.12,
    });
    expect(mixed.totals.commissionRate).toBeNull();
    expect(mixed.totals.commissionCad).toBe(18.9);
  });

  it('sums many orders without drifting by a cent', () => {
    const many = Array.from({ length: 300 }, (_, i) => order({ id: `order-${i}`, total_cad: '19.99', subtotal_cad: '14.10', commission_cad: '1.69' }));
    const { totals } = buildStatement({ orders: many, refunds: [], commissionRate: 0.12 });
    expect(totals.collectedCad).toBe(5997);
    expect(totals.commissionCad).toBe(507);
    expect(totals.balanceCad).toBe(5490);
  });

  it('lists orders in the order they were delivered', () => {
    const { lines } = buildStatement({
      orders: [order({ id: 'late', deliveredAt: '2026-11-28T12:00:00Z' }), order({ id: 'early', deliveredAt: '2026-11-02T12:00:00Z' })],
      refunds: [],
      commissionRate: 0.12,
    });
    expect(lines.orders.map((o) => o.orderId)).toEqual(['early', 'late']);
  });

  it('knows an empty month, which is not sent', () => {
    expect(isEmpty(buildStatement({ orders: [], refunds: [], commissionRate: 0.12 }).totals)).toBe(true);
    expect(isEmpty(buildStatement({ orders: [], refunds: [refund()], commissionRate: 0.12 }).totals)).toBe(false);
  });

  it('keeps the balance formula in one place', () => {
    expect(balanceOf({ collectedCad: 100, refundsCad: 10, commissionCad: 12, paidCad: 50 })).toBe(28);
  });
});

describe('the statement as it reads', () => {
  it('walks from what came in to what is owed', () => {
    const doc = describeStatement(statement([order()], [refund()]), 'fr');
    expect(doc.heading).toBe('Relevé de novembre 2026');
    expect(doc.numberLine).toBe('Relevé nº RM-000007');
    expect(doc.figures.map((f) => [f.kind, plain(f.label), plain(f.value)])).toEqual([
      ['base', '1 commande livrée', ''],
      ['minor', 'Ventes de produits', '32,50 $'],
      ['minor', 'TPS et TVQ perçues', '4,87 $'],
      ['minor', 'Frais de livraison', '4,99 $'],
      ['total', 'Total payé par les clients', '42,36 $'],
      ['minus', 'Remboursement', '-12,36 $'],
      ['minus', 'Commission Sougouba (12 %)', '-3,90 $'],
      ['balance', 'Solde à vous verser', '26,10 $'],
    ]);
    expect(doc.balanceNote).toBe('Ce montant vous est dû et n’a pas encore été versé.');
  });

  it('shows what Stripe already paid, and says so when nothing is left', () => {
    const doc = describeStatement(statement([order({ merchant_paid_cad: '38.46' })]), 'fr');
    expect(doc.figures.map((f) => plain(f.label))).toContain('Déjà versé par Stripe');
    expect(doc.balanceNote).toBe('Tout a été versé : aucun solde.');
  });

  it('turns the balance round when the shop owes', () => {
    const doc = describeStatement(statement([], [refund()]), 'fr');
    const balance = doc.figures.at(-1)!;
    expect(balance.label).toBe('Solde dû à Sougouba');
    // Stated as a positive amount under a label that says which way it runs.
    expect(plain(balance.value)).toBe('12,36 $');
  });

  it('says it is not a tax invoice, and that the subscription is billed apart', () => {
    const doc = describeStatement(statement([order()]), 'fr');
    expect(doc.footer).toContain('Ce relevé est un état de compte. Ce n’est pas une facture fiscale.');
    expect(doc.footer.some((line) => line.includes('abonnement mensuel'))).toBe(true);
  });

  it('reads in English too', () => {
    const doc = describeStatement(statement([order(), order({ id: 'b' })]), 'en');
    expect(doc.heading).toBe('Statement for November 2026');
    expect(doc.figures[0].label).toBe('2 orders delivered');
    expect(doc.figures.at(-1)).toMatchObject({ label: 'Balance owed to you', value: '$76.92' });
    expect(periodLabel('2026-11', 'en')).toBe('November 2026');
  });

  it('elides before a month that starts with a vowel', () => {
    const october = { ...statement([order()]), period: '2026-10' as const };
    expect(describeStatement(october, 'fr').heading).toBe('Relevé d’octobre 2026');
    expect(describeStatement({ ...october, period: '2026-08' as const }, 'fr').heading).toBe('Relevé d’août 2026');
    expect(describeStatement({ ...october, period: '2026-03' as const }, 'fr').heading).toBe('Relevé de mars 2026');
  });

  it('numbers and names its file', () => {
    expect(formatStatementNumber(7)).toBe('RM-000007');
    expect(formatStatementNumber(null)).toBeNull();
    expect(statementFileName(statement([order()]), 'fr')).toBe('releve-2026-11-RM-000007.pdf');
    expect(statementFileName(statement([order()]), 'en')).toBe('statement-2026-11-RM-000007.pdf');
  });
});

describe('the statement email and PDF', () => {
  it('puts the balance in the subject line’s preview and on the slab', () => {
    const mail = renderStatementEmail(statement([order()]), 'fr', true);
    expect(mail.subject).toBe('Relevé de novembre 2026 — Sougouba');
    expect(plain(mail.html)).toContain('Solde à vous verser');
    expect(plain(mail.html)).toContain('38,46 $');
    expect(mail.html).toContain('PDF joint');
    expect(plain(mail.text)).toContain('Solde à vous verser : 38,46 $');
    // Written on the shared sheet, with its two inline images.
    expect(mail.attachments.map((a) => a.cid)).toHaveLength(2);
  });

  it('does not promise a PDF that could not be attached, and escapes the shop’s name', () => {
    const hostile = { ...statement([order()]), shop: { ...statement([order()]).shop, name: 'Chez <b>Momo</b> & fils' } };
    const mail = renderStatementEmail(hostile, 'fr', false);
    expect(mail.html).not.toContain('PDF joint');
    expect(mail.html).toContain('Chez &lt;b&gt;Momo&lt;/b&gt; &amp; fils');
  });

  it('draws one page for an ordinary month and more for a busy one', async () => {
    const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
    const small = await renderStatementPdf(statement([order()], [refund()]), 'fr');
    expect(small.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pages(small)).toBe(1);
    const busy = Array.from({ length: 120 }, (_, i) => order({ id: `order-${i}` }));
    expect(pages(await renderStatementPdf(statement(busy), 'en'))).toBeGreaterThan(1);
  });
});

describe('a statement link', () => {
  const key = receiptLinkKey('service-role-key-for-tests');
  const now = new Date('2026-12-01T12:00:00.000Z');
  const id = '0b9f3c1e-7d2a-4e58-9a61-3f5c8d2e4b10';

  it('opens a statement and nothing else', async () => {
    const { token } = await signStatementLink({ statementId: id, locale: 'en' }, key, now);
    expect(await verifyStatementLink(token, key, now)).toEqual({ statementId: id, locale: 'en' });
    // The same id as an order id must not make it a receipt link.
    expect(await verifyReceiptLink(token, key, now)).toBeNull();
  });

  it('is not opened by a receipt link', async () => {
    const { token } = await signReceiptLink({ orderId: id, locale: 'fr' }, key, now);
    expect(await verifyStatementLink(token, key, now)).toBeNull();
  });
});
