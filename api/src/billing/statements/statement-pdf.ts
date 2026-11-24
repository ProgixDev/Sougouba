import PDFDocument from 'pdfkit';

import type { Locale } from '../../notifications/messages.js';
import { pdfSafe } from '../../orders/receipts/receipt-pdf.js';
import { describeStatement, type FigureKind, type Statement, type StatementDocument } from './statement.js';

/**
 * The statement as a PDF — attached to the monthly email, and opened from the
 * merchant's app, the web portal and the back office.
 *
 * Drawn the way the receipt is, with the same built-in fonts and the same
 * `pdfSafe` filter, so the two documents a shop and its customers hold look
 * like they came from one place. Rendered from the frozen figures each time it
 * is asked for; the file itself is never stored.
 */

const MARGIN = 50;
const REGULAR = 'Helvetica';
const BOLD = 'Helvetica-Bold';
const COLOR = { brand: '#1C5439', text: '#1F2421', muted: '#6B716D', border: '#DDD8CF', faint: '#EEEAE3', minus: '#8A3A12' };
/** Room kept at the foot of every page for the footer block. */
const FOOTER_RESERVE = 72;

type Doc = InstanceType<typeof PDFDocument>;

export function renderStatementPdf(statement: Statement, locale: Locale): Promise<Buffer> {
  const view = describeStatement(statement, locale);

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: MARGIN,
      info: { Title: pdfSafe([view.heading, 'Sougouba'].join(' — ')), Author: 'Sougouba', Subject: pdfSafe(view.title) },
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

function draw(doc: Doc, view: StatementDocument): void {
  const left = MARGIN;
  const right = doc.page.width - MARGIN;
  const width = right - left;
  const bottom = () => doc.page.height - MARGIN - FOOTER_RESERVE;
  const rule = (y: number, color = COLOR.border, from = left) => {
    doc.moveTo(from, y).lineTo(right, y).lineWidth(0.6).strokeColor(color).stroke();
  };

  // ── header ────────────────────────────────────────────────────────────────
  let y = MARGIN;
  doc.font(BOLD).fontSize(22).fillColor(COLOR.brand).text('Sougouba', left, y, { lineBreak: false });
  doc.font(BOLD).fontSize(13).fillColor(COLOR.text).text(pdfSafe(view.title).toUpperCase(), left, y + 5, { width, align: 'right' });
  let metaY = y + 26;
  for (const line of [view.numberLine, view.issuedLine]) {
    if (!line) continue;
    doc.font(REGULAR).fontSize(9.5).fillColor(COLOR.muted).text(pdfSafe(line), left, metaY, { width, align: 'right' });
    metaY += 13;
  }
  y = metaY + 8;
  rule(y);
  y += 18;

  // ── the month, and whose it is ────────────────────────────────────────────
  doc.font(BOLD).fontSize(17).fillColor(COLOR.text).text(pdfSafe(view.heading), left, y, { width });
  y = doc.y + 10;
  doc.font(REGULAR).fontSize(8).fillColor(COLOR.muted).text(pdfSafe(view.shop.label).toUpperCase(), left, y, { characterSpacing: 0.6 });
  y = doc.y + 3;
  view.shop.lines.forEach((line, index) => {
    doc
      .font(index === 0 ? BOLD : REGULAR)
      .fontSize(index === 0 ? 10.5 : 9.5)
      .fillColor(index === 0 ? COLOR.text : COLOR.muted)
      .text(pdfSafe(line), left, y, { width });
    y = doc.y + 2;
  });
  y += 16;

  // ── the money column ──────────────────────────────────────────────────────
  const STYLE: Record<FigureKind, { font: string; size: number; label: string; value: string; height: number; indent: number }> = {
    base: { font: BOLD, size: 10, label: COLOR.text, value: COLOR.text, height: 18, indent: 0 },
    minor: { font: REGULAR, size: 9.5, label: COLOR.muted, value: COLOR.muted, height: 15, indent: 12 },
    total: { font: BOLD, size: 10.5, label: COLOR.text, value: COLOR.text, height: 22, indent: 0 },
    minus: { font: REGULAR, size: 10, label: COLOR.text, value: COLOR.minus, height: 17, indent: 0 },
    balance: { font: BOLD, size: 13, label: COLOR.text, value: COLOR.brand, height: 26, indent: 0 },
  };
  const valueWidth = 110;
  for (const figure of view.figures) {
    const style = STYLE[figure.kind];
    if (figure.kind === 'total' || figure.kind === 'balance') {
      y += 3;
      rule(y);
      y += 8;
    }
    doc
      .font(style.font)
      .fontSize(style.size)
      .fillColor(style.label)
      .text(pdfSafe(figure.label), left + style.indent, y, { width: width - valueWidth - style.indent - 8 });
    if (figure.value) {
      doc.fillColor(style.value).text(pdfSafe(figure.value), right - valueWidth, y, { width: valueWidth, align: 'right' });
    }
    y += style.height;
  }
  doc.font(REGULAR).fontSize(9.5).fillColor(COLOR.muted).text(pdfSafe(view.balanceNote), left, y + 2, { width });
  y = doc.y + 22;

  // ── the orders and refunds behind those figures ───────────────────────────
  const table = (columns: string[], rows: string[][], widths: number[]) => {
    const x = widths.map((_, i) => left + widths.slice(0, i).reduce((a, b) => a + b, 0));
    // The first two columns read left to right; every amount is right-aligned so the decimals line up.
    const align = (i: number): 'left' | 'right' => (i < 2 ? 'left' : 'right');
    const header = () => {
      doc.font(REGULAR).fontSize(8).fillColor(COLOR.muted);
      columns.forEach((column, i) =>
        doc.text(pdfSafe(column).toUpperCase(), x[i], y, { width: widths[i] - 6, align: align(i), characterSpacing: 0.5 })
      );
      y += 13;
      rule(y);
      y += 7;
    };
    header();
    for (const row of rows) {
      if (y + 14 > bottom()) {
        doc.addPage();
        y = MARGIN;
        header();
      }
      doc.font(REGULAR).fontSize(9.5).fillColor(COLOR.text);
      row.forEach((cell, i) => doc.text(pdfSafe(cell), x[i], y, { width: widths[i] - 6, align: align(i), lineBreak: false }));
      y += 15;
      rule(y, COLOR.faint);
      y += 6;
    }
  };

  if (view.orders.rows.length > 0) {
    if (y + 60 > bottom()) {
      doc.addPage();
      y = MARGIN;
    }
    table(view.orders.columns, view.orders.rows, [78, 150, 104, 90, 90]);
  }
  if (view.refunds) {
    y += 14;
    // Room for its title, its headings and one row — not for a table it may not need.
    if (y + 50 > bottom()) {
      doc.addPage();
      y = MARGIN;
    }
    doc.font(BOLD).fontSize(10.5).fillColor(COLOR.text).text(pdfSafe(view.refunds.title), left, y, { width });
    y = doc.y + 8;
    table(view.refunds.columns, view.refunds.rows, [78, 150, 284]);
  }

  // ── footer, at the foot of the last page ──────────────────────────────────
  const footerLines = view.footer.map(pdfSafe);
  doc.font(REGULAR).fontSize(8.5);
  const footerHeight = footerLines.reduce((sum, line) => sum + doc.heightOfString(line, { width }) + 2, 0);
  const footerTop = doc.page.height - MARGIN - footerHeight;
  rule(footerTop - 8);
  let footerY = footerTop;
  for (const line of footerLines) {
    doc.font(REGULAR).fontSize(8.5).fillColor(COLOR.muted).text(line, left, footerY, { width, height: 40 });
    footerY = doc.y + 2;
  }
}
