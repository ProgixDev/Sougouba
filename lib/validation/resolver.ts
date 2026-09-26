import { zodResolver } from '@hookform/resolvers/zod';
import type { FieldErrors, FieldValues, Resolver, ResolverResult } from 'react-hook-form';
import type { ZodType } from 'zod';

import type { TFunction } from '@/lib/i18n';
import { resolveMessage } from './message';

/**
 * `zodResolver` with the message keys resolved into the active language.
 *
 * One wrapper covers every form because every validation message in this app
 * reaches the UI through exactly one channel: `errors.<field>?.message` from
 * react-hook-form. No screen reads `.issues` directly.
 *
 * It belongs here rather than inside `components/ui/Input.tsx` — which was the
 * other candidate — because **three** components render an `error` prop:
 * `Input`, `SelectField` and `CitySelect`. Translating at the resolver covers
 * all three, and any fourth, from a single place.
 *
 * It runs per submit, so the language in effect when the error is produced is
 * the language shown. A form left open across a language switch keeps its
 * already-displayed errors until the next validation pass; the switcher lives on
 * the profile tab and forms live on other screens, so that is not reachable in
 * practice.
 */
export function i18nResolver<
  TFieldValues extends FieldValues,
  TContext = unknown,
  TTransformed = TFieldValues,
>(t: TFunction, schema: ZodType): Resolver<TFieldValues, TContext, TTransformed> {
  // All three generics are carried through because several schemas transform on
  // the way out — `addressSchema` normalises the postal code, `productSchema`
  // parses prices into numbers — so those forms are `useForm<Input, _, Output>`
  // and a single-generic resolver would not fit them.
  const base = zodResolver(schema as never) as unknown as Resolver<
    TFieldValues,
    TContext,
    TTransformed
  >;

  return async (values, context, options) => {
    const result = await base(values, context, options);
    if (!result.errors) return result;
    // The cast keeps RHF's discriminated result shape: only the messages change.
    return { ...result, errors: translate(t, result.errors) } as ResolverResult<
      TFieldValues,
      TTransformed
    >;
  };
}

function translate<T extends FieldValues>(t: TFunction, errors: FieldErrors<T>): FieldErrors<T> {
  const out: Record<string, unknown> = {};

  for (const [field, error] of Object.entries(errors)) {
    if (!error || typeof error !== 'object') {
      out[field] = error;
    } else if ('message' in error && typeof error.message === 'string') {
      out[field] = { ...error, message: resolveMessage(t, error.message) };
    } else {
      // Nested object fields — the signup forms group `identity`, `payout` and
      // friends, so errors arrive one level down.
      out[field] = translate(t, error as FieldErrors);
    }
  }

  return out as FieldErrors<T>;
}
