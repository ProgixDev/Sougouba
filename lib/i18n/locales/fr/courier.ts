import { plural } from '../plural';

/** Livreur-facing screens. Keyed `courier.<file>.<element>`. */
export const courier = {
  tabs: {
    missions: 'Missions',
    history: 'Courses',
    earnings: 'Gains',
    profile: 'Profil',
  },
  earningsScreen: {
    title: 'Vos gains',
    collected: 'Encaissé',
    emptyTitle: 'Rien sur cette période',
    payoutNote:
      'Vos gains sont virés chaque vendredi sur le compte bancaire relié via Stripe. Les pourboires vous reviennent intégralement.',
  },
  payouts: {
    nextPayout: 'Prochain versement',
    activeTitle: 'Versements actifs',
    activeBody: 'Stripe dépose vos gains sur votre compte bancaire.',
    reviewTitle: 'Vérification en cours',
    reviewBody: 'Stripe vérifie vos informations. Vos gains vous attendent d’ici là.',
    reviewCta: 'Revoir mes informations',
    setupTitle: 'Ajoutez votre compte bancaire',
    setupBody:
      'Vos gains restent en attente tant qu’aucun compte n’est relié. Stripe recueille vos coordonnées bancaires — Sougouba ne les voit jamais.',
    setupCta: 'Configurer mes versements',
    unavailableTitle: 'Statut indisponible',
    unavailableBody: 'Impossible de joindre le service de paiement pour le moment. Vos gains sont bien enregistrés.',
    row: { active: 'Actifs', review: 'En vérification', setup: 'À configurer', unavailable: 'Indisponible', loading: '…' },
  },
  historyScreen: {
    title: 'Vos courses',
    delivered: 'Livrées',
    emptyTitle: 'Aucune course',
    emptyBody: 'Vos livraisons terminées s’afficheront ici.',
  },
  profile: {
    roleLabel: 'Livreur Sougouba',
    approved: 'Dossier validé',
    phone: 'Téléphone',
    yourFile: 'Votre dossier',
    yourPay: 'Votre rémunération',
    lifetimeEarnings: 'Gains cumulés',
    signOut: 'Se déconnecter',
  },
  delivery: {
    notFound: 'Cette course n’existe plus ou ne vous est pas attribuée.',
    codeTitle: 'Code de livraison',
    codeHint: 'Le client vous le donne à la remise. Il figure aussi sur sa commande.',
    toPickUp: 'À récupérer',
    distance: 'Distance de livraison',
    yourEarnings: 'Votre gain',
    reportProblem: 'Signaler un problème avec cette course',
    messageCustomer: 'Écrire au client',
    reported: 'Signalé',
  },
  proof: {
    title: 'Confirmer la livraison',
    takePhoto: 'Prendre une photo',
    retakePhoto: 'Reprendre la photo',
    tapToShoot: 'Toucher pour photographier',
  },
  report: {
    title: 'Signaler un problème',
    whatHappened: 'Ce qui s’est passé',
    submit: 'Envoyer le signalement',
    note: 'Votre signalement est transmis à Sougouba. La course reste ouverte — vous avez toujours la commande.',
  },
  gate: {
    pendingBody:
      'La validation prend généralement un jour ouvrable. Vous recevrez une notification dès que votre dossier est approuvé.',
  },
  signup: {
    confirmed: 'Dossier envoyé',
    note: 'Ces informations sont transmises à Sougouba pour validation. Rien n’est publié.',
  },
  signupForm: {
    payoutLater:
      'Vos versements se configurent avec Stripe une fois votre dossier approuvé — vos coordonnées bancaires ne passent jamais par Sougouba.',
    phone: 'Téléphone',
    cityHint: 'Les villes où Sougouba a des courses aujourd’hui.',
    postalHint:
      'Doit correspondre à la ville choisie. Sert à vous proposer les courses près de chez vous.',
    howDoYouDeliver: 'Comment livrez-vous ?',
    plate: 'Plaque d’immatriculation',
    licence: 'Numéro de permis de conduire',
    vehicleInsurance: 'Assurance du véhicule',
    insurer: 'Compagnie d’assurance',
    policy: 'Numéro de police',
    expiry: 'Échéance (MM/AAAA)',
    insuranceNote: 'Une preuve d’assurance vous sera demandée à la validation.',
    bikeNote:
      'Aucun document de véhicule n’est demandé pour une livraison à vélo. Une pièce d’identité vous sera demandée à la validation.',
    bankName: 'Nom de la banque',
    chooseBank: 'Choisir votre banque',
    bankOther: 'Nom de votre banque',
    account: 'Numéro de compte',
    payoutNote:
      'Vos gains sont versés par dépôt direct. Ces informations restent visibles de vous seul.',
    transit: 'Transit (5 chiffres)',
    submit: 'Envoyer mon dossier',
  },
  signupSteps: {
    identity: 'Vous et votre ville',
    vehicle: 'Votre véhicule',
    payout: 'Vos versements',
  },
  missionPhase: {
    to_pickup: 'En route vers le commerce',
    awaiting_pickup: 'Sur place — récupérez la commande',
    to_dropoff: 'En route vers le client',
    delivered: 'Livrée',
  },
  proofSteps: {
    code: 'Le client vous donne son code à 4 chiffres.',
    photo: 'Photographiez la commande à l’endroit où vous la laissez.',
    signature: 'Faites signer le client sur l’écran.',
    signatureCaptured: 'Signature recueillie à la livraison',
  },
  reportErrors: {
    describe: 'Décrivez brièvement ce qui s’est passé.',
    failed: 'Signalement impossible. Un problème a peut-être déjà été signalé.',
  },
  sendFailed: 'Envoi impossible. Veuillez réessayer.',
  insuranceLine: '%{insurer} — échéance %{expiry}',
  perKm: '%{amount} du kilomètre',
  mapPreview: 'Aperçu du trajet — la carte s’activera avec la clé Mapbox.',
  perRun: 'Par course',
  baseFarePerRun: '%{amount} par course',
  allYours: '100 % pour vous',
  noRunsToday: 'aucune course aujourd’hui',
  runsToday: plural({ zero: 'aucune course aujourd’hui', one: '%{count} course aujourd’hui', other: '%{count} courses aujourd’hui' }),
  bestDay: 'meilleur jour · %{label}',
  tipAmount: '%{amount} de pourboire',
  wrongCode: 'Code incorrect. Demandez-le au client.',
  yourBank: 'Votre banque',
  ranges: {
    today: 'Aujourd’hui',
    week: '7 jours',
    month: '30 jours',
  },
  missions: {
    waiting: 'En attente d’une course',
    offline: 'Vous êtes hors ligne',
    waitingBody: 'Nous vous proposons la prochaine commande prête près de vous.',
    offlineBody: 'Passez en ligne pour recevoir des propositions de course.',
    demoCode: 'Course de démonstration — code du client : %{code}',
  },
  gateCopy: {
    completeBody: 'Il reste quelques informations avant de pouvoir livrer : vos coordonnées, votre véhicule et vos documents.',
    pendingTitle: 'Dossier en attente',
    completeTitle: 'Complétez votre dossier',
    pendingBody:
      'Votre dossier est déposé. Un administrateur Sougouba doit le valider avant que vous puissiez recevoir des courses.',
  },
  earningsEmpty: {
    lifetime: 'Vous avez encaissé %{amount} depuis vos débuts. Passez en ligne pour ajouter à ce total.',
    body: 'Vos gains apparaîtront ici dès votre première course livrée.',
  },
  reportState: {
    alreadyTitle: 'Déjà signalé',
    nothingTitle: 'Rien à signaler',
    alreadyBody: 'Un problème a déjà été signalé sur cette course. Sougouba revient vers vous.',
    nothingBody: 'Cette course est terminée — il n’y a plus rien à débloquer.',
    notFoundTitle: 'Course introuvable',
  },
  signupConfirmed: {
    body: 'Votre candidature de livreur est partie en validation. Merci — nous revenons vers vous rapidement.',
    body3: 'Tant que le dossier est en attente, vous ne recevez aucune offre.',
    back: 'Retour aux missions',
    body1: 'Un administrateur Sougouba vérifie votre permis, votre assurance et vos coordonnées bancaires.',
    body2: 'Dès la validation, les courses proches de vous commencent à s’afficher.',
  },
  offer: {
    newRun: 'Nouvelle course',
    minimum: 'minimum',
    toPickup: '%{distance} pour le ramassage',
    toDropoff: '%{distance} de livraison',
    decline: 'Refuser',
    accept: 'Accepter',
  },
  mission: {
    onSite: 'Sur place — récupérez la commande',
    delivered: 'Livrée',
    accepted: 'Course acceptée',
    yourVehicle: 'Votre véhicule',
  },
  runCount: plural({ zero: 'aucune course', one: '%{count} course', other: '%{count} courses' }),
  history: {
    fromCity: 'depuis %{city}',
    tip: '%{amount} de pourboire',
    runsWithDistance: '%{runs} · %{distance}',
  },
  shift: {
    online: 'En ligne',
    offline: 'Hors ligne',
  },
  earnings: {
    /** `one` is suppletive — "hier" reads better than "les 1 jours précédents". */
    vsPrevious: plural({ one: 'Contre hier', other: 'Contre les %{count} jours précédents' }),
    vsPreviousShort: plural({ one: 'vs hier', other: 'vs %{count} j préc.' }),
    /**
     * Not a plural. "rien hier" and "pas de période à comparer" are different
     * *statements*, not two grammatical numbers of one — forcing them into one
     * key would leave a translator guessing which is which.
     */
    noComparisonYesterday: 'rien hier',
    noComparisonPeriod: 'pas de période à comparer',
    baseFareRow: 'Prise en charge (%{runs})',
    title: 'Gains · %{range}',
    distanceRow: 'Distance (%{distance})',
    tipsRow: 'Pourboires',
    rateNote:
      '%{base} par course plus %{perKm} du kilomètre livré. Les pourboires vous reviennent intégralement.',
  },
  chart: {
    title: 'Gains par jour',
    selectedDay: '%{label} · %{runs}',
    bestDay: 'meilleur jour · %{label}',
    barA11y: '%{label}, %{amount}, %{runs}',
  },
};
