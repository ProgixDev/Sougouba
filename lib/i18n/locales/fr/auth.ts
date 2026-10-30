/** The passwordless entry flow (`app/(auth)/welcome.tsx`): choose → email → code → name. */
export const auth = {
  /** Keyed by `AuthErrorCode` from `data/api/auth.ts`. */
  error: {
    user_not_found: 'Utilisateur introuvable.',
    code_invalid: 'Code incorrect. Vérifiez-le et réessayez.',
    code_expired: 'Ce code a expiré. Demandez-en un nouveau.',
    code_cooldown: 'Patientez une minute avant de redemander un code.',
    oauth_unavailable: 'Bientôt disponible — continuez avec votre courriel pour l’instant.',
    oauth_failed: 'La connexion n’a pas abouti. Réessayez ou continuez avec votre courriel.',
  },
  /** Field labels — `fullName` and `email` are also used by the account editor. */
  field: {
    fullName: 'Nom complet',
    email: 'Adresse courriel',
    referralCode: 'Code de parrainage',
    referralHint: 'Facultatif — l’ami qui vous a invité gagne aussi des points.',
  },
  welcome: {
    title: 'Bienvenue sur Sougouba',
    body: 'Les saveurs d’Afrique et du Maghreb, livrées près de chez vous.',
    email: 'Continuer avec un courriel',
    fineprint: 'Pas de mot de passe : on vous envoie un code, c’est tout.',
  },
  email: {
    title: 'Quel est votre courriel ?',
    body: 'Nous vous enverrons un code à 6 chiffres pour vous connecter.',
    submit: 'Recevoir mon code',
  },
  code: {
    title: 'Entrez votre code',
    body: 'Envoyé à %{email}',
    change: 'Modifier',
    label: 'Code de connexion',
    resend: 'Renvoyer le code',
    resendIn: 'Renvoyer dans %{seconds} s',
    resent: 'Nouveau code envoyé.',
  },
  name: {
    title: 'Enchanté ! Comment vous appelez-vous ?',
    body: 'C’est ce que verront les commerçants et les livreurs.',
    referralToggle: 'J’ai un code de parrainage',
    submit: 'C’est parti',
  },
  or: 'ou',
  oauth: {
    google: 'Continuer avec Google',
    apple: 'Continuer avec Apple',
  },
};
