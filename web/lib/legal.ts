/**
 * The two legal documents, in one module — same principle as `lib/content.ts`,
 * kept separate only because they are ten times its length and change on a
 * different clock (a lawyer's, not a designer's).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THIS IS A DRAFT. IT HAS NOT BEEN REVIEWED BY A LAWYER.
 *
 * Everything here is written from what the app and the API actually do — the
 * tax rule, the distance-banded delivery fee, the single-shop cart, the 12 % +
 * 70 $ merchant terms, the courier GPS lifecycle, Stripe never handing us a card
 * number. Nothing is boilerplate borrowed from another service, and nothing
 * describes a behaviour the code does not have.
 *
 * What it is NOT is legal advice. Before launch it needs:
 *   1. the ⟦bracketed⟧ facts below filled in — the rest are the client's to
 *      answer. Three have been answered since this was written, and none of
 *      them was ever really a question for the client:
 *        · the Supabase hosting region — eu-west-1, Ireland, confirmed against
 *          the live pooler rather than assumed. §8 says so plainly, because
 *          "hors du Québec" is a disclosure the law requires and not a detail
 *          to leave vague.
 *        · the two retention periods. They were marked "à décider" because
 *          nothing purged either table, and a published period that no code
 *          enforces is not a policy — it is a claim. `RetentionService` and
 *          migration `0029` are that code; §5 and §9 now state 30 days for the
 *          GPS trail and a year for delivery proofs because those are the
 *          numbers a nightly job actually applies, read from `platform_settings`
 *          so the published figure and the enforced one cannot drift apart.
 *          Changing them is an audited admin action.
 *   2. a Quebec lawyer's pass, in particular on §15 of the terms (limitation of
 *      liability against the Loi sur la protection du consommateur) and on the
 *      Loi 25 obligations in the privacy policy;
 *   3. `REVIEWED` flipped to true, which is what lets the pages be indexed.
 *
 * ⟦…⟧ renders as a visible amber "à compléter" chip. That is deliberate: a
 * placeholder that looks like prose is a placeholder that ships.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { site } from './content';

/**
 * False until a lawyer has passed and every ⟦…⟧ is gone. While false, both pages
 * carry a draft banner and are served `noindex` — a page saying "à compléter"
 * has no business in a search result.
 */
export const REVIEWED = false;

/** Shown on both documents. Bump when the text changes, not when the code does. */
export const LAST_UPDATED = '3 septembre 2026';

export const draftNotice =
  "Version de travail. Ce texte décrit le fonctionnement réel du service mais n'a pas encore été revu par un conseiller juridique, et les mentions surlignées restent à compléter. Il ne lie personne en l'état.";

// ── Blocks ──────────────────────────────────────────────────────────────────

export type LegalBlock =
  | { kind: 'p'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] };

const p = (text: string): LegalBlock => ({ kind: 'p', text });
const h3 = (text: string): LegalBlock => ({ kind: 'h3', text });
const ul = (...items: string[]): LegalBlock => ({ kind: 'list', items });
const table = (head: string[], rows: string[][]): LegalBlock => ({ kind: 'table', head, rows });

export type LegalSection = { id: string; title: string; blocks: LegalBlock[] };

export type LegalDoc = {
  slug: string;
  title: string;
  /** <title> and OG. Shorter than the h1 heading. */
  metaTitle: string;
  metaDescription: string;
  lede: string;
  sections: LegalSection[];
};

/**
 * fr-CA typography, applied once at render instead of asked of every author.
 *
 * NNBSP (U+202F) before : ; ! ? % and $. The colon rule only fires on a
 * space-preceded colon, so `https://` is untouched.
 *
 * Guillemets get the ordinary no-break space (U+00A0), not the narrow one:
 * « and » are wide glyphs and U+202F beside them closes up to nothing on
 * screen — checked in a browser, « nous » read as «nous». Escapes rather than
 * literal invisible characters, so a diff on this function is readable.
 */
const NNBSP = '\u202f';
const NBSP = '\u00a0';

