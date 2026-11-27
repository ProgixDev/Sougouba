/**
 * A message that changes with a count: « 1 commande » / « 3 commandes ».
 * Chosen by `t(key, { count })` under the language's own rule — in French zero
 * is singular, in English it is plural.
 */
export interface Plural {
  one: string;
  other: string;
}

/**
 * What the English dictionary must look like, given the French one: the same
 * keys, each holding the same kind of message. A key missing from English, or
 * one English has and French does not, is a compile error — which is what
 * keeps the two languages from drifting apart.
 */
export type Shape<T> = {
  [K in keyof T]: T[K] extends string ? string : T[K] extends Plural ? Plural : Shape<T[K]>;
};

/** Every message's address, as dotted keys: `orders.detail.title`. */
export type Paths<T> = {
  [K in keyof T & string]: T[K] extends string | Plural ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];
