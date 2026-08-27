/**
 * Every user-facing string on the site, in one module.
 *
 * The app made the same call (lib/copy/common.ts: "so future i18n extraction is a
 * find-and-replace, not an archaeology dig"). The site ships fr-CA only and has no
 * language toggle — a toggle with one language in it is a dead control — but
 * keeping the copy out of JSX costs nothing now and saves a rewrite if that
 * changes.
 *
 * Voice: vous, never tu. Short sentences. No exclamation marks. Name things —
 * "attiéké", not "authentic ingredients"; "Parc-Extension", not "your
 * neighbourhood". A promise this specific is the one thing a generic delivery app
 * cannot copy.
 *
 * Every figure here traces to the shipped app, the cahier des charges or the
 * contract. Nothing is invented. See docs/LANDING-MASTER-PROMPT.md §1.
 */

export const LOCALE = 'fr-CA';
export const CURRENCY = 'CAD';

/** Narrow no-break space — required before : ? ! % and $ in French typography. */
export const NNBSP = ' ';
/** Non-breaking space, for "Phase 1" style pairings. */
export const NBSP = ' ';

/** 1234.5 -> "1 234,50 $" — space as thousands separator, comma decimal, $ after. */
export function money(value: number) {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY }).format(value);
}

export const site = {
  name: 'Sougouba',
  domain: 'sougouba.ca',
  support: 'soutien@sougouba.ca',
  builtBy: 'Progix Inc.',
  builtByNeq: 'NEQ 1181317117',
  title: 'Sougouba — Les épiceries africaines et maghrébines du Grand Montréal',
  description:
    "Commerces africains et maghrébins de Montréal, Montréal-Nord, Laval et Longueuil, réunis dans une seule application. Commandez auprès du commerce, suivez la préparation, recevez à la maison.",
};

export const nav = {
  links: [
    { href: '#comment', label: 'Comment ça marche' },
    { href: '#commerces', label: 'Commerces' },
    { href: '#partenaire', label: 'Devenir partenaire' },
    { href: '#livreurs', label: 'Livreurs' },
  ],
  cta: 'Inscrire ma boutique',
  skipToContent: 'Aller au contenu',
};

/** Neighbourhoods, not cities. "Parc-Extension" tells a Montrealer this is for them. */
export const neighbourhoods = [
  'Côte-des-Neiges',
  'Villeray',
  'Parc-Extension',
  'Saint-Laurent',
  'Montréal-Nord',
  'Chomedey',
  'Vieux-Longueuil',
];

export const hero = {
  headline: ["Les épiceries d'ici,", 'enfin', 'réunies'],
  sub: "Commerces africains et maghrébins, livrés chez vous. Commandez auprès du commerce, suivez la préparation, recevez à la maison.",
  // The apps are not live, so the page cannot ask for a download.
  ctaPrimary: 'Être prévenu du lancement',
  ctaSecondary: 'Je suis commerçant',
  trust: ['Paiement sécurisé Stripe', 'Apple Pay et Google Pay', 'Suivi GPS en direct'],
};

export const proof = {
  eyebrow: 'La preuve',
  stats: [
    { value: 10, label: 'commerces' },
    { value: 78, label: 'produits' },
    { value: 8, label: 'catégories' },
    { value: 2, label: 'verticales' },
  ],
  note: 'Épicerie et Restaurant. Chaque commerce est vérifié et approuvé manuellement avant sa mise en ligne.',
  halal: 'Tous nos commerces sont certifiés halal',
};

export const verticals = {
  eyebrow: 'Deux verticales',
  title: 'Épicerie ou restaurant',
  items: [
    {
      key: 'epicerie' as const,
      name: 'Épicerie',
      photo: 'shopping',
      blurb: "Les rayons de vos épiceries, boucheries et marchés, au complet.",
      shops: ['Marché Bamako', 'Épicerie Atlas', 'Boucherie du Sahel', 'Épicerie Teranga', 'Souk El Medina', 'Marché Kilimandjaro'],
    },
    {
      key: 'restaurant' as const,
      name: 'Restaurant',
      photo: 'table',
      blurb: 'Entrées, plats, desserts et boissons, commandés directement à la cuisine.',
      shops: ['Saveurs de Dakar', 'Douceurs du Maghreb', 'Café Tanit', 'Chez Mama Adjoa'],
    },
  ],
};

