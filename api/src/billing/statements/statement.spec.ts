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
  type LedgerRow,
  type Statement,
} from './statement.js';

const plain = (value: string) => value.replace(/[  ]/g, ' ');

/**
 * The addendum's worked order as a line of the shop's account: 32,50 $ of goods
 * and 4,87 $ of taxes, less the 12 % commission (3,90 $) — 33,47 $ to the shop.
 */
const order = (over: Partial<LedgerRow> = {}): LedgerRow => ({
  kind: 'order',
  at: '2026-11-12T17:30:00.000Z',
  ref_id: '0b9f3c1e-7d2a-4e58-9a61-3f5c8d2e4b10',
  amount_cad: '33.47',
  receipt_number: 253,
  subtotal_cad: '32.50',
  gst_cad: '1.63',
  qst_cad: '3.24',
  coupon_discount_cad: null,
  ...over,
});

/** The shop's part of a refund of half an order: half its share. */
const refund = (over: Partial<LedgerRow> = {}): LedgerRow => ({
  kind: 'refund',
  at: '2026-11-20T15:00:00.000Z',
  ref_id: '11111111-1111-4111-8111-111111111111',
  amount_cad: '-16.74',
  receipt_number: 240,
  ...over,
});

/** A Friday's payment. */
const payout = (over: Partial<LedgerRow> = {}): LedgerRow => ({
  kind: 'payout',
  at: '2026-11-27T13:00:00.000Z',
  ref_id: '22222222-2222-4222-8222-222222222222',
  amount_cad: '-33.47',
  ...over,
});

const month = (entries: LedgerRow[], openingCad: number | string = 0) => buildStatement({ openingCad, entries, commissionRate: 0.12 });

const statement = (entries: LedgerRow[], openingCad: number | string = 0): Statement => ({
  number: 'RM-000007',
  period: '2026-11',
  issuedAt: '2026-12-01T11:00:00.000Z',
  shop: { name: 'Épicerie Atlas', legalName: '9123-4567 Québec inc.', street: '1200 rue Jean-Talon Est', city: 'Montréal', postalCode: 'H2R 1W1' },
  platform: { legalName: null, address: null, supportEmail: null },
  ...month(entries, openingCad),
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
  it('owes the shop its share of what it delivered: goods and taxes, less the commission', () => {
    expect(month([order()]).totals).toEqual({
      orderCount: 1,
      goodsCad: 32.5,
      gstCad: 1.63,
      qstCad: 3.24,
      couponsCad: 0,
      commissionCad: 3.9,
      commissionRate: 0.12,
      // 32,50 + 4,87 − 3,90. The delivery fee is not the shop's and is not here.
      earnedCad: 33.47,
      refundCount: 0,
      refundsCad: 0,
      openingCad: 0,
      payoutCount: 0,
      paidCad: 0,
      balanceCad: 33.47,
    });
  });

  it('takes the shop’s own promo code off its share, with the commission still on the full price', () => {
    const { totals, lines } = month([order({ coupon_discount_cad: '3.25', amount_cad: '30.22' })]);
    expect(totals).toMatchObject({ couponsCad: 3.25, commissionCad: 3.9, commissionRate: 0.12, earnedCad: 30.22 });
    expect(lines.orders[0]).toMatchObject({ goodsCad: 32.5, taxesCad: 4.87, couponCad: 3.25, commissionCad: 3.9, shareCad: 30.22 });
  });

  it('takes the shop’s part of a refund off the month it was given in', () => {
    const { totals, lines } = month([order(), refund()]);
    expect(totals).toMatchObject({ refundCount: 1, refundsCad: 16.74, balanceCad: 16.73 });
    expect(lines.refunds[0]).toMatchObject({ amountCad: 16.74, receiptNumber: 240 });
  });

  it('takes off what was sent, and closes on nothing when everything was', () => {
    const { totals, lines } = month([order(), payout()]);
    expect(totals).toMatchObject({ payoutCount: 1, paidCad: 33.47, balanceCad: 0 });
    expect(lines.payouts).toEqual([{ payoutId: '22222222-2222-4222-8222-222222222222', paidAt: '2026-11-27T13:00:00.000Z', amountCad: 33.47 }]);
  });

  it('carries in what was owed when the month began', () => {
    expect(month([order()], '20.00').totals).toMatchObject({ openingCad: 20, earnedCad: 33.47, balanceCad: 53.47 });
  });

  it('closes on a debt when a refund follows a payment', () => {
    // Paid for the order last month; half of it refunded this month.
    expect(month([refund()]).totals.balanceCad).toBe(-16.74);
  });

  it('opens each month where the last one closed', () => {
    const november = month([order(), order({ ref_id: 'b', at: '2026-11-29T18:00:00Z' }), payout()]);
    expect(november.totals.balanceCad).toBe(33.47);

    // December: the order delivered after November's last Friday is paid, and a new one comes in.
    const december = month([payout({ at: '2026-12-04T13:00:00Z' }), order({ ref_id: 'c', at: '2026-12-10T18:00:00Z' })], november.totals.balanceCad);
    expect(december.totals).toMatchObject({ openingCad: 33.47, paidCad: 33.47, earnedCad: 33.47, balanceCad: 33.47 });
  });

  it('reads the commission off the share, so a line always adds up', () => {
    // An order placed when the commission was 10 %: 3,25 $, fixed then.
    const [line] = month([order({ amount_cad: '34.12' })]).lines.orders;
    expect(line.commissionCad).toBe(3.25);
    expect(line.goodsCad + line.taxesCad - line.couponCad - line.commissionCad).toBeCloseTo(line.shareCad, 2);
  });

  it('names the rate only when the whole month shares one', () => {
    // 100 $ of goods at 15 %: 100 + 14,98 − 15.
    const mixed = month([order(), order({ ref_id: 'b', subtotal_cad: '100.00', gst_cad: '5.00', qst_cad: '9.98', amount_cad: '99.98' })]);
    expect(mixed.totals.commissionRate).toBeNull();
    expect(mixed.totals.commissionCad).toBe(18.9);
  });

  it('sums many orders without drifting by a cent', () => {
    // 14,10 + 0,71 + 1,41 − 1,69 = 14,53 each.
    const many = Array.from({ length: 300 }, (_, i) =>
      order({ ref_id: `order-${i}`, subtotal_cad: '14.10', gst_cad: '0.71', qst_cad: '1.41', amount_cad: '14.53' })
    );
    const { totals } = month(many);
    expect(totals.goodsCad).toBe(4230);
    expect(totals.commissionCad).toBe(507);
    expect(totals.earnedCad).toBe(4359);
    expect(totals.balanceCad).toBe(4359);
  });

  it('lists orders in the order they were delivered', () => {
    const { lines } = month([order({ ref_id: 'late', at: '2026-11-28T12:00:00Z' }), order({ ref_id: 'early', at: '2026-11-02T12:00:00Z' })]);
    expect(lines.orders.map((o) => o.orderId)).toEqual(['early', 'late']);
  });

  it('knows a month in which nothing moved, which is not sent', () => {
    expect(isEmpty(month([]).totals)).toBe(true);
    // A balance carried over with nothing happening to it is still nothing happening.
    expect(isEmpty(month([], 40).totals)).toBe(true);
    expect(isEmpty(month([refund()]).totals)).toBe(false);
    // A month with only a payment in it: the shop should have a record of what it received.
    expect(isEmpty(month([payout()], 33.47).totals)).toBe(false);
  });

  it('keeps the balance formula in one place', () => {
    expect(balanceOf({ openingCad: 20, earnedCad: 100, refundsCad: 10, paidCad: 50 })).toBe(60);
  });
});

