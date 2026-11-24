import { money, type Locale } from '../../notifications/messages.js';
import { describeReceipt, labelSeparator, type AmountKind, type Receipt, type ReceiptDocument } from './receipt.js';

/**
 * The receipt as an email: a subject, an HTML body and the plain-text twin
 * every mail client that refuses HTML falls back to.
 *
 * Tables and inline styles, deliberately. An email is rendered by Outlook's
 * Word engine and by Gmail's style-stripping sanitiser as often as by a
 * browser, and `<table>` with `style=""` is the one dialect all of them read
 * the same way.
 *
 * Every value that came from a person — a product name, a shop name, an
 * address — goes through `esc`. Nobody can run a script in a mail client, but a
 * `<` in a product name would otherwise swallow the rest of the receipt.
 */

/** `receipt` when the order is placed; `refund` when money has gone back. */
export type ReceiptEmailKind = 'receipt' | 'refund';

export interface ReceiptEmail {
  subject: string;
  text: string;
  html: string;
}

const COPY = {
  fr: {
    receipt: {
      subject: (ref: string) => `Votre reçu Sougouba — commande ${ref}`,
      heading: 'Merci pour votre commande',
      intro: (seller: string) => `Voici le reçu de votre commande chez ${seller}.`,
      attached: 'Une copie PDF est jointe à ce courriel.',
    },
    refund: {
      subject: (ref: string, amount: string | null) =>
        amount ? `Remboursement de ${amount} — commande ${ref}` : `Remboursement — commande ${ref}`,
      heading: 'Votre remboursement a été émis',
      intro: (seller: string, ref: string, amount: string | null) =>
        `${amount ? `Un remboursement de ${amount}` : 'Un remboursement'} a été émis pour votre commande ${ref} chez ${seller}. ` +
        'Selon votre banque, il apparaît sur votre relevé sous 5 à 10 jours ouvrables.',
      attached: 'Votre reçu mis à jour est joint à ce courriel.',
    },
  },
  en: {
    receipt: {
      subject: (ref: string) => `Your Sougouba receipt — order ${ref}`,
      heading: 'Thank you for your order',
      intro: (seller: string) => `Here is the receipt for your order from ${seller}.`,
      attached: 'A PDF copy is attached to this email.',
    },
    refund: {
      subject: (ref: string, amount: string | null) =>
        amount ? `Refund of ${amount} — order ${ref}` : `Refund — order ${ref}`,
      heading: 'Your refund has been issued',
      intro: (seller: string, ref: string, amount: string | null) =>
        `${amount ? `A refund of ${amount}` : 'A refund'} has been issued for your order ${ref} from ${seller}. ` +
        'Depending on your bank, it appears on your statement within 5 to 10 business days.',
      attached: 'Your updated receipt is attached to this email.',
    },
  },
} as const;

export function renderReceiptEmail(
  receipt: Receipt,
  locale: Locale,
  kind: ReceiptEmailKind,
  /** False when the PDF could not be produced — the body must not promise a file that is not there. */
  hasAttachment: boolean
): ReceiptEmail {
  const doc = describeReceipt(receipt, locale);
  const refunded = receipt.refund?.amountCad ? money(receipt.refund.amountCad, locale) : null;

  const copy = COPY[locale];
  const subject = kind === 'refund' ? copy.refund.subject(receipt.reference, refunded) : copy.receipt.subject(receipt.reference);
  const heading = copy[kind].heading;
  const intro =
    kind === 'refund'
      ? copy.refund.intro(receipt.seller.name, receipt.reference, refunded)
      : copy.receipt.intro(receipt.seller.name);
  const attached = hasAttachment ? copy[kind].attached : null;

  return {
    subject,
    text: renderText(doc, heading, [intro, attached]),
    html: renderHtml(doc, subject, heading, [intro, attached]),
  };
}

// ── plain text ──────────────────────────────────────────────────────────────