/** The page's loudest moment. Roughly one word in four is set in mustard. */
export const ingredients = {
  eyebrow: 'Le rayon',
  title: "Ce qu'on ne trouve pas ailleurs",
  words: [
    'ras el hanout', 'attiéké', 'bissap', 'fonio', 'agneau halal', 'gari',
    'jaxatu', 'chebakia', 'msemen', 'jollof', 'harissa', 'baghrir',
    'niébé', 'sukuma wiki', 'igname', 'manioc', 'merguez', 'lben',
  ],
  closing: 'Les rayons de dix commerces, au complet.',
};

export const howItWorks = {
  eyebrow: 'Comment ça marche',
  title: 'Trois étapes, pas une de plus',
  steps: [
    { n: '01', title: 'Choisissez votre commerce', body: 'Épicerie ou restaurant, près de chez vous.' },
    { n: '02', title: 'Payez en sécurité', body: 'Apple Pay, Google Pay ou carte. Traité par Stripe.' },
    { n: '03', title: 'Suivez la livraison', body: 'Le livreur apparaît sur la carte, en direct.' },
  ],
};

export const tracking = {
  eyebrow: 'En direct',
  title: 'Vous savez exactement où en est votre commande',
  body: "De la préparation à votre porte, chaque étape s'affiche en direct. Le livreur et vous lisez la même horloge, donc vos deux écrans ne peuvent pas se contredire.",
  hint: 'Faites défiler pour suivre la course.',
  etaLabel: 'Arrivée estimée',
  courier: 'Awa N.',
  vehicle: 'À vélo · Parc-Extension',
};

export const threeApps = {
  eyebrow: 'Trois applications',
  title: 'Une plateforme, trois métiers',
  chapters: [
    {
      key: 'client' as const,
      kicker: 'Pour vous',
      title: 'Le marché, dans votre poche',
      body: "Parcourez dix commerces, gardez vos favoris, retrouvez votre panier habituel en deux gestes.",
      points: ['Recherche et filtres', 'Favoris et commandes passées', 'Suivi de livraison en direct'],
    },
    {
      key: 'commerce' as const,
      kicker: 'Pour votre commerce',
      title: 'Le comptoir',
      body: 'Catalogue, commandes, ventes et versements, dans un seul tableau de bord.',
      points: ['File des commandes à préparer', 'Catalogue et stock', 'Ventes, commission et versements'],
    },
    {
      key: 'livreur' as const,
      kicker: 'Pour les livreurs',
      title: 'La course',
      body: 'Une offre à la fois, la carte en plein écran, et vos gains à jour.',
      points: ['Offres près de vous', 'Navigation et preuve de livraison', 'Gains et versements'],
    },
  ],
};

export const merchant = {
  eyebrow: 'Devenir partenaire',
  title: 'Vendez à tout le Grand Montréal',
  body: "Catalogue, commandes, ventes et versements, dans un seul tableau de bord. Vous êtes payé automatiquement par Stripe Connect.",
  terms: [
    { value: '12 %', label: 'de commission sur chaque vente' },
    { value: '70 $', label: "par mois d'abonnement" },
  ],
  termsNote: "Les deux s'appliquent ensemble.",
  included: [
    'Versements automatiques par Stripe Connect',
    'Tableau de bord commandes, catalogue et ventes',
    'Les frais de livraison sont fixés par Sougouba selon la distance — vous n’avez rien à saisir',
    'Inscription validée manuellement par un administrateur avant la mise en ligne',
  ],
  steps: [
    { title: 'Votre commerce', body: "Le nom de votre boutique, sa catégorie — épicerie ou restaurant — et sa spécialité." },
    { title: 'Adresse et livraison', body: "Où vous êtes et le délai que vous annoncez à vos clients. Les frais de livraison sont fixés par Sougouba selon la distance." },
    { title: 'Documents et validation', body: "Votre numéro d'entreprise, la personne responsable, et le permis MAPAQ pour un restaurant. Un administrateur valide avant la mise en ligne." },
  ],
  cta: 'Inscrire ma boutique',
};

