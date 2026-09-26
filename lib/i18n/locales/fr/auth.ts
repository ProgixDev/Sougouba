/** Sign-in, sign-up and password-reset screens. */
export const auth = {
  /** Sign-in and sign-up failures, keyed by `AuthErrorCode` from `data/api/auth.ts`. */
  error: {
    no_such_account: 'Aucun compte ne correspond à cette adresse courriel.',
    email_taken: 'Un compte existe déjà avec cette adresse courriel.',
    user_not_found: 'Utilisateur introuvable.',
  },
  /** Field labels, shared by all three screens. */
  field: {
    fullName: 'Nom complet',
    email: 'Adresse courriel',
    password: 'Mot de passe',
    referralCode: 'Code de parrainage',
    referralHint: 'Optionnel — un ami qui vous a invité y gagne aussi des points.',
  },
  welcome: {
    title: 'Bienvenue sur Sougouba',
    body: 'Les saveurs d’Afrique et du Maghreb, livrées près de chez vous au Québec.',
  },
  signIn: {
    title: 'Content de vous revoir',
    body: 'Connectez-vous pour continuer vos commandes.',
    submit: 'Se connecter',
    forgot: 'Mot de passe oublié ?',
    noAccount: 'Pas encore de compte ?',
  },
  signUp: {
    title: 'Créer un compte',
    body: 'Rejoignez Sougouba pour commander ou vendre en quelques minutes.',
    submit: 'Créer un compte',
    hasAccount: 'Déjà un compte ?',
  },
  forgot: {
    title: 'Mot de passe oublié',
    body: 'Entrez votre adresse courriel — nous vous enverrons un lien pour le réinitialiser.',
    submit: 'Envoyer le lien',
    sentTitle: 'Vérifiez vos courriels',
    /** `%{email}` is what the person typed, echoed back so they can spot a typo. */
    sentBody: 'Si un compte existe pour %{email}, un lien de réinitialisation vient d’être envoyé.',
    backToSignIn: 'Retour à la connexion',
  },
  /** Separator between the form and the OAuth buttons. */
  or: 'ou',
  oauth: {
    /** Brand names stay as they are; only the verb is translated. */
    google: 'Continuer avec Google',
    apple: 'Continuer avec Apple',
  },
};
