import { describe, expect, it } from 'vitest';

import { BRAND_BAND, BRAND_LOCKUP } from '../mail/brand-assets.generated.js';
import { brandEmail } from '../mail/brand-email.js';
import { renderSignInCodeEmail } from './signin-code-email.js';

const mail = renderSignInCodeEmail('742634', 10);

describe('the sign-in code email', () => {
  it('leads its subject with the code, where a lock screen shows it', () => {
    expect(mail.subject).toBe('742634 — votre code Sougouba');
  });

  it('never breaks the code up — a space would defeat autofill and paste', () => {
    for (const body of [mail.html!, mail.text]) {
      expect(body).toContain('742634');
      expect(body).not.toMatch(/742\s634|7\s4\s2\s6\s3\s4/);
    }
    // Once large on the slab, once in the English line; the title and preheader are the head's.
    expect(mail.html!.match(/>742634</g)).toHaveLength(1);
  });

  it('says how long the code lasts, from the figure it is given', () => {
    expect(mail.html).toContain('Valable 10 minutes.');
    expect(mail.text).toContain('valable 10 minutes');
    const quarter = renderSignInCodeEmail('000000', 15);
    expect(quarter.html).toContain('Valable 15 minutes.');
    expect(quarter.html).toContain('It expires in 15 minutes.');
  });

  it('tells the reader not to share it, and what to do if they never asked', () => {
    expect(mail.html).toContain('Ne le communiquez à personne');
    expect(mail.html).toContain('Vous n’avez rien demandé');
    expect(mail.html).toContain('Your Sougouba sign-in code is 742634.');
  });

  it('keeps a plain-text twin for clients that refuse HTML', () => {
    expect(mail.text).toContain('Votre code de connexion Sougouba : 742634');
    expect(mail.text).toContain('Your Sougouba sign-in code: 742634');
    expect(mail.text).not.toContain('<');
  });
});

describe('the branded sheet', () => {
  it('carries its two images inside the message and references nothing remote', () => {
    const cids = mail.attachments!.map((a) => a.cid);
    expect(cids).toEqual([BRAND_LOCKUP.cid, BRAND_BAND.cid]);
    for (const attachment of mail.attachments!) {
      expect(attachment.contentDisposition).toBe('inline');
      expect(attachment.contentType).toBe('image/png');
      // A real PNG, not an empty or mangled buffer.
      expect(attachment.content.subarray(1, 4).toString()).toBe('PNG');
      expect(mail.html).toContain(`src="cid:${attachment.cid}"`);
    }
    // Every <img> is one of the two: a remote image would be blocked until the reader allowed it.
    const sources = [...mail.html!.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    expect(sources).toEqual([`cid:${BRAND_LOCKUP.cid}`, `cid:${BRAND_BAND.cid}`]);
  });

  it('names the logo for a reader who cannot see it, and hides the band from them', () => {
    expect(mail.html).toMatch(/<img[^>]+alt="Sougouba"/);
    expect(mail.html).toMatch(new RegExp(`cid:${BRAND_BAND.cid}"[^>]+alt=""`));
  });

  it('keeps the images small enough to send with every sign-in', () => {
    expect(BRAND_LOCKUP.content.length + BRAND_BAND.content.length).toBeLessThan(20_000);
  });

  it('escapes the title, the preheader and the footer; the two sections are the caller’s markup', () => {
    const { html } = brandEmail({
      locale: 'fr',
      title: 'a <b> & c',
      preheader: '"quoted" <i>',
      hero: '<h1>hero</h1>',
      body: '<p>body</p>',
      footer: ['<script>x</script>'],
    });
    expect(html).toContain('<title>a &lt;b&gt; &amp; c</title>');
    expect(html).toContain('&quot;quoted&quot; &lt;i&gt;');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('<h1>hero</h1>');
    expect(html).toContain('<p>body</p>');
  });
});
