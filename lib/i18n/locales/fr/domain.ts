import { plural } from '../plural';

/**
 * Shared business vocabulary — the words the product is made of.
 *
 * Everything here is keyed by an enum member from `data/types.ts`, so a screen
 * renders `t(\`domain.orderStatus.${order.status}\`)` and a new status becomes a
 * compile error rather than a blank badge. The tone, ordering and actor
 * metadata that used to sit beside these strings stays in `lib/` — only the
 * words moved.
 */
export const domain = {
  /** Order status, as a state the order is in. Badge tone lives in `lib/orderStatus.ts`. */
  orderStatus: {
    pending: 'En attente',
    confirmed: 'Confirmée',
    preparing: 'En préparation',
    ready: 'Prête',
    out_for_delivery: 'En livraison',
    delivered: 'Livrée',
    cancelled: 'Annulée',
  },
  /**
   * The merchant's advance button, phrased as the action they are taking rather
   * than the state it lands in ("Accepter", not "Confirmée") — a button labelled
   * with a past participle reads as a status, not a control.
   *
   * Only the statuses a merchant can actually advance appear. The old
   * `Record<OrderStatus, string>` needed empty strings for `delivered` and
   * `cancelled` purely to satisfy its own type; keys make the partiality honest.
   */
  orderAdvance: {
    pending: 'Accepter la commande',
    confirmed: 'Commencer la préparation',
    preparing: 'Marquer comme prête',
    /**
     * Unreachable for the merchant since `ready` became the courier's move, but
     * kept so the label exists if the actor table ever changes back.
     */
    ready: 'Confier au livreur',
    out_for_delivery: 'Marquer comme livrée',
  },
  /** The courier's two actions, phrased as things they do. */
  courierAdvance: {
    ready: 'J’ai récupéré la commande',
    out_for_delivery: 'Confirmer la livraison',
  },
  order: {
    itemCount: plural({ one: '%{count} article', other: '%{count} articles' }),
  },
  /** What a shopper can report. Ordering lives in `lib/disputes.ts`. */
  disputeReason: {
    missing_items: 'Articles manquants',
    wrong_order: 'Commande incorrecte',
    quality: 'Qualité du produit',
    late: 'Livraison en retard',
    other: 'Autre',
  },
  dispute: {
    answered: '%{reason} · répondu',
  },
  /** Why a shopper cancels an order the shop has not accepted yet. */
  cancelReason: {
    changed_mind: 'J’ai changé d’avis',
    ordered_by_mistake: 'Commandé par erreur',
    wrong_address: 'Mauvaise adresse de livraison',
    wrong_items: 'Je veux modifier ma commande',
    too_long: 'La boutique tarde à répondre',
    other: 'Autre',
  },
  /** Why a courier hands a run back before pickup. */
  releaseReason: {
    vehicle_problem: 'Problème de véhicule',
    too_far: 'Trop loin pour moi',
    shop_delay: 'La commande n’est pas prête',
    personal: 'Empêchement personnel',
    other: 'Autre',
  },
  /** Who cancelled an order, as one line. */
  cancelledBy: {
    customer: 'Annulée par le client',
    merchant: 'Annulée par la boutique',
    admin: 'Annulée par l’équipe Sougouba',
    system: 'Annulée : aucun livreur disponible',
    shopNoResponse: 'Annulée : la boutique n’a pas répondu',
    unknown: 'Commande annulée',
  },
  /** What a courier can flag from the road. */
  courierIssueReason: {
    customer_absent: 'Client absent',
    wrong_address: 'Adresse incorrecte',
    access_problem: 'Accès impossible',
    shop_not_ready: 'Commande pas prête',
    order_incomplete: 'Commande incomplète',
    other: 'Autre',
  },
  loyaltyReason: {
    order_delivered: 'Commande livrée',
    referral_referred: 'Parrainage — bienvenue chez Sougouba',
    referral_referrer: 'Parrainage — un ami vous a rejoint',
    redeemed: 'Utilisés à la commande',
    order_refunded: 'Commande remboursée',
  },
  /**
   * The merchant's trading state, phrased as what happens next rather than as a
   * status word — "ferme à 21:00" is actionable where "Ouvert" alone is not.
   */
  shopHours: {
    closedToday: 'Fermé aujourd’hui',
    openUntil: 'Ouvert · ferme à %{time}',
    opensAt: 'Ouvre à %{time}',
    reopensTomorrow: 'Fermé · rouvre demain',
  },
  /** The catalogue's two front doors (CDC addendum v1.1, §01). */
  vertical: {
    grocery: {
      label: 'Épicerie',
      /** Heading for the shop list, where the screen is about all of them. */
      title: 'Épiceries',
      count: plural({ one: '%{count} épicerie', other: '%{count} épiceries' }),
    },
    restaurant: {
      label: 'Restaurant',
      title: 'Restaurants',
      count: plural({ one: '%{count} restaurant', other: '%{count} restaurants' }),
    },
  },
  sort: {
    relevance: 'Pertinence',
    price_asc: 'Prix croissant',
    price_desc: 'Prix décroissant',
    name: 'Ordre alphabétique',
  },
  /**
   * Price bands. The amounts are interpolated from `formatCadCompact`, never
   * spelled out — `en-CA` puts the dollar sign in front, so "Moins de 10 $"
   * cannot simply be translated word for word.
   */
  priceBand: {
    all: 'Tous les prix',
    under: 'Moins de %{amount}',
    between: '%{from} à %{to}',
    over: 'Plus de %{amount}',
  },
  vehicle: {
    bike: 'Vélo',
    scooter: 'Moto',
    car: 'Voiture',
  },
};
