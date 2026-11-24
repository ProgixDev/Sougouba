import { describe, expect, it } from 'vitest';

import { renderReceiptEmail } from './receipt-email.js';
import { RECEIPT_LINK_TTL_SECONDS, receiptLinkKey, signReceiptLink, verifyReceiptLink } from './receipt-link.js';
import { pdfSafe, renderReceiptPdf } from './receipt-pdf.js';
import {
  buildReceipt,
  describeReceipt,
  formatReceiptNumber,
  paymentLabel,
  receiptFileName,
  type PlatformIdentity,
  type ReceiptOrderRow,
} from './receipt.js';

/** `Intl` separates `32,50` from `$` with a no-break space, and which one depends on the ICU build. */
const plain = (value: string) => value.replace(/[  ]/g, ' ');

const NO_PLATFORM: PlatformIdentity = { legalName: null, address: null, gstNumber: null, qstNumber: null, supportEmail: null };

/** The CDC addendum's own worked example (§03): 32,50 $ of goods, 4,99 $ delivery, 42,36 $ in all. */
const ORDER: ReceiptOrderRow = {
  id: '0b9f3c1e-7d2a-4e58-9a61-3f5c8d2e4b10',
  status: 'delivered',
  created_at: '2026-11-23T19:05:00.000Z',
  customer_name: 'Aïcha Diallo',
  // Strings, as PostgREST sends `numeric` columns.
  subtotal_cad: '32.50',
  gst_cad: '1.63',
  qst_cad: '3.24',
  delivery_fee_cad: '4.99',
  total_cad: '42.36',
  points_redeemed: null,
  points_discount_cad: null,
  coupon_code: null,
  coupon_discount_cad: null,
  delivery_address_street: '4521 rue Saint-Denis',
  delivery_address_city: 'Montréal',
  delivery_address_postal_code: 'H2J 2L4',
  delivery_unit: 'App. 3',
  refunded_at: null,
  refund_amount_cad: null,
  receipt_number: 123,
};

const ITEMS = [
  { name: 'Semoule fine 1 kg', qty: 2, unitPriceCad: '3.99' },
  { name: 'Thé vert à la menthe', qty: 1, unitPriceCad: '24.52' },
];

const VENDOR = { name: 'Épicerie Atlas', city: 'Montréal', addressStreet: '1200 rue Jean-Talon Est', addressPostalCode: 'H2R 1W1' };
const REGISTRATION = { legalName: '9123-4567 Québec inc.', gstNumber: '123456789 RT0001', qstNumber: '1234567890 TQ0001' };

function receipt(overrides: Partial<ReceiptOrderRow> = {}, extra: Partial<Parameters<typeof buildReceipt>[0]> = {}) {
  return buildReceipt({
    order: { ...ORDER, ...overrides },
    items: ITEMS,
    vendor: VENDOR,
    registration: REGISTRATION,
    platform: NO_PLATFORM,
    payment: { brand: 'visa', last4: '4242', wallet: null },
    ...extra,
  });
}

describe('a receipt number', () => {
  it('is padded to six digits and grows past them', () => {
    expect(formatReceiptNumber(1)).toBe('R-000001');
    expect(formatReceiptNumber('123')).toBe('R-000123');
    expect(formatReceiptNumber(1_000_000)).toBe('R-1000000');
  });

  it('is absent rather than invented when the database has none', () => {
    // Before migration 0051 the column does not exist, and `select('*')` leaves it undefined.
    expect(formatReceiptNumber(undefined)).toBeNull();
    expect(formatReceiptNumber(null)).toBeNull();
    expect(formatReceiptNumber(0)).toBeNull();
    expect(formatReceiptNumber('abc')).toBeNull();
  });
});