function renderText(doc: ReceiptDocument, heading: string, intro: (string | null)[]): string {
  const block = (label: string, lines: string[]) => [label, ...lines.map((line) => `  ${line}`)].join('\n');
  const sep = labelSeparator(doc.locale);

  return [
    heading,
    intro.filter(Boolean).join(' '),
    [doc.numberLine ?? doc.title, doc.orderLine, doc.dateLine].join(' · '),
    doc.notice,
    block(doc.seller.label, doc.seller.lines),
    block(doc.customer.label, doc.customer.lines),
    doc.lines.map((line) => `${line.qty} × ${line.name} — ${line.amount}`).join('\n'),
    doc.amounts.map((row) => `${row.label}${sep}${row.value}`).join('\n'),
    `${doc.payment.label}${sep}${doc.payment.value}`,
    doc.footer.join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n');
}

// ── html ────────────────────────────────────────────────────────────────────

const esc = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** The app's own palette (`theme/tokens.ts`), so the email looks like it came from the same place. */
const COLOR = {
  brand: '#1C5439',
  page: '#F6F4EF',
  card: '#FFFFFF',
  text: '#1F2421',
  muted: '#6B716D',
  border: '#E7E3DC',
  refund: '#B42318',
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** How each tier of the money column is set — the same three weights `PriceSummary` uses in the app. */
const AMOUNT_STYLE: Record<AmountKind, { label: string; value: string; row: string }> = {
  base: { label: `color:${COLOR.muted};`, value: 'font-weight:600;', row: '' },
  minor: { label: `color:${COLOR.muted};font-size:13px;padding-left:12px;`, value: `color:${COLOR.muted};font-size:13px;`, row: '' },
  discount: { label: `color:${COLOR.brand};font-weight:600;`, value: `color:${COLOR.brand};font-weight:600;`, row: '' },
  total: {
    label: 'font-weight:700;font-size:16px;',
    value: 'font-weight:700;font-size:18px;',
    row: `border-top:1px solid ${COLOR.border};`,
  },
  refund: { label: `color:${COLOR.refund};font-weight:600;`, value: `color:${COLOR.refund};font-weight:600;`, row: '' },
  net: { label: 'font-weight:700;', value: 'font-weight:700;', row: '' },
};

function party(block: { label: string; lines: string[] }): string {
  const [first, ...rest] = block.lines;
  return (
    `<td valign="top" width="50%" style="padding:0 8px 0 0;font-size:14px;line-height:20px;">` +
    `<div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${COLOR.muted};padding-bottom:4px;">${esc(block.label)}</div>` +
    `<div style="font-weight:600;">${esc(first ?? '')}</div>` +
    rest.map((line) => `<div style="color:${COLOR.muted};">${esc(line)}</div>`).join('') +
    `</td>`
  );
}

function renderHtml(doc: ReceiptDocument, subject: string, heading: string, intro: (string | null)[]): string {
  const items = doc.lines
    .map(
      (line) =>
        `<tr>` +
        `<td style="padding:8px 12px 8px 0;border-bottom:1px solid ${COLOR.border};font-size:14px;line-height:20px;">` +
        `${esc(line.name)}<div style="color:${COLOR.muted};font-size:13px;">${esc(line.qty)} × ${esc(line.unitPrice)}</div></td>` +
        `<td align="right" valign="top" style="padding:8px 0;border-bottom:1px solid ${COLOR.border};font-size:14px;font-weight:600;white-space:nowrap;">${esc(line.amount)}</td>` +
        `</tr>`
    )
    .join('');

  const amounts = doc.amounts
    .map((row) => {
      const style = AMOUNT_STYLE[row.kind];
      const pad = row.kind === 'total' ? 'padding:12px 0 4px;' : 'padding:4px 0;';
      return (
        `<tr>` +
        `<td style="${pad}font-size:14px;${style.row}${style.label}">${esc(row.label)}</td>` +
        `<td align="right" style="${pad}font-size:14px;white-space:nowrap;${style.row}${style.value}">${esc(row.value)}</td>` +
        `</tr>`
      );
    })
    .join('');

  const meta = [doc.numberLine, doc.orderLine, doc.dateLine].filter((line): line is string => Boolean(line));

  return (
    `<!doctype html>` +
    `<html lang="${doc.locale}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${COLOR.page};font-family:${FONT};color:${COLOR.text};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.page};"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${COLOR.card};border-radius:12px;overflow:hidden;">` +
    // Header band
    `<tr><td style="background:${COLOR.brand};padding:20px 28px;color:#FFFFFF;font-size:20px;font-weight:700;letter-spacing:.01em;">Sougouba</td></tr>` +
    `<tr><td style="padding:28px;">` +
    `<h1 style="margin:0 0 8px;font-size:22px;line-height:28px;font-weight:700;">${esc(heading)}</h1>` +
    intro
      .filter((line): line is string => Boolean(line))
      .map((line) => `<p style="margin:0 0 6px;font-size:15px;line-height:22px;color:${COLOR.muted};">${esc(line)}</p>`)
      .join('') +
    // Number, order reference, date
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;border-top:1px solid ${COLOR.border};border-bottom:1px solid ${COLOR.border};"><tr>` +
    `<td style="padding:12px 0;font-size:14px;line-height:20px;">` +
    meta.map((line, i) => `<div style="${i === 0 ? 'font-weight:700;' : `color:${COLOR.muted};`}">${esc(line)}</div>`).join('') +
    `</td></tr></table>` +
    (doc.notice
      ? `<p style="margin:16px 0 0;padding:10px 12px;border-radius:8px;background:#FDF1EF;color:${COLOR.refund};font-size:14px;font-weight:600;">${esc(doc.notice)}</p>`
      : '') +
    // Seller and customer
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;"><tr>` +
    party(doc.seller) +
    party(doc.customer) +
    `</tr></table>` +
    // Lines
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;border-top:1px solid ${COLOR.border};">${items}</table>` +
    // Money column
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 0;">${amounts}</table>` +
    `<p style="margin:20px 0 0;font-size:14px;line-height:20px;"><span style="color:${COLOR.muted};">${esc(doc.payment.label + labelSeparator(doc.locale))}</span>${esc(doc.payment.value)}</p>` +
    `</td></tr>` +
    // Footer
    `<tr><td style="padding:16px 28px 24px;border-top:1px solid ${COLOR.border};font-size:12px;line-height:18px;color:${COLOR.muted};">` +
    doc.footer.map((line) => `<div>${esc(line)}</div>`).join('') +
    `</td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}
