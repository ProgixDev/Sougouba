/** Shared by two or more personas. Anything used by exactly one belongs in that persona's file. */
export const common = {
  appName: 'Sougouba',
  continue: 'Continuer',
  cancel: 'Annuler',
  save: 'Enregistrer',
  seeAll: 'Tout voir',
  retry: 'Réessayer',
  loading: 'Chargement…',
  comingSoon: 'Bientôt disponible',
  requiredField: 'Ce champ est requis',
  genericError: 'Une erreur s’est produite. Veuillez réessayer.',
  /** Fallback when an order carries no customer name. */
  /** When a vendor name has not loaded yet, or the row predates the field. */
  genericShop: 'Commerce',
  genericCustomer: 'Client Sougouba',
  /** Day headings. The two nearest days get their names because that is how they are said out loud. */
  today: 'Aujourd’hui',
  yesterday: 'Hier',
  /**
   * Between items in a run-on list. A locale is entitled to a different one, so
   * it is a key rather than a `.join(', ')` buried in a component.
   */
  listSeparator: ', ',
  range7: '7 jours',
  range30: '30 jours',
  rangeDays: '%{count} jours',
  seeAllShort: 'Tout voir',
  later: 'Plus tard',
  order: 'Commande',
  orderRef: 'Commande %{reference}',
  delivery: 'Livraison',
  tracking: 'Suivi',
  dateAtTime: '%{date} à %{time}',
  stepLabel: 'Étape %{step} — %{title}',
  a11y: {
    edit: 'Modifier %{name}',
    navigateTo: 'Naviguer vers %{name}',
    remove: 'Supprimer %{name}',
    removeCard: 'Retirer la carte finissant par %{last4}',
    pointsEarned: 'Vous avez gagné %{count} points Sougouba',
    view: 'Voir %{name}',
    productOnSale: 'Produit en vente',
    addToCart: 'Ajouter %{name} au panier',
    runAt: 'Course chez %{shop}, %{amount}',
    priced: '%{name}, %{price}',
  },
  ui: {
    back: 'Retour',
    close: 'Fermer %{label}',
    choose: 'Choisir',
    city: 'Ville',
    showPassword: 'Afficher le mot de passe',
    hidePassword: 'Masquer le mot de passe',
    /**
     * The a11y separator. French puts a space before the colon and English does
     * not — an invisible difference a screen reader still pauses on, and the
     * reason this is a key rather than a `' : '` in JSX.
     */
    labelledValue: '%{label} : %{value}',
    quantity: 'Quantité : %{qty}',
    decrease: 'Diminuer la quantité',
    removeFromCart: 'Retirer du panier',
    increase: 'Augmenter la quantité',
  },
  price: {
    subtotal: 'Sous-total',
    /** GST/QST in English; the Québec acronyms are the French ones. */
    gst: 'Taxe fédérale (TPS)',
    qst: 'Taxe provinciale (TVQ)',
    delivery: 'Livraison',
    deliveryWithDistance: 'Livraison (%{distance})',
    points: 'Points Sougouba',
    coupon: 'Code promo',
    couponNamed: 'Code promo (%{code})',
    total: 'Total',
  },
  roleSelect: {
    title: 'Vous êtes...',
    body: 'Ce choix détermine votre expérience Sougouba — il ne peut pas être changé plus tard.',
    customer: {
      title: 'Je suis client',
      body: 'Je veux commander des produits auprès de commerces près de chez moi.',
    },
    business: {
      title: 'Je suis commerçant',
      body: 'Je veux inscrire ma boutique et vendre sur Sougouba.',
    },
    courier: {
      title: 'Je suis livreur',
      body: 'Je veux livrer les commandes des commerces de ma ville.',
    },
  },
  preferences: {
    title: 'Préférences',
    /** The courier profile said "Thème sombre" and the customer "Mode sombre". One control, one word. */
    darkMode: 'Mode sombre',
    darkModeA11y: 'Activer le mode sombre',
    language: 'Langue',
  },
  rating: {
    /** Read aloud for each star, and for a read-only row. */
    value: '%{value} sur 5',
  },
  /** `useImagePicker` — the one sheet every photo field opens. */
  imagePicker: {
    takePhoto: 'Prendre une photo',
    choosePhoto: 'Choisir dans la galerie',
    cameraDeniedTitle: 'Appareil photo non autorisé',
    cameraDeniedBody: 'Autorisez l’accès à l’appareil photo dans les réglages, ou choisissez une photo dans la galerie.',
  },
  /** One wording for the three profiles: the consequence is the same whatever the role. */
  deleteAccount: {
    action: 'Supprimer mon compte',
    confirmTitle: 'Supprimer votre compte ?',
    confirmBody:
      'Votre profil, vos adresses et vos favoris seront supprimés définitivement, et vos points Sougouba seront perdus. L’historique des commandes est conservé sans votre nom, pour des raisons comptables. Cette action est irréversible.',
    confirmAction: 'Supprimer',
    failedTitle: 'Suppression impossible',
  },
};