describe('building a receipt', () => {
  it('reads the order’s own figures and never re-prices them', () => {
    const built = receipt();
    expect(built).toMatchObject({
      number: 'R-000123',
      subtotalCad: 32.5,
      gstCad: 1.63,
      qstCad: 3.24,
      deliveryFeeCad: 4.99,
      totalCad: 42.36,
      cancelled: false,
      refund: null,
    });
    // The stored taxes are printed as stored — 1.63, not a recomputed 1.625.
    expect(built.gstCad + built.qstCad).toBeCloseTo(4.87);
  });

  it('totals each line once, rounded to the cent', () => {
    expect(receipt().lines).toEqual([
      { name: 'Semoule fine 1 kg', qty: 2, unitPriceCad: 3.99, totalCad: 7.98 },
      { name: 'Thé vert à la menthe', qty: 1, unitPriceCad: 24.52, totalCad: 24.52 },
    ]);
    // 3 × 4.35 is 13.049999999999999 in floating point; the line still reads 13,05.
    const odd = buildReceipt({
      order: ORDER,
      items: [{ name: 'Dattes', qty: 3, unitPriceCad: '4.35' }],
      vendor: VENDOR,
      registration: null,
      platform: NO_PLATFORM,
      payment: null,
    });
    expect(odd.lines[0].totalCad).toBe(13.05);
  });

  it('survives a shop with no registration file and an order with no shop row', () => {
    const bare = receipt({}, { vendor: null, registration: null });
    expect(bare.seller).toEqual({
      name: 'Sougouba',
      legalName: null,
      street: null,
      city: null,
      postalCode: null,
      gstNumber: null,
      qstNumber: null,
    });
  });
});

