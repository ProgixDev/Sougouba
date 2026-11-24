import { brandEmail, EMAIL_COLOR as COLOR, EMAIL_FONT, esc, heroHeading, heroNote } from '../../mail/brand-email.js';
import type { MailAttachment } from '../../mail/mail.service.js';
import type { Locale } from '../../notifications/messages.js';
import { describeStatement, type FigureKind, type Statement } from './statement.js';

/**
 * The monthly statement, as an email: the balance on the slab, the figures it
 * comes from on the paper, and the full statement attached as a PDF.
 *
 * The order-by-order detail is left to the PDF. An email is read on a phone
 * between two customers; what a merchant wants from it is one number and
 * whether it matches what they expected.
 */

const COPY = {
  fr: {
    subject: (heading: string) => `${heading} — Sougouba`,
    intro: (shop: string) => `Voici le relevé du mois pour ${shop}.`,
    attached: 'Le détail commande par commande est dans le PDF joint.',
  },
  en: {
    subject: (heading: string) => `${heading} — Sougouba`,
    intro: (shop: string) => `Here is the month’s statement for ${shop}.`,
    attached: 'The order-by-order detail is in the attached PDF.',
  },
} as const;

const FIGURE_STYLE: Record<FigureKind, { label: string; value: string; row: string }> = {
  base: { label: 'font-weight:700;', value: '', row: '' },
  minor: { label: `color:${COLOR.muted};font-size:13px;padding-left:12px;`, value: `color:${COLOR.muted};font-size:13px;`, row: '' },
  total: { label: 'font-weight:700;', value: 'font-weight:700;', row: `border-top:1px solid ${COLOR.border};` },
  minus: { label: '', value: 'font-weight:600;', row: '' },
  balance: { label: 'font-weight:700;font-size:16px;', value: `font-weight:700;font-size:18px;color:${COLOR.brand};`, row: `border-top:1px solid ${COLOR.border};` },
};

export function renderStatementEmail(
  statement: Statement,
  locale: Locale,
  /** False when the PDF could not be drawn — the body must not promise a file that is not there. */
  hasAttachment: boolean
): { subject: string; text: string; html: string; attachments: MailAttachment[] } {
  const doc = describeStatement(statement, locale);
  const copy = COPY[locale];
  const balance = doc.figures.find((figure) => figure.kind === 'balance')!;
  const notes = [copy.intro(statement.shop.name), hasAttachment ? copy.attached : null].filter((line): line is string => Boolean(line));

  const rows = doc.figures
    .map((figure) => {
      const style = FIGURE_STYLE[figure.kind];
      const pad = figure.kind === 'total' || figure.kind === 'balance' ? 'padding:12px 0 4px;' : 'padding:4px 0;';
      return (
        `<tr>` +
        `<td style="${pad}font-size:14px;${style.row}${style.label}">${esc(figure.label)}</td>` +
        `<td align="right" style="${pad}font-size:14px;white-space:nowrap;${style.row}${style.value}">${esc(figure.value)}</td>` +
        `</tr>`
      );
    })
    .join('');

  const { html, attachments } = brandEmail({
    locale,
    title: copy.subject(doc.heading),
    preheader: `${balance.label} : ${balance.value}`,
    hero:
      heroHeading(doc.heading) +
      // The one number, at the size the sign-in code is set — it is what the email is for.
      `<div style="margin:14px 0 0;font-family:${EMAIL_FONT.body};font-size:14px;line-height:20px;color:${COLOR.onSlabQuiet};">${esc(balance.label)}</div>` +
      `<div style="margin:2px 0 0;font-family:${EMAIL_FONT.display};font-stretch:condensed;font-weight:800;font-size:44px;line-height:50px;color:${COLOR.onSlab};">${esc(balance.value)}</div>` +
      heroNote(doc.balanceNote),
    body:
      notes.map((line) => `<p style="margin:0 0 6px;font-size:15px;line-height:22px;color:${COLOR.muted};">${esc(line)}</p>`).join('') +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0;">${rows}</table>` +
      [doc.numberLine, doc.issuedLine]
        .filter((line): line is string => Boolean(line))
        .map((line, i) => `<div style="${i === 0 ? 'margin:20px 0 0;' : ''}font-size:13px;line-height:19px;color:${COLOR.muted};">${esc(line)}</div>`)
        .join(''),
    footer: doc.footer,
  });

  const text = [
    doc.heading,
    notes.join(' '),
    doc.figures.map((figure) => (figure.value ? `${figure.label} : ${figure.value}` : figure.label)).join('\n'),
    doc.balanceNote,
    [doc.numberLine, doc.issuedLine].filter(Boolean).join(' — '),
    doc.footer.join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n');

  return { subject: copy.subject(doc.heading), text, html, attachments };
}