export function typo(text: string) {
  return text
    .replace(/[ \u00a0\u202f]([:;!?%$])/g, `${NNBSP}$1`)
    .replace(/«[ \u00a0\u202f]/g, `«${NBSP}`)
    .replace(/[ \u00a0\u202f]»/g, `${NBSP}»`);
}

/** Splits a string on ⟦…⟧ so the renderer can mark the gaps. */
export function splitPlaceholders(text: string) {
  return text.split(/(⟦[^⟧]*⟧)/).filter(Boolean).map((part) =>
    part.startsWith('⟦')
      ? { placeholder: true as const, text: part.slice(1, -1) }
      : { placeholder: false as const, text: part }
  );
}

// ── Privacy ─────────────────────────────────────────────────────────────────

export const privacy: LegalDoc = {
  slug: 'confidentialite',
  title: 'Politique de confidentialité',
  metaTitle: 'Politique de confidentialité — Sougouba',
  metaDescription:
    "Les renseignements personnels que Sougouba recueille, pourquoi, avec qui ils sont partagés, combien de temps ils sont conservés et les droits que vous pouvez exercer.",
  lede: "Sougouba met en relation des commerces d'alimentation africains et maghrébins du Grand Montréal, leurs clients et des livreurs. Pour que cela fonctionne, l'application recueille des renseignements personnels. Cette politique dit lesquels, pourquoi, qui y a accès, combien de temps ils sont conservés et ce que vous pouvez exiger.",
  sections: [
    {
      id: 'exploitant',
      title: "1. Qui exploite le service",
      blocks: [
        p("L'application mobile et le site Sougouba sont exploités par ⟦dénomination légale de l'exploitant⟧, dont le siège social est situé au ⟦adresse du siège social⟧, Québec, Canada ⟦NEQ de l'exploitant⟧."),
        p(`Le développement et la maintenance technique sont assurés par ${site.builtBy} (${site.builtByNeq}), Montréal, à titre de fournisseur. Progix n'exploite pas le service et n'accède aux renseignements que pour les besoins de la maintenance, sur instruction de l'exploitant.`),
        p("Dans ce document, « nous » désigne l'exploitant."),
      ],
    },
    {
      id: 'responsable',
      title: '2. Le responsable de la protection des renseignements personnels',
      blocks: [
        p("La loi québécoise exige qu'une personne soit nommément responsable de la protection des renseignements personnels et que ses coordonnées soient publiques. Elles le sont ici."),
        ul(
          "Responsable : ⟦nom et titre du responsable⟧",
          `Courriel : ${site.support}`,
          'Adresse postale : ⟦adresse postale pour les demandes d\'accès⟧'
        ),
        p("C'est à cette personne que s'adressent les demandes décrites à la section 10."),
      ],
    },
    {
      id: 'collecte',
      title: '3. Ce que nous recueillons',
      blocks: [
        p("Cela dépend de ce que vous faites sur Sougouba. Nous ne recueillons rien qui ne serve à l'une des finalités de la section 4."),
        h3('Si vous commandez'),
        ul(
          "Votre nom, votre adresse courriel et votre mot de passe. Le mot de passe est chiffré à sens unique : nous ne le connaissons pas et ne pouvons pas vous le rappeler.",
          "Votre numéro de téléphone, pour que le livreur puisse vous joindre.",
          "Vos adresses de livraison : rue, ville, code postal, et les indications que vous ajoutez vous-même (« porte de côté », « sonner deux fois »).",
          "Vos commandes : les articles, le commerce, les montants, les taxes, les frais de livraison, et l'heure de chaque changement de statut.",
          "Votre solde de points de fidélité et l'historique complet des mouvements qui le composent, vos parrainages et les coupons utilisés.",
          "Vos commerces et produits favoris.",
          "Vos échanges avec nous : signalements de problème, réponses du commerçant, messages au soutien."
        ),
        p("Nous ne recueillons pas votre numéro de carte. Voir la section 6."),
        h3('Si vous inscrivez un commerce'),
        ul(
          "La raison sociale, l'adresse du commerce, le numéro d'entreprise du Québec (NEQ), le numéro de permis du MAPAQ et les coordonnées de la personne-ressource.",
          "Les heures d'ouverture, le catalogue de produits et les photos que vous publiez.",
          "L'historique des commandes reçues, des commissions retenues et des versements."
        ),
        p("Ces renseignements servent d'abord à décider si la boutique est mise en ligne. Un refus ou une suspension est motivé par écrit."),
        h3('Si vous livrez'),
        ul(
          "Votre nom, vos coordonnées, votre ville et votre code postal.",
          "Votre numéro de permis de conduire et le type de véhicule que vous utilisez.",
          "Votre assurance, pour tout véhicule motorisé : assureur, numéro de police et date d'expiration.",
          "Votre position pendant que vous êtes en service. Voir la section 5.",
          "Les preuves de livraison que vous produisez : signature du client ou photo du colis, avec l'heure.",
          "Votre historique de courses et la rémunération correspondante."
        ),
        p("Vos coordonnées bancaires sont recueillies par Stripe au moment de votre inscription à Stripe Connect. Elles ne transitent pas par nos serveurs et n'y sont pas conservées."),
      ],
    },
    {
      id: 'finalites',
      title: '4. Pourquoi nous les recueillons',
      blocks: [
        ul(
          "Exécuter la commande : la transmettre au commerce, l'attribuer à un livreur, la livrer à la bonne adresse.",
          "Établir le prix : le sous-total, les taxes et les frais de livraison, qui dépendent de la distance entre le commerce et vous.",
          "Vous tenir informé de l'avancement de la commande et vous permettre de la suivre.",
          "Tenir le programme de fidélité et les parrainages.",
          "Traiter les signalements, les litiges et les remboursements.",
          "Prévenir la fraude et les abus, notamment les comptes multiples créés pour toucher plusieurs fois une récompense de parrainage.",
          "Respecter nos obligations fiscales, comptables et légales.",
          "Comprendre l'usage du service et l'améliorer, à partir de données agrégées."
        ),
        p("Nous ne vendons pas vos renseignements personnels. Nous ne les louons pas. Nous ne les utilisons pas pour de la publicité ciblée pour le compte de tiers."),
      ],
    },
    {
      id: 'geolocalisation',
      title: '5. La géolocalisation',
      blocks: [
        p("C'est le renseignement le plus sensible que le service manipule, il mérite sa propre section."),
        h3('Si vous commandez'),
        p("Nous convertissons l'adresse de livraison que vous saisissez en coordonnées, pour mesurer la distance jusqu'au commerce — c'est cette distance qui détermine les frais de livraison — et pour tracer l'itinéraire affiché pendant le suivi. Nous ne suivons pas la position de votre téléphone."),
        h3('Si vous livrez'),
        p("Pendant qu'une course est en cours, l'application transmet votre position à intervalles réguliers. Elle sert à trois choses et à rien d'autre : montrer au client où en est sa commande, choisir le livreur le plus proche lorsqu'une course est offerte, et établir la distance qui détermine votre rémunération."),
        p("La transmission s'arrête lorsque vous vous mettez hors service. Elle ne reprend pas d'elle-même."),
        p("Les positions transmises sont conservées 30 jours, puis supprimées automatiquement chaque nuit. Ce n'est pas une intention : une tâche planifiée les efface, et le délai est celui que le service applique réellement."),
        p("Votre position n'est jamais montrée au client en dehors d'une course qui lui est destinée, ni au commerce."),
      ],
    },
    {
      id: 'paiements',
      title: '6. Les paiements',
      blocks: [
        p("Les paiements sont traités par Stripe. Le numéro de carte, la date d'expiration et le cryptogramme sont saisis dans un formulaire fourni par Stripe et transmis directement à Stripe. Ils ne passent pas par nos serveurs."),
        p("De la transaction, nous conservons : les quatre derniers chiffres et la marque de la carte tels que Stripe nous les rapporte, l'identifiant Stripe du paiement, le montant, la devise et le statut."),
        p("Nous n'avons jamais accès au numéro complet de votre carte."),
        p("Stripe traite ces renseignements également pour ses propres obligations de conformité. Sa politique de confidentialité est publiée sur stripe.com."),
      ],
    },
    {
      id: 'partage',
      title: '7. Avec qui ils sont partagés',
      blocks: [
        h3('Entre les personnes de la commande'),
        ul(
          "Le commerce voit votre nom, le contenu de la commande, son montant et les instructions que vous avez laissées sur les articles.",
          "Le livreur assigné voit votre nom, votre numéro de téléphone, l'adresse de livraison et vos indications, à partir du moment où il accepte la course et jusqu'à la livraison.",
          "Un livreur à qui une course est offerte mais qui ne l'accepte pas ne voit pas votre adresse.",
          "Vous voyez le prénom du livreur et sa position pendant la livraison."
        ),
        h3('Nos fournisseurs'),
        p("Ils agissent pour notre compte, sur instruction, et n'ont pas le droit d'utiliser vos renseignements à leurs propres fins."),
        table(
          ['Fournisseur', 'Rôle', 'Ce qu\'il traite'],
          [
            ['Stripe', 'Paiements, commissions, versements', "Montants, identifiants de transaction, coordonnées bancaires des commerçants et des livreurs"],
            ['Supabase', 'Hébergement de la base de données et des fichiers', "L'ensemble des renseignements décrits à la section 3"],
            ['Mapbox', 'Géocodage et itinéraires', 'Adresses et coordonnées, sans votre identité'],
            ['Firebase Cloud Messaging (Google)', 'Notifications poussées ⟦prévu, pas encore en service⟧', "Identifiant d'appareil"],
          ]
        ),
        h3('Personne d\'autre'),
        p("Sauf lorsque la loi l'exige : ordonnance d'un tribunal, demande légale d'un organisme public, ou obligation fiscale."),
      ],
    },
    {
      id: 'hors-quebec',
      title: '8. La communication hors du Québec',
      blocks: [
        p("Nos serveurs de base de données sont situés en Irlande (région AWS eu-west-1). Stripe, Mapbox et Google traitent également une partie des renseignements à l'extérieur du Canada."),
        p("Vos renseignements ne sont donc pas conservés au Québec, ni au Canada. Ils relèvent du droit européen de la protection des données, qui impose des obligations au moins équivalentes à celles du Québec — mais la loi québécoise exige que nous le disions, et non que nous le supposions."),
        p("Avant de communiquer des renseignements personnels à l'extérieur du Québec, la loi nous impose d'évaluer si le régime du pays destinataire leur accorde une protection adéquate, et de consigner cette évaluation. ⟦Évaluation des facteurs relatifs à la vie privée : à réaliser avant le lancement.⟧"),
      ],
    },
    {
      id: 'conservation',
      title: '9. Combien de temps nous les gardons',
      blocks: [
        p("Un renseignement dont la finalité est remplie est supprimé ou anonymisé, sauf lorsqu'une loi impose de le garder plus longtemps."),
        table(
          ['Renseignement', 'Durée'],
          [
            ['Compte et profil', "Tant que le compte existe, puis 12 mois"],
            ['Commandes et factures', "6 ans après la fin de l'exercice financier, comme l'exigent les lois fiscales fédérale et québécoise"],
            ['Mouvements de points de fidélité', "Tant que le compte existe"],
            ['Positions GPS des livreurs', '30 jours après leur enregistrement'],
            [
              'Preuves de livraison',
              "1 an. Une preuve rattachée à un litige encore ouvert n'est jamais supprimée tant qu'il n'est pas tranché : c'est la pièce qui répond à « la commande n'est jamais arrivée ».",
            ],
            ["Documents d'inscription des commerces et des livreurs", "Pendant la relation, puis ⟦à décider⟧"],
            ['Signalements et litiges', '3 ans après la clôture'],
            ['Registre des incidents de confidentialité', '5 ans, comme la loi l\'exige'],
          ]
        ),
      ],
    },
    {
      id: 'droits',
      title: '10. Vos droits',
      blocks: [
        p("Ils s'exercent auprès du responsable nommé à la section 2. Nous répondons dans les 30 jours. Un refus est motivé par écrit et indique le recours ouvert."),
        ul(
          "Accès : obtenir la liste des renseignements que nous détenons sur vous et en recevoir copie.",
          "Rectification : faire corriger un renseignement inexact, incomplet ou équivoque.",
          "Retrait du consentement : cesser un traitement auquel vous aviez consenti, et faire supprimer votre compte.",
          "Portabilité : recevoir les renseignements que vous nous avez fournis dans un format technologique structuré et couramment utilisé.",
          "Désindexation : demander que cesse la diffusion d'un renseignement, ou son référencement, lorsque la loi le permet."
        ),
        p("Certains renseignements ne peuvent pas être effacés à la demande. Une facture émise doit être conservée pour des raisons fiscales, même si le compte est supprimé."),
        p("Si notre réponse ne vous satisfait pas, vous pouvez porter plainte à la Commission d'accès à l'information du Québec, cai.gouv.qc.ca."),
      ],
    },
    {
      id: 'securite',
      title: '11. Comment ils sont protégés',
      blocks: [
        ul(
          "L'accès aux données est appliqué par la base de données elle-même, et non seulement par l'application : un client ne peut lire que ses propres commandes, un livreur que ses propres courses, un commerçant que sa propre boutique. Une erreur dans le code de l'application ne suffit donc pas à ouvrir les données d'autrui.",
          "Les mots de passe sont chiffrés à sens unique.",
          "Les échanges entre l'application et nos serveurs sont chiffrés en transit.",
          "Les documents d'inscription et les preuves de livraison sont conservés dans un stockage privé, jamais derrière une adresse publique devinable.",
          "Les coordonnées bancaires ne sont pas dans notre base de données : elles sont chez Stripe."
        ),
        p("Aucune mesure n'est parfaite. En cas d'incident de confidentialité présentant un risque de préjudice sérieux, nous vous en avisons, nous avisons la Commission d'accès à l'information, et l'incident est consigné dans un registre."),
      ],
    },
    {
      id: 'temoins',
      title: '12. Les témoins, sur ce site',
      blocks: [
        p("Le site sougouba.ca ne dépose aucun témoin publicitaire et n'utilise aucun traceur tiers."),
        p("Il conserve une seule valeur dans le stockage local de votre navigateur : le thème clair ou sombre que vous avez choisi. Elle ne quitte pas votre appareil et ne nous est jamais transmise."),
        p("Si une mesure d'audience est ajoutée un jour, cette section sera mise à jour avant sa mise en service, pas après."),
      ],
    },
    {
      id: 'mineurs',
      title: '13. Les mineurs',
      blocks: [
        p("Le service n'est pas destiné aux personnes de moins de 14 ans et nous ne recueillons pas sciemment leurs renseignements. Un parent ou un tuteur qui constate le contraire peut nous écrire : le compte sera supprimé."),
      ],
    },
    {
      id: 'modifications',
      title: '14. Les modifications de cette politique',
      blocks: [
        p("Toute modification est publiée sur cette page avec sa date. Une modification qui change la finalité d'une collecte vous est signalée dans l'application avant d'être appliquée, et votre consentement est redemandé lorsque la loi l'exige."),
      ],
    },
    {
      id: 'joindre',
      title: '15. Nous joindre',
      blocks: [
        p(`Pour toute question sur cette politique ou pour exercer un droit : ${site.support}.`),
      ],
    },
  ],
};

