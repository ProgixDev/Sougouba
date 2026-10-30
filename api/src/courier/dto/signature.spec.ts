import { describe, expect, it } from 'vitest';

import { signatureSchema } from './courier.dto.js';

const valid = { width: 320, height: 220 };

describe('signatureSchema', () => {
  it('accepts the strokes the pad records', () => {
    const result = signatureSchema.safeParse({
      ...valid,
      paths: ['M12.5 40.0 L13.0 41.5 L-2.0 44', 'M100 100'],
    });
    expect(result.success).toBe(true);
  });

  it('refuses anything that could close the attribute and open a tag', () => {
    for (const d of ['M1 1"/><script>alert(1)</script>', 'M1 1 L2 2 Z', 'M1 1 C2 2 3 3 4 4', 'L1 1', '']) {
      expect(signatureSchema.safeParse({ ...valid, paths: [d] }).success, d).toBe(false);
    }
  });

  it('refuses an empty pad', () => {
    expect(signatureSchema.safeParse({ ...valid, paths: [] }).success).toBe(false);
  });
});
