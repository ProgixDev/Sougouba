import { type ArgumentMetadata, BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Per-route validation against one of the mobile app's own `lib/validation/*`
 * rules ported to Zod — used as `@UsePipes(new ZodValidationPipe(schema))`
 * rather than wired globally, since (unlike `class-validator`) a Zod schema
 * has no decorator metadata for Nest to discover automatically per-DTO-class.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown, metadata?: ArgumentMetadata) {
    // Applied with `@UsePipes`, a pipe runs on *every* argument of the route —
    // including `@CurrentUser()` (a custom decorator, the caller's id string)
    // and `@Param()`. The schema describes the body or query, so those two are
    // passed through untouched. Without this, every route pairing the pipe with
    // `@CurrentUser()` answered 400 "expected object, received string".
    if (metadata?.type === 'custom' || metadata?.type === 'param') return value;

    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
    }
    return result.data;
  }
}