// ── Terms ───────────────────────────────────────────────────────────────────

export const terms: LegalDoc = {
  slug: 'conditions',
  title: "Conditions d'utilisation",
  metaTitle: "Conditions d'utilisation — Sougouba",
  metaDescription:
    "Les règles du service Sougouba : commandes, prix et taxes, livraison, annulations et remboursements, fidélité, et les conditions propres aux commerçants et aux livreurs.",
  lede: "Ces conditions encadrent l'usage de l'application et du site Sougouba. Les utiliser, c'est les accepter. Elles sont écrites pour être lues.",
  sections: [
    {
      id: 'objet',
      title: "1. Ce que Sougouba est, et ce qu'il n'est pas",
      blocks: [
        p("Sougouba est une place de marché. Nous mettons en relation des commerces d'alimentation indépendants, leurs clients et des livreurs indépendants."),
        p("Le vendeur est le commerce, pas Sougouba. Il fixe ses prix, compose son catalogue, prépare la commande, et répond de la qualité et de la conformité de ce qu'il vend — y compris des mentions relatives aux allergènes, à la certification halal, à la composition et aux dates de péremption."),
        p("Nous fournissons l'application, l'encaissement, l'attribution des livraisons et le service de soutien."),
      ],
    },
    {
      id: 'compte',
      title: '2. Votre compte',
      blocks: [
        ul(
          "Vous devez avoir 18 ans ou plus pour ouvrir un compte.",
          "Les renseignements que vous fournissez doivent être exacts et tenus à jour. Une adresse de livraison erronée est une commande perdue.",
          "Votre mot de passe est personnel. Ce qui se passe depuis votre compte vous est imputé, sauf si vous nous avez signalé qu'il était compromis.",
          "Un compte par personne. Les comptes multiples ouverts pour toucher plusieurs fois une récompense de parrainage sont fermés et les récompenses annulées."
        ),
      ],
    },
    {
      id: 'zone',
      title: '3. La zone desservie',
      blocks: [
        p("Sougouba dessert Montréal, Montréal-Nord, Laval et Longueuil. La liste des villes et des codes postaux admissibles est celle que l'application applique au moment où vous commandez ; elle peut s'étendre."),
        p("Une adresse hors zone est refusée à la saisie, pas après le paiement."),
      ],
    },
    {
      id: 'commandes',
      title: '4. Les commandes',
      blocks: [
        p("Une commande vaut offre d'achat auprès du commerce. Le contrat de vente est conclu lorsque le commerce l'accepte."),
        p("Un panier ne peut contenir des articles que d'un seul commerce. Pour commander auprès de deux commerces, passez deux commandes. ⟦Point à confirmer : le contrat commercial mentionne un panier multi-commerces ; l'application, elle, est mono-commerce.⟧"),
        p("Les quantités affichées reflètent l'inventaire déclaré par le commerce. Un article peut se révéler indisponible après l'acceptation : le commerce vous en avise, et la commande est ajustée ou annulée avec remboursement de la différence."),
      ],
    },
    {
      id: 'prix',
      title: '5. Les prix, les taxes et les frais',
      blocks: [
        ul(
          "Les prix sont en dollars canadiens et fixés par le commerce.",
          "La TPS (5 %) et la TVQ (9,975 %) s'appliquent selon la nature des produits. Elles sont calculées toutes deux sur le sous-total, et non l'une sur l'autre.",
          "Les frais de livraison sont fixés par Sougouba, pas par le commerce, selon la distance entre le commerce et votre adresse, par paliers. Le montant exact est affiché avant le paiement.",
          "Le total affiché avant le paiement est celui qui est facturé. Aucun montant ne s'y ajoute après coup."
        ),
      ],
    },
    {
      id: 'paiement',
      title: '6. Le paiement',
      blocks: [
        p("Le paiement se fait par les moyens proposés dans l'application, traités par Stripe."),
        p("Aucune commande n'est créée tant que le paiement n'est pas confirmé. Un panier abandonné à l'écran de paiement n'est pas une commande et ne vous engage à rien."),
        p("Le paiement à la livraison n'est pas offert."),
      ],
    },
    {
      id: 'livraison',
      title: '7. La livraison',
      blocks: [
        p("Les délais affichés sont des estimations fondées sur la distance et sur le temps de préparation annoncé par le commerce. Ce sont des estimations, pas des garanties."),
        ul(
          "Vous devez être joignable au numéro de téléphone de votre compte pendant la livraison.",
          "Le livreur remet la commande contre un code de remise ou une signature. La preuve est conservée.",
          "Si personne ne peut recevoir la commande à l'adresse indiquée, ⟦politique en cas d'absence du client — à définir avec le client⟧."
        ),
      ],
    },
    {
      id: 'annulation',
      title: '8. Annulation, retours et remboursements',
      blocks: [
        ul(
          "Vous pouvez annuler sans frais tant que le commerce n'a pas commencé la préparation.",
          "Une fois la préparation commencée, ⟦politique d'annulation après acceptation — à définir avec le client⟧.",
          "Les denrées périssables ne sont pas reprises, sauf si elles sont non conformes, avariées, manquantes ou périmées.",
          "Un problème se signale depuis la commande, dans l'application. Le commerce répond ; à défaut d'entente, Sougouba tranche et la décision est motivée.",
          "Un remboursement est effectué sur le moyen de paiement d'origine.",
          "Les points de fidélité obtenus sur une commande remboursée sont retirés."
        ),
        p("Rien dans cet article ne réduit les droits que la Loi sur la protection du consommateur vous accorde."),
      ],
    },
    {
      id: 'fidelite',
      title: '9. Le programme de fidélité',
      blocks: [
        ul(
          "Des points sont accordés sur le sous-total des commandes livrées.",
          "Le taux d'accumulation, le taux de conversion, le plafond de conversion par commande, la durée de validité des points et la récompense de parrainage sont fixés par Sougouba et peuvent être modifiés. Le taux applicable à une commande est celui affiché dans l'application au moment où elle est passée.",
          "Les points n'ont pas de valeur monétaire. Ils ne sont ni transférables, ni monnayables, ni remboursables.",
          "Un parrainage est récompensé une seule fois, à la première commande livrée du filleul.",
          "Sauf mention contraire, un seul coupon peut être appliqué par commande."
        ),
      ],
    },
    {
      id: 'commercants',
      title: '10. Si vous êtes commerçant',
      blocks: [
        ul(
          "L'inscription est soumise à une approbation. Sougouba peut la refuser ou la suspendre ; dans les deux cas, le motif est communiqué par écrit.",
          "Vous garantissez détenir les permis exigés pour ce que vous vendez, notamment votre permis du MAPAQ, et les maintenir valides pendant toute la durée de la relation.",
          "Vous répondez de l'exactitude de votre catalogue : prix, composition, allergènes, mention halal, dates.",
          "La rémunération de Sougouba est cumulative : une commission de 12 % du sous-total de chaque commande livrée, et un abonnement mensuel de 70 $. Les taxes s'ajoutent.",
          "Les sommes vous sont versées par Stripe Connect, selon le calendrier de Stripe.",
          "Un abonnement impayé peut entraîner le retrait de la boutique du catalogue ⟦délai de grâce avant retrait — à définir avec le client⟧."
        ),
      ],
    },
    {
      id: 'livreurs',
      title: '11. Si vous livrez',
      blocks: [
        ul(
          "Les livreurs sont des travailleurs autonomes. Ces conditions ne créent ni contrat de travail, ni société, ni mandat général.",
          "L'inscription est soumise à une approbation : permis de conduire valide et, pour tout véhicule motorisé, assurance en vigueur.",
          "Vous maintenez votre permis et votre assurance valides, et vous nous avisez sans délai s'ils cessent de l'être. Une assurance expirée entraîne la suspension du compte.",
          "Une offre de course peut être refusée ou laissée expirer.",
          "La rémunération d'une course est calculée à la livraison, selon le barème en vigueur à ce moment-là, et n'est pas recalculée ensuite.",
          "Les versements sont hebdomadaires, par Stripe Connect. Vous devez compléter l'inscription Stripe pour être payé.",
          "Vous êtes responsable de vos obligations fiscales."
        ),
      ],
    },
    {
      id: 'interdits',
      title: '12. Ce qui est interdit',
      blocks: [
        ul(
          "Revendre les produits commandés sur Sougouba.",
          "Extraire le catalogue par des moyens automatisés.",
          "Contourner le paiement dans l'application, y compris en réglant directement le commerce ou le livreur une commande passée sur Sougouba.",
          "Usurper l'identité d'une autre personne ou d'un commerce.",
          "Harceler, menacer ou discriminer un livreur, un commerçant, un client ou un membre du soutien.",
          "Tenter d'accéder à des données qui ne vous appartiennent pas, ou d'entraver le fonctionnement du service."
        ),
      ],
    },
    {
      id: 'propriete',
      title: '13. Contenu et propriété intellectuelle',
      blocks: [
        p("La marque Sougouba, le logo, l'application et le site appartiennent à ⟦dénomination légale de l'exploitant⟧."),
        p("Le commerce conserve ses droits sur ses photos et ses descriptions, et nous accorde une licence non exclusive et sans redevance pour les afficher dans l'application, sur le site et dans la promotion du service, tant que la boutique y est présente."),
        p("Ce que vous écrivez dans un signalement ou un message reste le vôtre."),
      ],
    },
    {
      id: 'disponibilite',
      title: '14. La disponibilité du service',
      blocks: [
        p("Le service est fourni tel quel. Nous ne garantissons ni une disponibilité continue, ni l'absence d'erreur, ni que le service conviendra à un usage particulier."),
        p("Une interruption planifiée est annoncée à l'avance lorsque cela est possible."),
      ],
    },
    {
      id: 'responsabilite',
      title: '15. La responsabilité',
      blocks: [
        p("Sougouba répond de ses propres fautes."),
        p("Sougouba n'est pas le vendeur des produits et ne répond ni de leur qualité, ni de leur conformité, ni des mentions publiées par le commerce."),
        p("Rien dans ces conditions n'écarte la responsabilité pour un préjudice corporel ou moral, ni les droits que la Loi sur la protection du consommateur vous accorde. Toute stipulation du présent article qui y contreviendrait est sans effet dans cette mesure."),
        p("Pour le reste, notre responsabilité à l'égard d'une commande est limitée au montant payé pour cette commande."),
      ],
    },
    {
      id: 'suspension',
      title: '16. La suspension et la fermeture',
      blocks: [
        p("Nous pouvons suspendre ou fermer un compte en cas de fraude, d'impayé, de manquement à ces conditions, ou de comportement mettant en cause la sécurité d'une personne. Sauf urgence, le motif est communiqué et un délai est laissé pour y remédier."),
        p("Vous pouvez fermer votre compte à tout moment depuis l'application. Les commandes en cours doivent d'abord être livrées ou annulées."),
      ],
    },
    {
      id: 'modifications-cg',
      title: '17. Les modifications de ces conditions',
      blocks: [
        p("Nous pouvons modifier ces conditions. La version applicable à une commande est celle en vigueur au moment où elle est passée."),
        p("Une modification importante est annoncée dans l'application au moins 30 jours avant sa prise d'effet."),
      ],
    },
    {
      id: 'droit',
      title: '18. Le droit applicable et la langue',
      blocks: [
        p("Ces conditions sont régies par le droit applicable au Québec. Tout litige relève des tribunaux du district judiciaire de Montréal, sous réserve des règles impératives qui protègent le consommateur."),
        p("Ces conditions sont rédigées en français. Toute traduction est fournie à titre d'information ; en cas de divergence, la version française prévaut."),
      ],
    },
    {
      id: 'joindre-cg',
      title: '19. Nous joindre',
      blocks: [p(`Pour toute question sur ces conditions : ${site.support}.`)],
    },
  ],
};

export const legalDocs = [terms, privacy];
