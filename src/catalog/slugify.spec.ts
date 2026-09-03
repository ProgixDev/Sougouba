import { describe, expect, it } from 'vitest';

import { slugify, uniqueSlug } from './slugify.js';

describe('slugify', () => {
  it('strips accents rather than dropping the letters under them', () => {
    // The failure this pins: a naive `[^a-z0-9]+` pass with no NFD step turns
    // "Épices" into "-pices". Every seeded shop name in this catalogue has an
    // accent in it, so that would be most of the platform's URLs.
    expect(slugify('Marché Épices Réunies')).toBe('marche-epices-reunies');
    expect(slugify('Boulangerie Aïcha')).toBe('boulangerie-aicha');
    expect(slugify('Café Crème Brûlée')).toBe('cafe-creme-brulee');
  });

  it('collapses runs of punctuation and trims the edges', () => {
    expect(slugify('  Chez  Fatou & Fils !!  ')).toBe('chez-fatou-fils');
    expect(slugify('---Sahel---')).toBe('sahel');
  });

  it('returns an empty string when there is nothing sluggable', () => {
    // Not a crash and not a stray "-": `uniqueSlug` is what decides the
    // fallback, and it needs an honest empty answer to detect the case.
    expect(slugify('!!!')).toBe('');
    expect(slugify('日本語')).toBe('');
  });
});

describe('uniqueSlug', () => {
  it('uses the plain slug when it is free', () => {
    expect(uniqueSlug('Marché Sahel', new Set(), 'fallback-id')).toBe('marche-sahel');
  });

  it('suffixes rather than rejecting a duplicate shop name', () => {
    // Two shops really can be called "Marché Sahel" — that is an ordinary fact
    // about shops, not a registration to refuse.
    const taken = new Set(['marche-sahel']);
    expect(uniqueSlug('Marché Sahel', taken, 'fallback-id')).toBe('marche-sahel-2');
    expect(uniqueSlug('Marché Sahel', new Set([...taken, 'marche-sahel-2']), 'fallback-id')).toBe('marche-sahel-3');
  });

  it('falls back to the row id when the name slugs to nothing', () => {
    expect(uniqueSlug('!!!', new Set(), 'vnd-123')).toBe('vnd-123');
  });
});
