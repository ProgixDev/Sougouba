import type { Widen } from '../../types';
import type { auth as reference } from '../fr/auth';

export const auth: Widen<typeof reference> = {
  error: {
    user_not_found: 'User not found.',
    code_invalid: 'That code is not right. Check it and try again.',
    code_expired: 'That code has expired. Ask for a new one.',
    code_cooldown: 'Wait a minute before asking for another code.',
    oauth_unavailable: 'Coming soon — continue with your email for now.',
    oauth_failed: 'Sign-in did not go through. Try again or continue with your email.',
  },
  field: {
    fullName: 'Full name',
    email: 'Email address',
    referralCode: 'Referral code',
    referralHint: 'Optional — the friend who invited you earns points too.',
  },
  welcome: {
    title: 'Welcome to Sougouba',
    body: 'The flavours of Africa and the Maghreb, delivered near you.',
    email: 'Continue with email',
    fineprint: 'No password — we just send you a code.',
  },
  email: {
    title: "What's your email?",
    body: "We'll send you a 6-digit code to sign in.",
    submit: 'Send my code',
  },
  code: {
    title: 'Enter your code',
    body: 'Sent to %{email}',
    change: 'Change',
    label: 'Sign-in code',
    resend: 'Resend the code',
    resendIn: 'Resend in %{seconds}s',
    resent: 'New code sent.',
  },
  name: {
    title: 'Nice to meet you! What should we call you?',
    body: 'This is what shops and couriers will see.',
    referralToggle: 'I have a referral code',
    submit: "Let's go",
  },
  or: 'or',
  oauth: {
    google: 'Continue with Google',
    apple: 'Continue with Apple',
  },
};