export const courier = {
  eyebrow: 'Devenir livreur',
  title: 'Livrez pour les commerces de votre quartier',
  body: "Vous choisissez quand vous êtes en ligne. Une offre à la fois, trente secondes pour décider.",
  pay: [
    { value: '3,50 $', label: 'de prise en charge par course' },
    { value: '0,90 $', label: 'par kilomètre jusqu’au client' },
    { value: '100 %', label: 'des pourboires — Sougouba ne prélève rien dessus' },
  ],
  payNote: 'Vélo, moto ou voiture.',
  steps: [
    { title: 'Vous et votre véhicule', body: "Vos coordonnées, votre ville et le moyen avec lequel vous livrez — vélo, moto ou voiture." },
    { title: 'Vos documents', body: "Pièce d'identité, permis de conduire si nécessaire, et preuve d'assurance pour un véhicule motorisé." },
    { title: 'Validation manuelle', body: "Un administrateur Sougouba examine votre dossier. Vous recevez les premières courses une fois approuvé." },
  ],
  delay: 'La validation prend généralement un jour ouvrable.',
  cta: 'Devenir livreur',
};

/**
 * A real basket of seeded products at their real prices, checked against
 * data/taxes.ts (TPS 5 %, TVQ 9,975 %, products only) and data/deliveryPricing.ts
 * (3,4 km falls in the <=5 km band at 3,99 $).
 */
export const receipt = {
  eyebrow: 'La note',
  title: 'Ligne par ligne',
  body: "Les taxes s'appliquent aux produits seulement, jamais aux frais de livraison.",
  lines: [
    { label: 'Ras el hanout', sub: 'Épicerie Atlas', amount: 5.5 },
    { label: 'Banane plantain', sub: 'Épicerie Atlas', amount: 3.25 },
    { label: 'Jus de bissap', sub: 'Épicerie Atlas', amount: 4.25 },
    { label: 'Merguez maison', sub: 'Épicerie Atlas', amount: 11.99 },
    { label: 'Fonio précuit', sub: 'Épicerie Atlas', amount: 9.49 },
  ],
  subtotalLabel: 'Sous-total (produits)',
  gstLabel: `Taxe fédérale (TPS${NNBSP}5${NNBSP}%)`,
  qstLabel: `Taxe provinciale (TVQ${NNBSP}9,975${NNBSP}%)`,
  deliveryLabel: 'Livraison (3,4 km)',
  totalLabel: 'Total',
  footnote:
    "Les frais de livraison dépendent de la distance : 2,99 $ jusqu'à 2 km, 3,99 $ jusqu'à 5 km, et 8,99 $ au-delà de 12 km. Ils sont fixés par Sougouba, pas par le commerce.",
};

export const finalCta = {
  title: 'Le grand marché, dans votre poche',
  body: "Les applications iOS et Android arrivent. Laissez-nous votre courriel et vous serez prévenu le jour de l'ouverture.",
  storeIos: "Bientôt sur l'App Store",
  storeAndroid: 'Bientôt sur Google Play',
  emailLabel: 'Adresse courriel',
  emailHelper: "Une seule lettre, le jour de l'ouverture. Rien d'autre.",
  submit: 'Me prévenir',
  success: {
    title: "C'est noté",
    body: "Vous recevrez un courriel le jour de l'ouverture. D'ici là, nous ne vous écrirons pas.",
  },
  errors: {
    empty: 'Entrez votre adresse courriel.',
    invalid: 'Cette adresse semble incomplète — vérifiez le @ et le domaine.',
    failed: "L'envoi a échoué. Réessayez dans un instant.",
    unconfigured: "Le formulaire n'est pas encore relié à une liste d'envoi.",
  },
};

export const footer = {
  columns: [
    { title: 'Sougouba', links: [{ label: 'Comment ça marche', href: '#comment' }, { label: 'Commerces', href: '#commerces' }, { label: 'La note', href: '#note' }] },
    { title: 'Commerçants', links: [{ label: 'Devenir partenaire', href: '#partenaire' }, { label: 'Tarifs', href: '#partenaire' }] },
    { title: 'Livreurs', links: [{ label: 'Devenir livreur', href: '#livreurs' }, { label: 'Gains', href: '#livreurs' }] },
    { title: 'Soutien', links: [{ label: site.support, href: `mailto:${site.support}` }] },
  ],
  /** Recorded in docs/PROGRESS.md. Confirm the wording with the client before launch. */
  meaning: 'Sougouba — « le grand marché », en bambara.',
  builtBy: 'Conçu et développé par Progix Inc., Montréal.',
  credits: 'Photographies sous licence Pexels.',
  rights: 'Tous droits réservés.',
};
