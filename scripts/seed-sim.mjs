#!/usr/bin/env node
/**
 * Seeds the simulator's AsyncStorage with a signed-in session so the app boots
 * straight into a role's home, instead of driving four onboarding slides, an auth
 * form and a role gate through synthetic taps.
 *
 * Usage: node seed-sim.mjs <udid> <customer|business|courier>
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , UDID, ROLE = 'customer'] = process.argv;
const BUNDLE = 'pro.progix.sougouba';

const USERS = {
  customer: {
    id: 'usr_customer_demo',
    fullName: 'Aïssatou Diallo',
    email: 'aissatou@example.com',
    memberSince: '2025-11-14T09:00:00-05:00',
    role: 'customer',
    favoriteProductIds: ['prd_thieboudienne', 'prd_baklava_assortiment'],
    favoriteVendorIds: ['vnd_saveurs_dakar'],
    addresses: [{
      id: 'addr_usr_1', label: 'Domicile', street: '3450 Rue Jean-Talon Est',
      city: 'Montréal', postalCode: 'H1X 1G8', lat: 45.5605, lng: -73.6021, isDefault: true,
    }],
  },
  business: {
    id: 'usr_owner_bamako',
    fullName: 'Moussa Traoré',
    email: 'moussa@marchebamako.ca',
    role: 'business',
    favoriteProductIds: [], favoriteVendorIds: [], addresses: [],
  },
  courier: {
    id: 'usr_courier_awa',
    fullName: 'Awa Ndiaye',
    email: 'awa.ndiaye@example.com',
    role: 'courier',
    courierId: 'crr_awa',
    favoriteProductIds: [], favoriteVendorIds: [], addresses: [],
  },
};

const user = USERS[ROLE];
if (!user) throw new Error(`unknown role ${ROLE}`);

execFileSync('xcrun', ['simctl', 'terminate', UDID, BUNDLE], { stdio: 'ignore' });

const container = execFileSync('xcrun', ['simctl', 'get_app_container', UDID, BUNDLE, 'data'], { encoding: 'utf8' }).trim();
const dir = join(container, 'Library/Application Support', BUNDLE, 'RCTAsyncLocalStorage_V1');
mkdirSync(dir, { recursive: true });

// zustand/persist writes {"state":..,"version":..}; the session store is at v2
// and holds only `user` — everything else is derived.
const manifest = {
  'sougouba-session': JSON.stringify({ state: { user }, version: 2 }),
  'sougouba-theme': JSON.stringify({ state: { preference: 'light' }, version: 0 }),
};
writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
console.log(`seeded ${ROLE} (${user.fullName})`);

execFileSync('xcrun', ['simctl', 'launch', UDID, BUNDLE], { stdio: 'ignore' });
