import type { Widen } from '../../types';
import type { validation as reference } from '../fr/validation';

export const validation: Widen<typeof reference> = {
  email: {
    /** "Email address", not "courriel" — the French side keeps the Québec term, this side does not borrow it. */
    required: 'Email address required',
    invalid: 'Invalid email address',
  },
  password: {
    required: 'Password required',
    tooShort: 'At least 6 characters',
  },
  fullName: { required: 'Full name required' },
  phone: {
    required: 'Phone number required',
    invalid: 'Invalid phone number',
  },
  city: {
    required: 'City required',
    unserved: 'Sougouba does not deliver to this city yet',
  },
  address: {
    labelRequired: 'Name required (e.g. Home)',
    streetRequired: 'Address required',
    postalCodeInvalid: 'Invalid postal code (e.g. H2S 3K9)',
    postalCodeWrongCity: 'This postal code is in %{actual}, not %{city}',
    postalCodeUnserved: 'This postal code is not in a city we deliver to',
  },
  payment: {
    holderRequired: 'Cardholder name required',
    cardFormat: '15 or 16 digits',
    expiryFormat: 'MM/YY format',
  },
  merchant: {
    nameRequired: 'Shop name required',
    typeRequired: 'Choose a category',
    specialtyRequired: 'Speciality required',
    specialtyTooLong: 'Too long — one line under the shop name',
    etaFormat: 'Lead time in minutes',
    etaRange: 'Between 10 and 180 minutes',
    /** NEQ is the Québec business number; it keeps its name in English too. */
    neqFormat: 'NEQ must be 10 digits',
    contactRequired: 'Contact name required',
    mapaqRequired: 'MAPAQ permit required for a restaurant',
  },
  courier: {
    vehicleRequired: 'Choose a vehicle',
    plateRequired: 'Licence plate required',
    licenceRequired: 'Licence number required',
    insurerRequired: 'Insurer required',
    policyRequired: 'Policy number required',
    expiryFormat: 'Expiry as MM/YYYY',
    policyExpired: 'This policy has expired',
    bankRequired: 'Choose your bank',
    bankUnknown: 'Unknown bank',
    bankOtherRequired: 'Bank name required',
    transitFormat: 'Transit must be 5 digits',
    accountFormat: 'Invalid account number',
  },
  product: {
    nameRequired: 'Product name required',
    descriptionRequired: 'Describe the product in a few words',
    categoryRequired: 'Choose a category',
    sectionRequired: 'Choose an aisle',
    priceRequired: 'Price required',
    stockRequired: 'Stock quantity required',
    numberInvalid: 'Invalid number',
    mustBePositive: 'Must be greater than 0',
    compareAtTooLow: 'The struck-through price must be higher than the sale price',
    fieldRequired: 'Required',
  },
};
