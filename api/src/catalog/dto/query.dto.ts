import { z } from 'zod';

/**
 * Query strings arrive as strings — always. `?onSale=false` is the string
 * `"false"`, which is truthy, so a plain `z.boolean()` here would turn every
 * "no, don't filter by that" into "yes, do". These coerce explicitly rather
 * than leaning on `z.coerce`, which has exactly that bug for booleans.
 */
export const queryBool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')
  .optional();

/**
 * The mock ships the whole catalogue to the phone and filters it there; a real
 * API must not (docs/BACKEND-BUILD-PHASES.md, Phase 2). Every list endpoint
 * below is paginated, and the ceiling is the API's, not the caller's — a
 * `?limit=100000` is refused with a 400, not answered with the whole table.
 */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const paginationSchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
});

export type Pagination = z.infer<typeof paginationSchema>;

/**
 * For the few endpoints that answered with a bare array before they were
 * paginated: `?paged=true` returns a `Page<T>` with its `total`, and without
 * it the old array shape is kept, so builds already on phones keep working.
 */
export const pagedListSchema = paginationSchema.extend({ paged: queryBool });

export type PagedListQuery = z.infer<typeof pagedListSchema>;

/** What every paginated endpoint returns, so the client always knows if there is more. */
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