describe('the receipt as it reads, in French', () => {
  it('lists the money column in the order the checkout showed it', () => {
    const doc = describeReceipt(receipt(), 'fr');
    expect(doc.amounts.map((row) => [row.kind, plain(row.label), plain(row.value)])).toEqual([
      ['base', 'Sous-total', '32,50 $'],
      ['minor', 'TPS (5 %)', '1,63 $'],
      ['minor', 'TVQ (9,975 %)', '3,24 $'],
      ['base', 'Livraison', '4,99 $'],
      ['total', 'Total payé', '42,36 $'],
    ]);
  });

  it('names the receipt, the order and the Montréal time it was placed', () => {
    const doc = describeReceipt(receipt(), 'fr');
    expect(doc.numberLine).toBe('Reçu nº R-000123');
    expect(doc.orderLine).toMatch(/^Commande #[0-9A-F]{4}$/);
    // 19:05 UTC on 23 November is 14:05 in Montréal (EST, UTC−5).
    expect(plain(doc.dateLine)).toContain('23 novembre 2026');
    expect(plain(doc.dateLine)).toMatch(/14 h 05/);
    expect(doc.notice).toBeNull();
  });

  it('prints the shop’s legal identity and tax numbers, and the delivery address', () => {
    const doc = describeReceipt(receipt(), 'fr');
    expect(doc.seller).toEqual({
      label: 'Vendu par',
      lines: [
        'Épicerie Atlas',
        '9123-4567 Québec inc.',
        '1200 rue Jean-Talon Est',
        'Montréal H2R 1W1',
        'Nº TPS : 123456789 RT0001',
        'Nº TVQ : 1234567890 TQ0001',
      ],
    });
    expect(doc.customer.lines).toEqual(['Aïcha Diallo', '4521 rue Saint-Denis', 'App. 3', 'Montréal H2J 2L4']);
  });

  it('prints no tax number a shop never gave, and no legal name that repeats the shop’s', () => {
    const doc = describeReceipt(
      receipt({}, { registration: { legalName: 'épicerie atlas', gstNumber: null, qstNumber: '  ' } }),
      'fr'
    );
    expect(doc.seller.lines).toEqual(['Épicerie Atlas', '1200 rue Jean-Talon Est', 'Montréal H2R 1W1']);
  });

  it('shows what was taken off, naming the points and the code', () => {
    const doc = describeReceipt(
      receipt({ points_redeemed: 250, points_discount_cad: '2.50', coupon_code: 'BIENVENUE', coupon_discount_cad: '5.00', total_cad: '34.86' }),
      'fr'
    );
    const rows = doc.amounts.map((row) => [row.kind, plain(row.label), plain(row.value)]);
    expect(rows.slice(4)).toEqual([
      ['discount', 'Points Sougouba (250 pts)', '-2,50 $'],
      ['discount', 'Code promo (BIENVENUE)', '-5,00 $'],
      ['total', 'Total payé', '34,86 $'],
    ]);
  });

  it('subtracts a refund and states what was paid in the end', () => {
    const doc = describeReceipt(receipt({ refunded_at: '2026-11-24T15:00:00.000Z', refund_amount_cad: '12.36' }), 'fr');
    const rows = doc.amounts.map((row) => [row.kind, plain(row.label), plain(row.value)]);
    expect(rows.slice(-3)).toEqual([
      ['total', 'Total payé', '42,36 $'],
      ['refund', 'Remboursement du 24 novembre 2026', '-12,36 $'],
      ['net', 'Montant net payé', '30,00 $'],
    ]);
  });

  it('says so when the order was cancelled, and when a refund has no recorded amount', () => {
    expect(describeReceipt(receipt({ status: 'cancelled' }), 'fr').notice).toBe('Commande annulée');
    const unknown = describeReceipt(
      receipt({ status: 'cancelled', refunded_at: '2026-11-24T15:00:00.000Z', refund_amount_cad: null }),
      'fr'
    );
    expect(plain(unknown.notice ?? '')).toBe('Commande annulée · Commande remboursée le 24 novembre 2026');
    // Nothing to subtract, so the money column ends at the total.
    expect(unknown.amounts.at(-1)?.kind).toBe('total');
  });

  it('prints Sougouba’s own identity only as far as it is configured', () => {
    expect(describeReceipt(receipt(), 'fr').footer).toEqual(['Reçu généré automatiquement par Sougouba.']);

    const full = describeReceipt(
      receipt(
        {},
        {
          platform: {
            legalName: 'Sougouba inc.',
            address: '100 rue Exemple, Montréal',
            gstNumber: '987654321 RT0001',
            qstNumber: null,
            supportEmail: 'aide@sougouba.ca',
          },
        }
      ),
      'fr'
    );
    expect(full.footer).toEqual([
      'Livraison et plateforme : Sougouba inc., 100 rue Exemple, Montréal — TPS 987654321 RT0001',
      'Une question sur cette commande ? aide@sougouba.ca',
      'Reçu généré automatiquement par Sougouba.',
    ]);
  });
});

describe('the receipt as it reads, in English', () => {
  it('uses English labels, the en-CA money format and no space before a percent sign', () => {
    const doc = describeReceipt(receipt(), 'en');
    expect(doc.title).toBe('Receipt');
    expect(doc.numberLine).toBe('Receipt no. R-000123');
    expect(doc.amounts.map((row) => [row.label, row.value])).toEqual([
      ['Subtotal', '$32.50'],
      ['GST (5%)', '$1.63'],
      ['QST (9.975%)', '$3.24'],
      ['Delivery', '$4.99'],
      ['Total paid', '$42.36'],
    ]);
    expect(doc.dateLine).toContain('November 23, 2026');
    expect(doc.seller.lines).toContain('GST no.: 123456789 RT0001');
  });
});

describe('the payment line', () => {
  it('names the card, and the wallet it came through', () => {
    expect(paymentLabel({ brand: 'visa', last4: '4242', wallet: null }, 'fr')).toBe('Visa •••• 4242');
    expect(paymentLabel({ brand: 'mastercard', last4: '4444', wallet: 'apple_pay' }, 'en')).toBe('Apple Pay · Mastercard •••• 4444');
    // A network Stripe adds later is still printed, capitalised.
    expect(paymentLabel({ brand: 'eftpos', last4: '0005', wallet: null }, 'fr')).toBe('Eftpos •••• 0005');
  });

  it('falls back to a generic line when Stripe said nothing', () => {
    expect(paymentLabel(null, 'fr')).toBe('En ligne');
    expect(paymentLabel({ brand: null, last4: null, wallet: null }, 'en')).toBe('Online');
  });
});

describe('the receipt email', () => {
  it('carries the order reference in its subject and every figure in both bodies', () => {
    const mail = renderReceiptEmail(receipt(), 'fr', 'receipt', true);
    expect(mail.subject).toMatch(/^Votre reçu Sougouba — commande #[0-9A-F]{4}$/);
    for (const body of [plain(mail.text), plain(mail.html)]) {
      expect(body).toContain('R-000123');
      expect(body).toContain('Semoule fine 1 kg');
      expect(body).toContain('42,36 $');
      expect(body).toContain('Visa •••• 4242');
    }
    expect(mail.html).toContain('Une copie PDF est jointe');
  });

  it('does not promise a PDF that could not be attached', () => {
    const mail = renderReceiptEmail(receipt(), 'fr', 'receipt', false);
    expect(mail.html).not.toContain('jointe');
    expect(mail.text).not.toContain('jointe');
  });

  it('escapes whatever a merchant or a shopper typed', () => {
    const hostile = buildReceipt({
      order: { ...ORDER, customer_name: 'Zoé <b>O’Neil</b>' },
      items: [{ name: 'Harissa <script>alert(1)</script> & co', qty: 1, unitPriceCad: '4.00' }],
      vendor: { ...VENDOR, name: 'Chez "Momo" & fils' },
      registration: null,
      platform: NO_PLATFORM,
      payment: null,
    });
    const { html } = renderReceiptEmail(hostile, 'fr', 'receipt', true);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
    expect(html).toContain('Harissa &lt;script&gt;alert(1)&lt;/script&gt; &amp; co');
    expect(html).toContain('Chez &quot;Momo&quot; &amp; fils');
    expect(html).toContain('Zoé &lt;b&gt;O’Neil&lt;/b&gt;');
  });

  it('announces a refund with its amount, in the reader’s language', () => {
    const refunded = receipt({ refunded_at: '2026-11-24T15:00:00.000Z', refund_amount_cad: '12.36' });
    const fr = renderReceiptEmail(refunded, 'fr', 'refund', true);
    expect(plain(fr.subject)).toMatch(/^Remboursement de 12,36 \$ — commande #[0-9A-F]{4}$/);
    expect(plain(fr.text)).toContain('Un remboursement de 12,36 $ a été émis');
    expect(plain(fr.text)).toContain('Montant net payé : 30,00 $');

    const en = renderReceiptEmail(refunded, 'en', 'refund', true);
    expect(en.subject).toMatch(/^Refund of \$12\.36 — order #[0-9A-F]{4}$/);
    expect(en.text).toContain('Net amount paid: $30.00');
  });
});

describe('text the PDF fonts can draw', () => {
  it('keeps French intact', () => {
    expect(pdfSafe('Épicerie « Chez Zoé » — œufs, crème brûlée • 12,50 $')).toBe(
      'Épicerie « Chez Zoé » — œufs, crème brûlée • 12,50 $'
    );
  });

  it('flattens the spaces and the minus sign Intl produces', () => {
    expect(pdfSafe('1 234,50 $')).toBe('1 234,50 $');
    expect(pdfSafe('−5,00 $')).toBe('-5,00 $');
  });

  it('keeps the base letter of an accent it cannot draw', () => {
    expect(pdfSafe('Phở bò')).toBe('Pho bò');
    expect(pdfSafe('Şiş kebap')).toBe('Sis kebap');
  });

  it('drops a script it cannot draw, and never leaves an empty cell', () => {
    expect(pdfSafe('Harissa هريسة 🌶️')).toBe('Harissa');
    expect(pdfSafe('هريسة')).toBe('—');
    expect(pdfSafe('   ')).toBe('—');
  });
});

describe('the receipt PDF', () => {
  const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

  it('renders one page for an ordinary order, in either language', async () => {
    for (const locale of ['fr', 'en'] as const) {
      const pdf = await renderReceiptPdf(receipt(), locale);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pages(pdf)).toBe(1);
    }
  });

  it('runs a long order onto further pages instead of off the first', async () => {
    const long = buildReceipt({
      order: ORDER,
      items: Array.from({ length: 70 }, (_, i) => ({ name: `Article numéro ${i + 1}`, qty: 1, unitPriceCad: '1.00' })),
      vendor: VENDOR,
      registration: REGISTRATION,
      platform: NO_PLATFORM,
      payment: null,
    });
    expect(pages(await renderReceiptPdf(long, 'fr'))).toBeGreaterThan(1);
  });

  it('renders a receipt whose every name is in a script it cannot draw', async () => {
    const arabic = buildReceipt({
      order: { ...ORDER, customer_name: 'عائشة' },
      items: [{ name: 'هريسة', qty: 1, unitPriceCad: '4.00' }],
      vendor: { ...VENDOR, name: 'بقالة الأطلس' },
      registration: null,
      platform: NO_PLATFORM,
      payment: null,
    });
    expect(pages(await renderReceiptPdf(arabic, 'fr'))).toBe(1);
  });

  it('is named after the receipt, or the order while it has no number', () => {
    expect(receiptFileName(receipt(), 'fr')).toBe('recu-R-000123.pdf');
    expect(receiptFileName(receipt(), 'en')).toBe('receipt-R-000123.pdf');
    expect(receiptFileName(receipt({ receipt_number: undefined }), 'fr')).toMatch(/^recu-[0-9A-F]{4}\.pdf$/);
  });
});

describe('a receipt link', () => {
  const key = receiptLinkKey('service-role-key-for-tests');
  const now = new Date('2026-11-24T10:00:00.000Z');
  const orderId = ORDER.id;

  it('names one order and the language to draw it in', async () => {
    const { token, expiresAt } = await signReceiptLink({ orderId, locale: 'en' }, key, now);
    expect(await verifyReceiptLink(token, key, now)).toEqual({ orderId, locale: 'en' });
    expect(Date.parse(expiresAt) - now.getTime()).toBe(RECEIPT_LINK_TTL_SECONDS * 1000);
  });

  it('dies when its time is up', async () => {
    const { token } = await signReceiptLink({ orderId, locale: 'fr' }, key, now);
    const justBefore = new Date(now.getTime() + (RECEIPT_LINK_TTL_SECONDS - 1) * 1000);
    const justAfter = new Date(now.getTime() + (RECEIPT_LINK_TTL_SECONDS + 1) * 1000);
    expect(await verifyReceiptLink(token, key, justBefore)).not.toBeNull();
    expect(await verifyReceiptLink(token, key, justAfter)).toBeNull();
  });

  it('cannot be repointed at another order', async () => {
    const { token } = await signReceiptLink({ orderId, locale: 'fr' }, key, now);
    const [header, payload, signature] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    const forged = Buffer.from(JSON.stringify({ ...claims, sub: '11111111-1111-4111-8111-111111111111' })).toString('base64url');
    expect(await verifyReceiptLink(`${header}.${forged}.${signature}`, key, now)).toBeNull();
  });

  it('is refused under another key, and as plain garbage', async () => {
    const { token } = await signReceiptLink({ orderId, locale: 'fr' }, key, now);
    expect(await verifyReceiptLink(token, receiptLinkKey('another-secret'), now)).toBeNull();
    expect(await verifyReceiptLink('not-a-token', key, now)).toBeNull();
    expect(await verifyReceiptLink('', key, now)).toBeNull();
  });

  it('derives the same key from the same secret, and a different one from another', () => {
    expect(Buffer.from(receiptLinkKey('s')).equals(Buffer.from(receiptLinkKey('s')))).toBe(true);
    expect(Buffer.from(receiptLinkKey('s')).equals(Buffer.from(receiptLinkKey('t')))).toBe(false);
    expect(receiptLinkKey('s')).toHaveLength(32);
  });
});
