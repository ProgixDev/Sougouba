/**
 * Form error messages.
 *
 * The schemas under `lib/validation/` carry these *keys* rather than sentences —
 * they are built at module scope, so a sentence baked in there is baked in for
 * the life of the process. `lib/validation/resolver.ts` turns them into words at
 * submit time. See the note in `lib/validation/message.ts`.
 *
 * The register is Québec French on purpose: "courriel", not "e-mail".
 */
export const validation = {
  email: {
    required: 'Adresse courriel requise',
    invalid: 'Adresse courriel invalide',
  },
  password: {
    required: 'Mot de passe requis',
    tooShort: 'Minimum 6 caractères',
  },
  fullName: { required: 'Nom complet requis' },
  phone: {
    required: 'Numéro de téléphone requis',
    invalid: 'Numéro de téléphone invalide',
  },
  city: {
    required: 'Ville requise',
    unserved: 'Sougouba ne dessert pas encore cette ville',
  },
  address: {
    labelRequired: 'Nom requis (ex. Domicile)',
    streetRequired: 'Adresse requise',
    postalCodeInvalid: 'Code postal invalide (ex. H2S 3K9)',
    postalCodeWrongCity: 'Ce code postal est à %{actual}, pas à %{city}',
    postalCodeUnserved: 'Ce code postal n’est pas dans une ville desservie',
  },
  payment: {
    holderRequired: 'Nom du titulaire requis',
    cardFormat: 'Numéro à 15 ou 16 chiffres',
    expiryFormat: 'Format MM/AA',
  },
  merchant: {
    nameRequired: 'Nom de la boutique requis',
    typeRequired: 'Choisissez une catégorie',
    specialtyRequired: 'Spécialité requise',
    etaFormat: 'Délai en minutes',
    etaRange: 'Entre 10 et 180 minutes',
    neqFormat: 'NEQ à 10 chiffres',
    neqOrProof: 'Indiquez votre NEQ ou joignez une preuve d’immatriculation',
    legalNameRequired: 'Nom légal de l’entreprise requis',
    gstFormat: 'Numéro de TPS au format 123456789 RT0001',
    qstFormat: 'Numéro de TVQ au format 1234567890 TQ0001',
    mapaqExpiryFormat: 'Date au format JJ/MM/AAAA',
    mapaqExpired: 'Ce permis est expiré',
    mapaqPermitRequired: 'Joignez une copie du permis MAPAQ',
    idRequired: 'Joignez une pièce d’identité du dirigeant',
    payoutRequired: 'Choisissez comment recevoir vos paiements',
    bankDocumentRequired: 'Joignez un document officiel de votre banque',
    contactRequired: 'Nom du responsable requis',
    mapaqRequired: 'Numéro de permis MAPAQ requis',
  },
  courier: {
    vehicleRequired: 'Choisissez un véhicule',
    plateRequired: 'Plaque requise',
    licenceRequired: 'Numéro de permis requis',
    insurerRequired: 'Assureur requis',
    policyRequired: 'Numéro de police requis',
    expiryFormat: 'Échéance au format MM/AAAA',
    policyExpired: 'Cette police est échue',
    bankRequired: 'Choisissez votre banque',
    bankUnknown: 'Banque inconnue',
    bankOtherRequired: 'Nom de la banque requis',
    transitFormat: 'Transit à 5 chiffres',
    accountFormat: 'Numéro de compte invalide',
  },
  product: {
    nameRequired: 'Nom du produit requis',
    descriptionRequired: 'Décrivez le produit en quelques mots',
    categoryRequired: 'Choisissez une catégorie',
    sectionRequired: 'Choisissez un rayon',
    priceRequired: 'Prix requis',
    stockRequired: 'Quantité en stock requise',
    numberInvalid: 'Nombre invalide',
    mustBePositive: 'Doit être supérieur à 0',
    compareAtTooLow: 'Le prix barré doit être supérieur au prix de vente',
    fieldRequired: 'Requis',
  },
};