describe('the statement as it reads', () => {
  it('walks from what the orders were worth to what is owed', () => {
    const doc = describeStatement(statement([order(), refund()]), 'fr');
    expect(doc.heading).toBe('Relevé de novembre 2026');
    expect(doc.numberLine).toBe('Relevé nº RM-000007');
    expect(doc.figures.map((f) => [f.kind, plain(f.label), plain(f.value)])).toEqual([
      ['base', '1 commande livrée', ''],
      ['minor', 'Ventes de produits', '32,50 $'],
      ['minor', 'TPS et TVQ perçues', '4,87 $'],
      ['minor', 'Commission Sougouba (12 %)', '-3,90 $'],
      ['total', 'Votre part des ventes', '33,47 $'],
      ['minus', 'Remboursement, votre part', '-16,74 $'],
      ['balance', 'Solde à vous verser', '16,73 $'],
    ]);
    expect(doc.balanceNote).toBe('Ce montant vous est dû et n’a pas encore été versé.');
    expect(doc.orders.rows[0].slice(2).map(plain)).toEqual(['37,37 $', '-3,90 $', '33,47 $']);
    expect(doc.payouts).toBeNull();
  });

  it('shows what was carried in and what was sent, and says so when nothing is left', () => {
    const doc = describeStatement(statement([order(), payout({ amount_cad: '-53.47' })], 20), 'fr');
    expect(doc.figures.slice(-3).map((f) => [f.kind, plain(f.label), plain(f.value)])).toEqual([
      ['plus', 'Solde reporté du mois précédent', '20,00 $'],
      ['minus', 'Versé sur votre compte', '-53,47 $'],
      ['balance', 'Solde à vous verser', '0,00 $'],
    ]);
    expect(doc.balanceNote).toBe('Tout a été versé : aucun solde.');
    expect(doc.payouts?.rows.map((row) => row.slice(1).map(plain))).toEqual([['Virement Stripe', '53,47 $']]);
  });

  it('turns the balance round when the shop owes', () => {
    const doc = describeStatement(statement([refund()]), 'fr');
    const balance = doc.figures.at(-1)!;
    expect(balance.label).toBe('Solde dû à Sougouba');
    // Stated as a positive amount under a label that says which way it runs.
    expect(plain(balance.value)).toBe('16,74 $');
    expect(doc.balanceNote).toContain('retenue sur vos prochains versements');
  });

  it('says whose the delivery fee and the points are, that it is not a tax invoice, and that the subscription is billed apart', () => {
    const doc = describeStatement(statement([order()]), 'fr');
    expect(doc.footer[0]).toContain('frais de livraison reviennent à Sougouba');
    expect(doc.footer).toContain('Ce relevé est un état de compte. Ce n’est pas une facture fiscale.');
    expect(doc.footer.some((line) => line.includes('abonnement mensuel'))).toBe(true);
  });

  it('reads in English too', () => {
    const doc = describeStatement(statement([order(), order({ ref_id: 'b' })]), 'en');
    expect(doc.heading).toBe('Statement for November 2026');
    expect(doc.figures[0].label).toBe('2 orders delivered');
    expect(doc.figures.at(-1)).toMatchObject({ label: 'Balance owed to you', value: '$66.94' });
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
    expect(plain(mail.html)).toContain('33,47 $');
    expect(mail.html).toContain('PDF joint');
    expect(plain(mail.text)).toContain('Solde à vous verser : 33,47 $');
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
    const small = await renderStatementPdf(statement([order(), refund(), payout()]), 'fr');
    expect(small.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pages(small)).toBe(1);
    const busy = Array.from({ length: 120 }, (_, i) => order({ ref_id: `order-${i}` }));
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
