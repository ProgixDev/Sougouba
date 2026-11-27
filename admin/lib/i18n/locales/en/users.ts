import type { Shape } from '../../types';
import type { users as fr } from '../fr/users';

export const users: Shape<typeof fr> = {
  roles: {
    customer: 'Customer',
    business: 'Merchant',
    courier: 'Courier',
    admin: 'Administrator',
  },
  roleGroups: {
    customer: 'Customers',
    business: 'Merchants',
    courier: 'Couriers',
    admin: 'Administrators',
    none: 'No role',
  },
  fields: {
    name: 'Name',
    email: 'Email',
    role: 'Role',
    memberSince: 'Member since',
    lastSignIn: 'Last sign-in',
  },
  list: {
    title: 'Users',
    description: 'Every account on the platform: customers, merchants and couriers.',
    allTab: 'All',
    columns: {
      joined: 'Joined',
      linkedTo: 'Linked to',
    },
    csv: {
      id: 'ID',
      linkedShop: 'Linked shop',
      linkedCourier: 'Linked courier',
    },
    kpi: {
      customersHint: { one: '{count} has already ordered', other: '{count} have already ordered' },
      newAccounts: 'New accounts · 30 days',
      newAccountsHint: 'All roles combined',
      professionals: 'Merchants · couriers',
      professionalsHint: { one: '{count} account with no role chosen', other: '{count} accounts with no role chosen' },
      blocked: 'Blocked accounts',
      blockedHint: 'Sign-in and checkout refused',
    },
    signups: {
      title: 'Sign-ups',
      subtitle: 'New accounts per week, 8 weeks',
    },
    byRole: 'By role',
    searchPlaceholder: 'Search for a name or an email…',
    emptyTitle: 'No users',
    emptyDescription: 'No user matches this filter at the moment.',
  },
  detail: {
    notFound: 'User not found',
    blockedBadge: 'Blocked',
    actions: {
      block: 'Block',
      unblock: 'Unblock',
    },
    toasts: {
      blocked: '{name} has been blocked.',
      unblocked: '{name} has been unblocked.',
      failed: 'The action could not be completed.',
    },
    blockedNotice: 'This account can no longer sign in or order. Its orders and history are kept. The reason is in the audit log.',
    contact: {
      title: 'Contact details',
    },
    link: {
      title: 'Affiliation',
      savedAddresses: 'Saved addresses',
    },
    dialog: {
      blockTitle: 'Block this account?',
      blockDescription:
        'The person will no longer be able to sign in or place an order (within an hour at the latest for a session already open, immediately at checkout). Nothing is deleted. Give the reason.',
      unblockTitle: 'Unblock this account?',
      unblockDescription: 'The person will be able to sign in and order again.',
    },
  },
};
