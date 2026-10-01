import type { Widen } from '../../types';
import type { onboarding as reference } from '../fr/onboarding';

export const onboarding: Widen<typeof reference> = {
  merchant: {
    business: {
      title: 'Your business',
      body: 'Your shop’s name, its category — grocery or restaurant — and what it specialises in.',
    },
    address: {
      title: 'Address and delivery',
      body: 'Where you are and the lead time you quote your customers. Delivery fees are set by Sougouba, by distance.',
    },
    documents: {
      title: 'Documents and review',
      body: 'Your business number, the person responsible, and a MAPAQ permit for a restaurant. An administrator reviews it before you go live.',
    },
  },
  courier: {
    identity: {
      title: 'You and your vehicle',
      body: 'Your contact details, your city, and how you deliver — bike, scooter or car.',
    },
    documents: {
      title: 'Your documents',
      body: 'Photo ID, a driving licence if you need one, and proof of insurance for a motor vehicle.',
    },
    review: {
      title: 'Manual review',
      body: 'A Sougouba administrator reviews your file. You start receiving runs once approved.',
    },
  },
  onboardingSheet: {
    merchantTitle: 'Register my shop',
    courierTitle: 'Deliver with Sougouba',
    body:
      'Three steps, right in the app. An administrator then reviews your file before your shop goes live.',
    courierBody:
      'Three steps, right in the app. An administrator then reviews your file before your first run.',
  },
  stepOf: 'Step %{step} — %{title}',

  slides: {
    market: {
      title: 'Local grocers,\nfinally in one place',
      body: 'African and Maghrebi shops across Montreal, Montreal North, Laval and Longueuil, gathered in a single app.',
    },
    spices: {
      title: 'What you can’t\nfind anywhere else',
      body: 'Ras el hanout, attiéké, bissap, halal lamb, fonio: ten shops’ shelves, in full.',
    },
    table: {
      title: 'Order, track,\nreceive',
      body: 'From the kitchen to your door, every step of your order shows live.',
    },
    shopping: {
      title: 'Your usual basket,\nin two taps',
      body: 'Your favourites and past orders stay within reach — no need to search for everything again.',
    },
  },
  skip: 'Skip',
  next: 'Next',
  start: 'Get started',
};
