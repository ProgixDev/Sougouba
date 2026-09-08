import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';

/**
 * PostgREST reports failure in the payload (`{ data, error }`) rather than by
 * throwing, so an unchecked call returns `null` and the bug surfaces later as
 * a null dereference somewhere unrelated. Drizzle threw; these helpers restore
 * that, so a service reads as a sequence of values again.
 *
 * ⚠️ Never put `error.message` in a client-facing response: PostgREST echoes
 * constraint names, column names and sometimes offending values. Log it, and
 * answer with something generic — that is what `InternalServerErrorException`
 * does here.
 */

export type PostgrestResult<T> = { data: T | null; error: PostgrestError | null };

function fail(error: PostgrestError): never {
  // The full detail goes to the log, once, at the boundary where it happened.
  console.error('[postgrest]', error.code, error.message, error.details ?? '', error.hint ?? '');
  throw new InternalServerErrorException('Database request failed');
}

/** A query that must succeed and may legitimately return no rows. */
export async function unwrap<T>(promise: PromiseLike<PostgrestResult<T>>): Promise<T> {
  const { data, error } = await promise;
  if (error) fail(error);
  return data as T;
}

/**
 * A `.maybeSingle()` whose absence is a 404 — the ownership-check shape used
 * all over this codebase, where "not yours" and "not there" deliberately
 * answer alike so an id you don't own can't be probed for existence.
 */
export async function unwrapFound<T>(promise: PromiseLike<PostgrestResult<T>>, message: string): Promise<T> {
  const { data, error } = await promise;
  if (error) fail(error);
  if (data === null) throw new NotFoundException(message);
  return data;
}

/**
 * A write whose returned row is not read. Still checks `error` — a silently
 * dropped update is the failure mode this whole module exists to prevent.
 */
export async function unwrapVoid(promise: PromiseLike<PostgrestResult<unknown>>): Promise<void> {
  const { error } = await promise;
  if (error) fail(error);
}

/**
 * A `.rpc()` call into one of the `plpgsql` functions that carry this API's
 * transactions. Those functions raise with a `PGRST`-visible SQLSTATE when
 * they refuse (see `drizzle/00xx_rpc_*.sql`); `code` lets a caller map a
 * specific refusal onto its own HTTP status instead of a blanket 500.
 */
export async function unwrapRpc<T>(promise: PromiseLike<PostgrestResult<T>>, onError?: (e: PostgrestError) => never): Promise<T> {
  const { data, error } = await promise;
  if (error) {
    if (onError) onError(error);
    fail(error);
  }
  return data as T;
}
