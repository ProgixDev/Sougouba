import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Per-route validation against one of the mobile app's own `lib/validation/*`
 * rules ported to Zod — used as `@UsePipes(new ZodValidationPipe(schema))`
 * rather than wired globally, since (unlike `class-validator`) a Zod schema
 * has no decorator metadata for Nest to discover automatically per-DTO-class.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
    }
    return result.data;
  }
}
