import type { Shape } from '../../types';
import type { auth as fr } from '../fr/auth';

export const auth: Shape<typeof fr> = {
  slides: {
    marketTitle: 'The neighbourhood’s grocers,',
    marketAccent: 'in one place',
    marketBody: 'Approve shops, follow their orders and keep an eye on their catalogue.',
    dishTitle: 'The restaurants that',
    dishAccent: 'make the difference',
    dishBody: 'Reviews, promo codes and disputes: everything that touches quality goes through here.',
    courierTitle: 'Couriers followed',
    courierAccent: 'on every run',
    courierBody: 'Applications, incidents and the week’s payouts, without leaving the console.',
  },
  title: 'Sign in to the console',
  subtitle: 'Enter the email and password of your administrator account.',
  badge: 'Administration console',
  merchantQuestion: 'Are you a merchant?',
  merchantLink: 'Go to your portal.',
  email: 'Email',
  emailPlaceholder: 'firstname@sougouba.ca',
  password: 'Password',
  passwordPlaceholder: 'Your password',
  hidePassword: 'Hide the password',
  showPassword: 'Show the password',
  signingIn: 'Signing in…',
  signIn: 'Sign in',
  forgot: 'Forgot your password? Ask an administrator to reset your access.',
  copyright: '© {year} Sougouba',
};
