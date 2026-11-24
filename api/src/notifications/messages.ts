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

  /**
   * The order was cancelled by someone other than the shopper. Who did it
   * changes the first sentence; whether the money is already on its way back
   * changes the second — a refund that Stripe has not confirmed is not promised
   * on a lock screen.
   */
  cancelledBy: (({ ref, vendor, by, reason, refunded }, l) => {
    const fr =
      by === 'merchant'
        ? `${vendor} a annulé votre commande ${ref}.`
        : by === 'system'
          ? reason === 'shop_no_response'
            ? `${vendor} n’a pas répondu à votre commande ${ref} : elle est annulée.`
            : `Aucun livreur n’était disponible pour votre commande ${ref} : elle est annulée.`
          : `Sougouba a annulé votre commande ${ref}.`;
    const en =
      by === 'merchant'
        ? `${vendor} cancelled your order ${ref}.`
        : by === 'system'
          ? reason === 'shop_no_response'
            ? `${vendor} did not answer your order ${ref}, so it was cancelled.`
            : `No courier was available for your order ${ref}, so it was cancelled.`
          : `Sougouba cancelled your order ${ref}.`;
    return pick(
      l,
      { title: 'Commande annulée', body: refunded ? `${fr} Vous êtes remboursé.` : fr },
      { title: 'Order cancelled', body: refunded ? `${en} You have been refunded.` : en },
    );
  }) as Copy<OrderParams & { by: 'merchant' | 'admin' | 'system'; reason?: string | null; refunded: boolean }>,

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

  /** An order in the shop's queue was cancelled by someone else: stop preparing it. */
  orderCancelled: (({ ref, by, reason }, l) =>
    pick(
      l,
      {
        title: 'Commande annulée',
        body:
          by === 'customer'
            ? `Le client a annulé la commande ${ref}. Ne la préparez pas.`
            : by === 'system'
              ? reason === 'shop_no_response'
                ? `Commande ${ref} annulée : elle n’a pas été acceptée à temps. Le client est remboursé.`
                : `Commande ${ref} annulée : aucun livreur n’était disponible.`
              : `Sougouba a annulé la commande ${ref}.`,
      },
      {
        title: 'Order cancelled',
        body:
          by === 'customer'
            ? `The customer cancelled order ${ref}. Do not prepare it.`
            : by === 'system'
              ? reason === 'shop_no_response'
                ? `Order ${ref} was cancelled: it was not accepted in time. The customer is refunded.`
                : `Order ${ref} was cancelled: no courier was available.`
              : `Sougouba cancelled order ${ref}.`,
      },
    )) as Copy<{ ref: string; by: 'customer' | 'admin' | 'system'; reason?: string | null }>,

  /**
   * An order is still waiting for the shop's answer. Sent once, before the
   * order is cancelled for lack of one; `minutesLeft` is null when automatic
   * cancellation is switched off, and the push then only nudges.
   */
  orderWaiting: (({ ref, minutesLeft }, l) =>
    pick(
      l,
      {
        title: 'Une commande attend votre réponse',
        body:
          minutesLeft === null
            ? `Commande ${ref} : acceptez-la ou refusez-la depuis l’app.`
            : `Commande ${ref} : acceptez-la, sinon elle sera annulée dans ${minutesLeft} min.`,
      },
      {
        title: 'An order is waiting for your answer',
        body:
          minutesLeft === null
            ? `Order ${ref}: accept or decline it from the app.`
            : `Order ${ref}: accept it, or it will be cancelled in ${minutesLeft} min.`,
      },
    )) as Copy<{ ref: string; minutesLeft: number | null }>,

  subscriptionPaymentFailed: ((_params, l) =>
    pick(
      l,
      {
        title: 'Paiement de l’abonnement refusé',
        body: 'Mettez votre carte à jour depuis votre profil pour régler l’abonnement Sougouba.',
      },
      {
        title: 'Subscription payment declined',
        body: 'Update your card from your profile to pay the Sougouba subscription.',
      },
    )) as Copy<Record<string, never>>,
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

  /**
   * The courier accepted a run and is late at the shop. Sent once, before the
   * run is taken back; `minutesLeft` is null when it never is automatically.
   */
  pickupOverdue: (({ ref, vendor, minutesLeft }, l) =>
    pick(
      l,
      {
        title: `${vendor} vous attend`,
        body:
          minutesLeft === null
            ? `Commande ${ref} : récupérez-la, ou rendez la course si vous ne pouvez pas.`
            : `Commande ${ref} : récupérez-la ou rendez la course. Sinon elle sera confiée à un autre livreur dans ${minutesLeft} min.`,
      },
      {
        title: `${vendor} is waiting for you`,
        body:
          minutesLeft === null
            ? `Order ${ref}: pick it up, or hand the run back if you cannot.`
            : `Order ${ref}: pick it up or hand the run back. Otherwise it goes to another courier in ${minutesLeft} min.`,
      },
    )) as Copy<OrderParams & { minutesLeft: number | null }>,

  /** The run was taken back because the courier never came for it. */
  runTakenBack: (({ ref, vendor }, l) =>
    pick(
      l,
      {
        title: 'Course retirée',
        body: `La commande ${ref} (${vendor}) n’a pas été récupérée à temps : elle a été confiée à un autre livreur.`,
      },
      {
        title: 'Delivery reassigned',
        body: `Order ${ref} (${vendor}) was not picked up in time, so it went to another courier.`,
      },
    )) as Copy<OrderParams>,

  /** The order a courier was carrying, or heading to, no longer exists as a delivery. */
  runCancelled: (({ ref, vendor }, l) =>
    pick(
      l,
      {
        title: 'Course annulée',
        body: `La commande ${ref} (${vendor}) a été annulée. Vous êtes libre pour une autre course.`,
      },
      {
        title: 'Delivery cancelled',
        body: `Order ${ref} (${vendor}) was cancelled. You are free for another delivery.`,
      },
    )) as Copy<OrderParams>,
};

/** Either side of an order's chat: who wrote, and the start of what they wrote. */
export const chatCopy = {
  newMessage: (({ name, text }, l) => {
    const body = text.length > 140 ? `${text.slice(0, 139)}…` : text;
    return pick(
      l,
      { title: name ? `Message de ${name}` : 'Nouveau message', body },
      { title: name ? `Message from ${name}` : 'New message', body },
    );
  }) as Copy<{ name: string; text: string }>,
};
