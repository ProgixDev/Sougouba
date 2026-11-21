import type { PushContent } from './push.service.js';

/**
 * Every push the platform sends, in both languages the app ships.
 *
 * Rendered on the server because a notification is drawn by the OS before the
 * app runs — there is no client-side i18n to lean on. The device's language is
 * stored with its token (`push_tokens.locale`).
 *
 * Short on purpose: a lock screen shows roughly one line of body text.
 */
export type Locale = 'fr' | 'en';

/**
 * The same `#A1B2` reference the app shows (`lib/orderRef.ts`), so a merchant
 * reading a push and a shopper reading their receipt name the order alike.
 * FNV-1a over the order id; must stay byte-for-byte in step with the app's.
 */
export function orderReference(orderId: string): string {
  let hash = 2166136261;
  for (let i = 0; i < orderId.length; i++) {
    hash ^= orderId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `#${(hash >>> 0).toString(16).toUpperCase().padStart(4, '0').slice(-4)}`;
}

/** `12,50 $` in French, `$12.50` in English — how each locale writes Canadian dollars. */
export function money(amountCad: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-CA' : 'en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(amountCad);
}

type Copy<P> = (params: P, locale: Locale) => PushContent;

const pick = (locale: Locale, fr: PushContent, en: PushContent) =>
  locale === 'fr' ? fr : en;

interface OrderParams {
  ref: string;
  vendor: string;
}

/** Shopper-facing: the order moved. Only the steps worth a buzz in a pocket. */
export const customerCopy = {
  confirmed: (({ ref, vendor }, l) =>
    pick(
      l,
      {
        title: 'Commande acceptée',
        body: `${vendor} prépare votre commande ${ref}.`,
      },
      {
        title: 'Order accepted',
        body: `${vendor} is preparing your order ${ref}.`,
      },
    )) as Copy<OrderParams>,

  outForDelivery: (({ ref, vendor }, l) =>
    pick(
      l,
      {
        title: 'Votre commande est en route',
        body: `Le livreur a récupéré ${ref} chez ${vendor}.`,
      },
      {
        title: 'Your order is on its way',
        body: `Your courier picked up ${ref} from ${vendor}.`,
      },
    )) as Copy<OrderParams>,

  delivered: (({ ref, vendor }, l) =>
    pick(
      l,
      {
        title: 'Commande livrée',
        body: `Votre commande ${ref} de ${vendor} est arrivée. Bon appétit !`,
      },
      {
        title: 'Order delivered',
        body: `Your order ${ref} from ${vendor} has arrived. Enjoy!`,
      },
    )) as Copy<OrderParams>,

  cancelled: (({ ref, vendor }, l) =>
    pick(
      l,
      {
        title: 'Commande annulée',
        body: `${vendor} a annulé votre commande ${ref}.`,
      },
      {
        title: 'Order cancelled',
        body: `${vendor} cancelled your order ${ref}.`,
      },
    )) as Copy<OrderParams>,

  disputeResolved: (({ ref }, l) =>
    pick(
      l,
      {
        title: 'Votre signalement a été traité',
        body: `Consultez la décision pour la commande ${ref}.`,
      },
      {
        title: 'Your report was reviewed',
        body: `See the decision for order ${ref}.`,
      },
    )) as Copy<{ ref: string }>,

  supportReplied: ((_params, l) =>
    pick(
      l,
      {
        title: 'L’équipe Sougouba vous a répondu',
        body: 'Ouvrez l’assistance pour lire la réponse.',
      },
      {
        title: 'The Sougouba team replied',
        body: 'Open support to read the answer.',
      },
    )) as Copy<Record<string, never>>,
};

/** Merchant-facing. */
export const merchantCopy = {
  newOrder: (({ ref, items, totalCad }, l) =>
    pick(
      l,
      {
        title: 'Nouvelle commande',
        body: `${ref} · ${items} article${items > 1 ? 's' : ''} · ${money(totalCad, l)}`,
      },
      {
        title: 'New order',
        body: `${ref} · ${items} item${items > 1 ? 's' : ''} · ${money(totalCad, l)}`,
      },
    )) as Copy<{ ref: string; items: number; totalCad: number }>,

  disputeOpened: (({ ref }, l) =>
    pick(
      l,
      {
        title: 'Un client signale un problème',
        body: `Commande ${ref} — répondez depuis l'app.`,
      },
      {
        title: 'A customer reported a problem',
        body: `Order ${ref} — reply from the app.`,
      },
    )) as Copy<{ ref: string }>,
};

/** Merchant or courier: the back office approved their application. */
export const applicationCopy = {
  vendorApproved: (({ name }, l) =>
    pick(
      l,
      {
        title: 'Votre boutique est approuvée',
        body: `${name} est en ligne : vous pouvez recevoir des commandes.`,
      },
      {
        title: 'Your shop is approved',
        body: `${name} is live — you can start taking orders.`,
      },
    )) as Copy<{ name: string }>,

  courierApproved: ((_, l) =>
    pick(
      l,
      {
        title: 'Votre inscription est approuvée',
        body: 'Passez en ligne pour recevoir vos premières courses.',
      },
      {
        title: 'Your application is approved',
        body: 'Go online to receive your first deliveries.',
      },
    )) as Copy<Record<string, never>>,
};

/** Courier-facing. */
export const courierCopy = {
  newOffer: (({ vendor, km, earningsCad }, l) =>
    pick(
      l,
      {
        title: 'Nouvelle course disponible',
        body: `${vendor} · ${km.toFixed(1).replace('.', ',')} km · ${money(earningsCad, l)} — acceptez vite.`,
      },
      {
        title: 'New delivery available',
        body: `${vendor} · ${km.toFixed(1)} km · ${money(earningsCad, l)} — accept it fast.`,
      },
    )) as Copy<{ vendor: string; km: number; earningsCad: number }>,
};
