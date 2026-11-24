import { brandEmail, EMAIL_COLOR, EMAIL_FONT, esc, heroHeading, heroNote, paragraph } from '../mail/brand-email.js';
import type { Mail } from '../mail/mail.service.js';

/**
 * The sign-in code, as an email.
 *
 * It has one job — six digits, read off a lock screen and typed into the app —
 * so the code is the largest thing in the message and the first thing in the
 * subject, where a notification shows it without the email being opened.
 *
 * French first, with one English paragraph: `start` is called before there is
 * an account, so nothing says which language the reader wants.
 *
 * ⚠️ The code is one unbroken run of digits everywhere it appears, spaced with
 * `letter-spacing` and never with a character. iOS offers a code it finds in
 * Mail above the keyboard and a shopper long-presses to copy it; a `742 634`
 * breaks the first and pastes a space into a six-digit field for the second.
 */
export function renderSignInCodeEmail(code: string, validMinutes: number): Omit<Mail, 'to'> {
  const { html, attachments } = brandEmail({
    locale: 'fr',
    title: `${code} — votre code Sougouba`,
    preheader: `Votre code de connexion Sougouba, valable ${validMinutes} minutes.`,
    hero:
      heroHeading('Votre code de connexion') +
      `<div style="margin:6px 0 0;font-family:${EMAIL_FONT.display};font-stretch:condensed;font-weight:800;font-size:56px;line-height:62px;letter-spacing:4px;color:${EMAIL_COLOR.onSlab};">${esc(code)}</div>` +
      heroNote(`Valable ${validMinutes} minutes.`),
    body:
      paragraph(
        'Saisissez ce code pour vous connecter à Sougouba. Ne le communiquez à personne : notre équipe ne vous le demandera jamais.'
      ) +
      paragraph('Vous n’avez rien demandé ? Ignorez ce message. Sans ce code, personne ne peut accéder à votre compte.') +
      `<p style="margin:22px 0 0;padding-top:18px;border-top:1px solid ${EMAIL_COLOR.border};font-size:14px;line-height:21px;color:${EMAIL_COLOR.muted};">` +
      esc(
        `Your Sougouba sign-in code is ${code}. It expires in ${validMinutes} minutes. If you didn’t ask for it, you can ignore this email.`
      ) +
      `</p>`,
    footer: ['Sougouba, les commerces africains et maghrébins livrés chez vous.', 'sougouba.ca'],
  });

  return {
    // The code leads: it is what a lock screen has room for.
    subject: `${code} — votre code Sougouba`,
    text:
      `Votre code de connexion Sougouba : ${code}\n\n` +
      `Il est valable ${validMinutes} minutes. Ne le communiquez à personne : notre équipe ne vous le demandera jamais.\n` +
      `Si vous n'avez rien demandé, ignorez ce message.\n\n` +
      `Your Sougouba sign-in code: ${code} (expires in ${validMinutes} minutes).`,
    html,
    attachments,
  };
}
