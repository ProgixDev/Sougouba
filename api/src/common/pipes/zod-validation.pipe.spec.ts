import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ZodValidationPipe } from './zod-validation.pipe.js';

const pipe = new ZodValidationPipe(z.object({ fullName: z.string().min(2) }));

describe('ZodValidationPipe', () => {
  it('validates the body', () => {
    expect(pipe.transform({ fullName: 'Awa' }, { type: 'body' })).toEqual({ fullName: 'Awa' });
    expect(() => pipe.transform({ fullName: 'A' }, { type: 'body' })).toThrow(BadRequestException);
  });

  it('leaves @CurrentUser() alone — it is the caller id, not the body', () => {
    expect(pipe.transform('5751d92a-7fd7-42c3-a189-076c482b4f44', { type: 'custom' })).toBe(
      '5751d92a-7fd7-42c3-a189-076c482b4f44'
    );
  });

  it('leaves route params alone', () => {
    expect(pipe.transform('abc', { type: 'param', data: 'id' })).toBe('abc');
  });
});
