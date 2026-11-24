import PDFDocument from 'pdfkit';

import type { Locale } from '../../notifications/messages.js';
import { describeReceipt, labelSeparator, type AmountKind, type Receipt, type ReceiptDocument } from './receipt.js';

/**
 * The receipt as a PDF — what the app opens from an order, and what the email
 * carries as an attachment.
 *
 * Rendered on demand and never stored. An order already snapshots everything a
 * receipt prints, so the same order always renders the same document, and
 * there is no bucket of customer PDFs to secure, back up or purge.
 *
 * Drawn with PDFKit's built-in Helvetica rather than an embedded font: no
 * font file to ship in the image, and a receipt of 2–3 KB instead of 60.
 * The price of that is the character set — see `pdfSafe`.
 */

const MARGIN = 50;
/** US Letter, the paper a Québec shopper's printer holds. */
const PAGE_SIZE = 'LETTER';

const REGULAR = 'Helvetica';
const BOLD = 'Helvetica-Bold';

/** The app's palette, as in the email. */
const COLOR = { brand: '#1C5439', text: '#1F2421', muted: '#6B716D', border: '#DDD8CF', refund: '#B42318' };

type Doc = InstanceType<typeof PDFDocument>;

export function renderReceiptPdf(receipt: Receipt, locale: Locale): Promise<Buffer> {
  const view = describeReceipt(receipt, locale);

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: PAGE_SIZE,
      margin: MARGIN,
      info: {
        Title: pdfSafe([view.numberLine ?? view.title, 'Sougouba'].join(' — ')),
        Author: 'Sougouba',
        Subject: pdfSafe(view.orderLine),
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      draw(doc, view);
      doc.end();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

// ── characters ──────────────────────────────────────────────────────────────

/**
 * The code points of Windows-1252 that sit outside Latin-1 — the full set the
 * built-in PDF fonts can draw, together with U+0020–U+007E and U+00A0–U+00FF.
 */
const WIN_ANSI_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019,
  0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

const drawable = (code: number): boolean =>
  (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(code);

/**
 * Text the built-in fonts can actually draw.
 *
 * They cover Windows-1252 — French in full, accents and `œ` included — and
 * nothing else. PDFKit does not refuse a character outside it; it writes the
 * wrong glyph, so an unfiltered name would print as noise. Three steps:
 *
 * - the spaces `Intl` puts inside `1 234,50 $` (narrow no-break, no-break) and
 *   the typographic minus become their plain forms;
 * - a letter that only *carries* an unsupported accent keeps its base letter
 *   (`Phở` → `Pho`), which is still the product's name;
 * - anything left — Arabic, emoji — is dropped, and a name made only of such
 *   characters prints as a dash rather than as an empty cell.
 *
 * ⚠️ A shop whose products are named in Arabic script alone gets dashes here.
 * The fix is an embedded Unicode font with shaping, which is a different
 * renderer, not a tweak to this one.
 */
export function pdfSafe(value: string): string {
  let out = '';
  for (const char of value.normalize('NFC')) {
    const code = char.codePointAt(0)!;
    if (code === 0x202f || code === 0x00a0 || code === 0x2007 || code === 0x2009) out += ' ';
    else if (code === 0x2212 || code === 0x2010 || code === 0x2011) out += '-';
    else if (code === 0x09 || code === 0x0a || code === 0x0d) out += ' ';
    else if (drawable(code)) out += char;
    else {
      // Decompose, drop the combining marks, keep whatever base letters remain drawable.
      for (const part of char.normalize('NFD')) {
        const partCode = part.codePointAt(0)!;
        if (!/\p{M}/u.test(part) && drawable(partCode)) out += part;
      }
    }
  }
  const cleaned = out.replace(/ {2,}/g, ' ').trim();
  return cleaned || '—';
}

// ── layout ──────────────────────────────────────────────────────────────────

/** Right-hand columns of the lines table, and the gap between any two columns. */
const COL = { qty: 36, unitPrice: 86, amount: 80, gap: 10 };
/** Room kept at the foot of every page for the footer block. */
const FOOTER_RESERVE = 64;

function draw(doc: Doc, view: ReceiptDocument): void {
  const left = MARGIN;
  const right = doc.page.width - MARGIN;
  const width = right - left;
  const bottom = () => doc.page.height - MARGIN - FOOTER_RESERVE;

  const rule = (y: number, color = COLOR.border) => {
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.6).strokeColor(color).stroke();
  };

  // ── header ────────────────────────────────────────────────────────────────
  let y = MARGIN;
  doc.font(BOLD).fontSize(22).fillColor(COLOR.brand).text('Sougouba', left, y, { lineBreak: false });
  doc.font(BOLD).fontSize(15).fillColor(COLOR.text).text(pdfSafe(view.title).toUpperCase(), left, y + 4, { width, align: 'right' });

  let metaY = y + 26;
  for (const line of [view.numberLine, view.orderLine, view.dateLine]) {
    if (!line) continue;
    doc.font(REGULAR).fontSize(9.5).fillColor(COLOR.muted).text(pdfSafe(line), left, metaY, { width, align: 'right' });
    metaY += 13;
  }
  y = metaY + 8;
  rule(y);
  y += 16;

  if (view.notice) {
    doc.font(BOLD).fontSize(10.5).fillColor(COLOR.refund).text(pdfSafe(view.notice), left, y, { width });
    y = doc.y + 12;
  }

  // ── seller and customer, side by side ─────────────────────────────────────
  const half = (width - 24) / 2;
  const party = (block: { label: string; lines: string[] }, x: number): number => {
    doc.font(REGULAR).fontSize(8).fillColor(COLOR.muted).text(pdfSafe(block.label).toUpperCase(), x, y, { width: half, characterSpacing: 0.6 });
    let lineY = doc.y + 3;
    block.lines.forEach((line, index) => {
      doc
        .font(index === 0 ? BOLD : REGULAR)
        .fontSize(index === 0 ? 10.5 : 9.5)
        .fillColor(index === 0 ? COLOR.text : COLOR.muted)
        .text(pdfSafe(line), x, lineY, { width: half });
      lineY = doc.y + 2;
    });
    return lineY;
  };
  y = Math.max(party(view.seller, left), party(view.customer, left + half + 24)) + 18;

  // ── lines ─────────────────────────────────────────────────────────────────
  const amountX = right - COL.amount;
  const unitX = amountX - COL.gap - COL.unitPrice;
  const qtyX = unitX - COL.gap - COL.qty;
  const itemWidth = qtyX - COL.gap - left;

  const tableHeader = () => {
    doc.font(REGULAR).fontSize(8).fillColor(COLOR.muted);
    const opts = { characterSpacing: 0.6 };
    doc.text(pdfSafe(view.columns.item).toUpperCase(), left, y, { ...opts, width: itemWidth });
    doc.text(pdfSafe(view.columns.qty).toUpperCase(), qtyX, y, { ...opts, width: COL.qty, align: 'right' });
    doc.text(pdfSafe(view.columns.unitPrice).toUpperCase(), unitX, y, { ...opts, width: COL.unitPrice, align: 'right' });
    doc.text(pdfSafe(view.columns.amount).toUpperCase(), amountX, y, { ...opts, width: COL.amount, align: 'right' });
    y += 14;
    rule(y);
    y += 8;
  };
  tableHeader();

  for (const line of view.lines) {
    const name = pdfSafe(line.name);
    doc.font(REGULAR).fontSize(10);
    const rowHeight = Math.max(doc.heightOfString(name, { width: itemWidth }), 12);
    // A long order runs onto a second page with its column headings repeated,
    // rather than letting PDFKit break a row in half wherever the page ends.
    if (y + rowHeight > bottom()) {
      doc.addPage();
      y = MARGIN;
      tableHeader();
    }
    doc.font(REGULAR).fontSize(10).fillColor(COLOR.text).text(name, left, y, { width: itemWidth });
    doc.fillColor(COLOR.muted).text(pdfSafe(line.qty), qtyX, y, { width: COL.qty, align: 'right' });
    doc.text(pdfSafe(line.unitPrice), unitX, y, { width: COL.unitPrice, align: 'right' });
    doc.fillColor(COLOR.text).text(pdfSafe(line.amount), amountX, y, { width: COL.amount, align: 'right' });
    y += rowHeight + 6;
    rule(y, '#EEEAE3');
    y += 7;
  }

  // ── the money column ──────────────────────────────────────────────────────
  const STYLE: Record<AmountKind, { font: string; size: number; label: string; value: string; height: number; indent: number }> = {
    base: { font: REGULAR, size: 10, label: COLOR.muted, value: COLOR.text, height: 16, indent: 0 },
    minor: { font: REGULAR, size: 9, label: COLOR.muted, value: COLOR.muted, height: 14, indent: 10 },
    discount: { font: REGULAR, size: 10, label: COLOR.brand, value: COLOR.brand, height: 16, indent: 0 },
    total: { font: BOLD, size: 12, label: COLOR.text, value: COLOR.text, height: 22, indent: 0 },
    refund: { font: REGULAR, size: 10, label: COLOR.refund, value: COLOR.refund, height: 16, indent: 0 },
    net: { font: BOLD, size: 10.5, label: COLOR.text, value: COLOR.text, height: 18, indent: 0 },
  };
  const blockWidth = 300;
  const blockX = right - blockWidth;
  const valueWidth = 96;
  // Measured, not assumed: a label that wraps ("Remboursement du 24 novembre
  // 2026" under a long promo code) takes the height it needs instead of being
  // overprinted by the row below it.
  const rows = view.amounts.map((row) => {
    const style = STYLE[row.kind];
    const label = pdfSafe(row.label);
    const labelWidth = blockWidth - valueWidth - style.indent - 6;
    doc.font(style.font).fontSize(style.size);
    const height = Math.max(style.height, doc.heightOfString(label, { width: labelWidth }) + 4);
    return { kind: row.kind, style, label, labelWidth, value: pdfSafe(row.value), height };
  });
  const blockHeight = rows.reduce((sum, row) => sum + row.height, 0) + 12 + 28;
  // Kept whole: a total stranded on its own page reads as a different document.
  if (y + blockHeight > bottom()) {
    doc.addPage();
    y = MARGIN;
  }
  y += 4;
  for (const row of rows) {
    if (row.kind === 'total') {
      doc.moveTo(blockX, y).lineTo(right, y).lineWidth(0.6).strokeColor(COLOR.border).stroke();
      y += 7;
    }
    doc
      .font(row.style.font)
      .fontSize(row.style.size)
      .fillColor(row.style.label)
      .text(row.label, blockX + row.style.indent, y, { width: row.labelWidth });
    doc.fillColor(row.style.value).text(row.value, right - valueWidth, y, { width: valueWidth, align: 'right' });
    y += row.height;
  }

  y += 14;
  // `pdfSafe` trims, so the separator's trailing space is added back after it.
  const paymentLabel = `${pdfSafe(view.payment.label + labelSeparator(view.locale))} `;
  doc.font(REGULAR).fontSize(9.5).fillColor(COLOR.muted).text(paymentLabel, left, y, { continued: true });
  doc.fillColor(COLOR.text).text(pdfSafe(view.payment.value));

  // ── footer, at the foot of the last page ──────────────────────────────────
  const footerLines = view.footer.map(pdfSafe);
  doc.font(REGULAR).fontSize(8.5);
  const footerHeight = footerLines.reduce((sum, line) => sum + doc.heightOfString(line, { width }) + 2, 0);
  const footerTop = doc.page.height - MARGIN - footerHeight;
  rule(footerTop - 8);
  let footerY = footerTop;
  for (const line of footerLines) {
    // `height` pins the line to this page: PDFKit starts a new one for text it
    // thinks will not fit, and a footer that spills creates a blank page.
    doc.font(REGULAR).fontSize(8.5).fillColor(COLOR.muted).text(line, left, footerY, { width, height: 40 });
    footerY = doc.y + 2;
  }
}
