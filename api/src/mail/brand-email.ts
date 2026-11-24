import { BRAND_BAND, BRAND_LOCKUP, type BrandImage } from './brand-assets.generated.js';
import type { MailAttachment } from './mail.service.js';

/**
 * The sheet every Sougouba email is written on.
 *
 * A forest slab carrying the logo and the one thing the message is about, the
 * woven band as the slab's rim — the same band that runs round the basket in
 * the logo — and a paper section below it for the rest. A sign-in code and a
 * receipt are told apart by what they say, not by looking like two companies.
 *
 * Tables and inline styles, deliberately. An email is rendered by Outlook's
 * Word engine and by Gmail's style-stripping sanitiser as often as by a
 * browser, and `<table>` with `style=""` is the one dialect all of them read
 * the same way. The `<style>` block in the head only ever *improves* on that;
 * nothing depends on it surviving.
 *
 * The two images travel inside the message (`cid:`), not on a server: a remote
 * image is blocked until the reader allows it, and a sign-in code with a hole
 * where the logo should be looks like the phishing it is trying not to be.
 */

/** The app's palette (`theme/tokens.ts`). */
export const EMAIL_COLOR = {
  /** forest-800 — the slab. */
  slab: '#17422E',
  /** The wordmark's own letter colour, so type on the slab matches the logo beside it. */
  onSlab: '#F3EFE6',
  /** forest-200 — the quieter line on the slab. */
  onSlabQuiet: '#AFD7C0',
  page: '#F0EEEA',
  paper: '#FFFDF9',
  text: '#292520',
  muted: '#6E665C',
  border: '#E2DED7',
  /** forest-700 — an amount taken off, a positive figure. */
  brand: '#1C5439',
  refund: '#B42318',
} as const;

/**
 * The brand's two faces, with what a client that refuses web fonts falls back
 * to. Apple Mail loads them; Gmail and Outlook do not, and the fallbacks are
 * chosen to keep the weight and the width close rather than to match letterforms.
 */
export const EMAIL_FONT = {
  display: "'Bricolage Grotesque','Helvetica Neue',Helvetica,Arial,sans-serif",
  body: "'Hanken Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
} as const;

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap';

/** Every value that came from a person goes through this before it reaches the markup. */
export const esc = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ── pieces a message builds its two sections from ───────────────────────────

/** The line that says what this email is, on the slab. */
export const heroHeading = (text: string): string =>
  `<h1 style="margin:30px 0 0;font-family:${EMAIL_FONT.display};font-weight:600;font-size:22px;line-height:28px;color:${EMAIL_COLOR.onSlab};">${esc(text)}</h1>`;

/** A quieter line under it. */
export const heroNote = (text: string): string =>
  `<p style="margin:10px 0 0;font-family:${EMAIL_FONT.body};font-size:15px;line-height:22px;color:${EMAIL_COLOR.onSlabQuiet};">${esc(text)}</p>`;

/** Body copy on the paper. */
export const paragraph = (text: string): string =>
  `<p style="margin:0 0 14px;font-size:16px;line-height:25px;color:${EMAIL_COLOR.text};">${esc(text)}</p>`;

// ── the sheet ───────────────────────────────────────────────────────────────

export interface BrandEmailInput {
  locale: 'fr' | 'en';
  /** The `<title>` — what a client shows when the message is opened on its own. */
  title: string;
  /** The line an inbox shows after the subject. Never visible in the message itself. */
  preheader: string;
  /** HTML for the slab, under the logo: what this email is about. */
  hero: string;
  /** HTML for the paper section. */
  body: string;
  /** Plain lines under the sheet. Escaped here. */
  footer: string[];
}

export interface BrandEmail {
  html: string;
  /** The inline images the HTML references. Send them with the message or the header is two broken icons. */
  attachments: MailAttachment[];
}

const inline = (image: BrandImage): MailAttachment => ({
  filename: image.filename,
  content: image.content,
  contentType: 'image/png',
  cid: image.cid,
  // Without this a client lists the logo under the message as a file to download.
  contentDisposition: 'inline',
});

export function brandEmail(input: BrandEmailInput): BrandEmail {
  const { slab, page, paper, text, muted } = EMAIL_COLOR;

  const html =
    `<!doctype html>` +
    `<html lang="${input.locale}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    // Drawn for a light ground with its own dark slab; a client that would
    // otherwise re-colour it for dark mode is told not to.
    `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">` +
    `<title>${esc(input.title)}</title>` +
    // Outlook cannot load a web font and answers one it does not know with
    // Times New Roman, so it is never shown the stylesheet at all.
    `<!--[if !mso]><!--><link href="${FONTS_URL}" rel="stylesheet"><!--<![endif]-->` +
    `<style>` +
    // Mail on iOS turns anything number-shaped into a blue link — including a sign-in code.
    `a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}` +
    `img{border:0;outline:none;text-decoration:none;}` +
    `</style>` +
    `</head>` +
    `<body style="margin:0;padding:0;background:${page};">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${page};">${esc(input.preheader)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${page}" style="background:${page};"><tr><td align="center" style="padding:28px 12px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">` +
    // The slab: logo, then the message's own hero.
    `<tr><td bgcolor="${slab}" style="background:${slab};border-radius:18px 18px 0 0;padding:30px 32px 28px;">` +
    `<img src="cid:${BRAND_LOCKUP.cid}" width="${BRAND_LOCKUP.width}" height="${BRAND_LOCKUP.height}" alt="${esc(BRAND_LOCKUP.alt)}" ` +
    `style="display:block;width:${BRAND_LOCKUP.width}px;height:${BRAND_LOCKUP.height}px;font-family:${EMAIL_FONT.display};font-size:22px;font-weight:700;color:${EMAIL_COLOR.onSlab};">` +
    input.hero +
    `</td></tr>` +
    // The woven band, as the slab's rim. `height:auto` lets it narrow with a phone.
    `<tr><td bgcolor="${slab}" style="background:${slab};font-size:0;line-height:0;">` +
    `<img src="cid:${BRAND_BAND.cid}" width="${BRAND_BAND.width}" height="${BRAND_BAND.height}" alt="" role="presentation" style="display:block;width:100%;max-width:${BRAND_BAND.width}px;height:auto;">` +
    `</td></tr>` +
    // The paper.
    `<tr><td bgcolor="${paper}" style="background:${paper};border-radius:0 0 18px 18px;padding:30px 32px 32px;font-family:${EMAIL_FONT.body};color:${text};">` +
    input.body +
    `</td></tr>` +
    // Signed off under the sheet, not inside it.
    `<tr><td style="padding:20px 32px 0;font-family:${EMAIL_FONT.body};font-size:13px;line-height:20px;color:${muted};">` +
    input.footer.map((line) => `<div>${esc(line)}</div>`).join('') +
    `</td></tr>` +
    `</table></td></tr></table></body></html>`;

  return { html, attachments: [inline(BRAND_LOCKUP), inline(BRAND_BAND)] };
}
