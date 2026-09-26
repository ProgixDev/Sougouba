import type { Widen } from '../../types';
import type { auth as reference } from '../fr/auth';

export const auth: Widen<typeof reference> = {
  error: {
    no_such_account: 'No account matches that email address.',
    email_taken: 'An account already exists with that email address.',
    user_not_found: 'User not found.',
  },
  field: {
    fullName: 'Full name',
    email: 'Email address',
    password: 'Password',
    referralCode: 'Referral code',
    referralHint: 'Optional — the friend who invited you earns points too.',
  },
  welcome: {
    title: 'Welcome to Sougouba',
    body: 'The flavours of Africa and the Maghreb, delivered near you in Quebec.',
  },
  signIn: {
    title: 'Good to see you again',
    body: 'Sign in to carry on ordering.',
    submit: 'Sign in',
    forgot: 'Forgot your password?',
    noAccount: 'No account yet?',
  },
  signUp: {
    title: 'Create an account',
    body: 'Join Sougouba to order or to sell, in a few minutes.',
    submit: 'Create an account',
    hasAccount: 'Already have an account?',
  },
  forgot: {
    title: 'Forgotten password',
    body: 'Enter your email address — we will send you a link to reset it.',
    submit: 'Send the link',
    sentTitle: 'Check your email',
    sentBody: 'If an account exists for %{email}, a reset link has just been sent.',
    backToSignIn: 'Back to sign in',
  },
  or: 'or',
  oauth: {
    google: 'Continue with Google',
    apple: 'Continue with Apple',
  },
};
