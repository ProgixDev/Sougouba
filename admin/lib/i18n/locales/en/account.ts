import type { Shape } from '../../types';
import type { account as fr } from '../fr/account';

export const account: Shape<typeof fr> = {
  saving: 'Saving…',
  header: {
    fallbackName: 'Administrator',
    memberSince: 'Member since {date}',
    member: 'Member',
    lastSignIn: 'Last sign-in {date}',
  },
  role: {
    title: 'My role: {role}',
    permissionCount: { one: '{count} permission', other: '{count} permissions' },
    noAccess: 'No access',
    assignedBy: 'Your role is assigned by an administrator who manages access. To change it, ask them.',
  },
  activity: {
    title: 'My recent activity',
    total: { one: '{count} action in total', other: '{count} actions in total' },
    empty: 'No actions recorded yet.',
    quotedReason: '“{reason}”',
  },
  info: {
    title: 'My information',
    nameLabel: 'Display name',
    nameHelper: 'Visible in the audit log and the list of administrators.',
    emailLabel: 'Email',
    emailHelper: 'To change the address, an administrator who manages access must create new access for you.',
    saved: 'Name updated.',
    saveFailed: 'Could not save.',
  },
  password: {
    title: 'Password',
    current: 'Current password',
    currentHelper: 'If you have just been added, this is the temporary password you received.',
    next: 'New password',
    minLength: 'At least {min} characters.',
    confirm: 'Confirm',
    mismatch: 'The two passwords do not match.',
    same: 'The new password must be different from the current one.',
    noSession: 'Session not found. Sign in again.',
    wrongCurrent: 'Current password is incorrect.',
    changeFailed: 'Could not change the password. Try again in a moment.',
    changed: 'Password changed.',
    submit: 'Change the password',
  },
  sessions: {
    title: 'Sessions',
    body: 'A computer left behind or a lost device? Sign out of all your sessions except this one. They will have to sign in again with your password.',
    signOutFailed: 'Could not sign out. Try again in a moment.',
    signedOut: 'Your other sessions are signed out.',
    signingOut: 'Signing out…',
    signOutOthers: 'Sign out my other sessions',
    auditLink: 'Everyone’s actions stay in the audit log.',
  },
  appearance: {
    title: 'Appearance',
    light: 'Light',
    dark: 'Dark',
  },
};
