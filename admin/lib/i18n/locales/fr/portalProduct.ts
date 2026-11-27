/** The merchant portal's product form (`components/merchant/ProductEditor.tsx`) — one for "new" and for "edit". */
export const portalProduct = {
  /** What the product is sorted on: a « rayon » in a grocery, a « section du menu » in a restaurant. */
  shelf: {
    grocery: 'Rayon',
    restaurant: 'Section du menu',
  },
  /** Said under the field it is about. */
  errors: {
    name: 'Nom du produit requis',
    description: 'Décrivez le produit en quelques mots (10 caractères au moins)',
    section: 'Choisissez un rayon',
    category: 'Choisissez une catégorie',
    price: 'Prix requis, par exemple 4,99',
    compareAtInvalid: 'Montant invalide',
    compareAtTooLow: 'Le prix barré doit être supérieur au prix de vente',
    stock: 'Quantité en stock requise (0 si épuisé)',
    tags: 'Vingt étiquettes au maximum',
    calories: 'Nombre entier requis',
    grams: 'Valeur requise, par exemple 12,5',
  },
  toast: {
    fixFields: 'Corrigez les champs indiqués avant d’enregistrer.',
    noChanges: 'Aucune modification à enregistrer',
    saved: 'Produit enregistré',
    added: 'Produit ajouté',
    saveFailed: 'Enregistrement impossible. Veuillez réessayer.',
    removed: 'Produit supprimé',
    removeFailed: 'Suppression impossible. Veuillez réessayer.',
  },
  /** A shop with no shelf yet cannot file a product anywhere. */
  noSections: {
    title: 'Créez d’abord un rayon',
    body: 'Chaque produit est rangé dans un rayon de votre boutique (« Épices », « Boissons »…). Ajoutez-en au moins un, puis revenez ajouter vos produits.',
    link: 'Gérer mes rayons',
  },
  /** The banner on a product the Sougouba team has hidden. */
  hidden: {
    title: 'Ce produit a été masqué par l’équipe Sougouba',
    reason: 'Motif : {reason}.',
    noReason: 'Les clients ne le voient plus.',
    fix: 'Corrigez-le puis contactez le soutien pour le faire réafficher.',
  },
  details: {
    title: 'Le produit',
    name: 'Nom du produit',
    description: 'Description',
    descriptionHelper: 'Ce que c’est, d’où ça vient, comment on s’en sert.',
    choose: 'Choisir…',
    category: 'Catégorie Sougouba',
    categoryHelper: 'Là où les clients trouvent le produit en parcourant l’application.',
    tags: 'Étiquettes',
    tagsHelper: 'Séparées par des virgules : halal, bio, sans gluten…',
  },
  photo: 'Photo',
  pricing: {
    title: 'Prix et stock',
    price: 'Prix ($)',
    compareAt: 'Prix barré ($)',
    compareAtHelper: 'L’ancien prix, pour une promotion.',
    stock: 'Quantité en stock',
    available: 'En vente',
    availableHint: 'Désactivé, le produit reste dans votre catalogue mais les clients ne le voient pas.',
  },
  nutrition: {
    title: 'Valeurs nutritionnelles',
    hint: 'Facultatif. Affichées sur la fiche du produit.',
    calories: 'Calories',
    protein: 'Protéines (g)',
    fat: 'Lipides (g)',
    weight: 'Poids (g)',
  },
  actions: {
    saving: 'Enregistrement…',
    add: 'Ajouter le produit',
    remove: 'Supprimer le produit',
  },
  remove: {
    title: 'Supprimer ce produit ?',
    body: '« {name} » sera retiré de votre catalogue. Les commandes déjà passées ne changent pas.',
  },
};
