import { describe, expect, it } from 'vitest';

import { containsPattern, escapeLikePattern } from './like.js';

describe('escapeLikePattern', () => {
  it('neutralises the two wildcards', () => {
    // `?q=%` was a "return the whole catalogue" button before this.
    expect(escapeLikePattern('%')).toBe('\\%');
    expect(escapeLikePattern('_')).toBe('\\_');
    expect(escapeLikePattern('100%')).toBe('100\\%');
  });

  it('escapes the backslash first, so it does not double-escape its own output', () => {
    // Order matters: escaping `%` before `\` would turn `\` + `%` into `\\%`
    // — an escaped backslash followed by a live wildcard.
    expect(escapeLikePattern('\\')).toBe('\\\\');
    expect(escapeLikePattern('\\%')).toBe('\\\\\\%');
  });

  it('leaves ordinary text, accents and punctuation alone', () => {
    expect(escapeLikePattern('Épices mélangées')).toBe('Épices mélangées');
    expect(escapeLikePattern("Chez Fatou & Fils")).toBe("Chez Fatou & Fils");
  });
});

describe('containsPattern', () => {
  it('wraps in wildcards while neutralising the ones inside', () => {
    expect(containsPattern('riz')).toBe('%riz%');
    expect(containsPattern('%')).toBe('%\\%%');
  });
});
