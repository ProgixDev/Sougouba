import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { User, UserRole } from '@/data/types';
import { asyncStorage } from './storage';
import { useCartStore } from './useCartStore';
import { useDispatchStore } from './useDispatchStore';
import { useFavoritesStore } from './useFavoritesStore';
import { usePreferencesStore } from './usePreferencesStore';
import * as authApi from '../data/api/auth';
import { withdrawPushRegistration } from '../lib/push';

interface SessionState {
  user: User | null;
  signIn: (user: User) => void;
  signUp: (user: User) => void;
  setRole: (role: UserRole) => void;
  /** Edit the signed-in account. Ignored when signed out — there is nothing to patch. */
  updateUser: (patch: Partial<Omit<User, 'id' | 'role'>>) => void;
  signOut: () => void;
}

/**
 * `user` is the single source of truth for the whole session gate:
 *   - signed out            → user === null
 *   - signed up, no role    → user !== null && user.role === null
 *   - full session          → user !== null && user.role !== null
 *
 * Earlier versions mirrored this into `isAuthenticated` / `hasSelectedRole`
 * booleans, which could drift out of sync with `user.role` and strand the app
 * on a gate no screen could satisfy. Derive instead of duplicate — use the
 * selectors below rather than reading raw fields in guards.
 */
export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      user: null,

      signIn: (user) => {
        useFavoritesStore.getState().hydrate(user.favoriteProductIds, user.favoriteVendorIds);
        set({ user });
      },

      signUp: (user) => {
        useFavoritesStore.getState().hydrate(user.favoriteProductIds, user.favoriteVendorIds);
        set({ user });
      },

      setRole: (role) =>
        set((state) => (state.user ? { user: { ...state.user, role } } : state)),

      // `id` and `role` are deliberately not patchable: identity is what every
      // order and favourite is keyed on, and the role gate is one-way by design.
      updateUser: (patch) =>
        set((state) => (state.user ? { user: { ...state.user, ...patch } } : state)),

      signOut: () => {
        // ⚠️ Ends the **Supabase** session too, not just this store's copy of
        // the user. Clearing `user` alone used to be enough — there was no
        // session to end. Now a stale refresh token left in AsyncStorage would
        // keep minting access tokens for an account the app believes is signed
        // out, and the next sign-in would silently resume it.
        //
        // Deliberately not awaited: sign-out must not be blocked by the network,
        // and the local state below is what the UI reacts to. A failure here
        // leaves a token that expires on its own; a hang would leave a user
        // staring at a button that did nothing.
        //
        // The push token is withdrawn first, because the API needs the session
        // to know whose device it is deleting — after `signOut` it would 401
        // and this phone would keep receiving the old account's orders.
        void withdrawPushRegistration()
          .then(() => authApi.signOut())
          .catch(() => undefined);

        // Account-scoped stores must not leak into the next session.
        useCartStore.getState().clear();
        useFavoritesStore.getState().reset();
        usePreferencesStore.getState().reset();
        // A courier's online flag and their run must not follow the next
        // account that signs in on this device.
        useDispatchStore.getState().reset();
        set({ user: null });
      },
    }),
    {
      name: 'sougouba-session',
      storage: asyncStorage,
      version: 2,
      // v0 persisted `isAuthenticated` / `hasSelectedRole` alongside `user`;
      // v1 persisted `hasCompletedOnboarding`, which nothing reads now that
      // being signed out always means onboarding. Zustand merges shallowly, so
      // drop dead keys explicitly rather than letting them ride along on the
      // live state object.
      migrate: (persisted) => {
        const {
          isAuthenticated: _isAuthenticated,
          hasSelectedRole: _hasSelectedRole,
          hasCompletedOnboarding: _hasCompletedOnboarding,
          ...rest
        } = (persisted ?? {}) as Record<string, unknown>;
        return rest as unknown as SessionState;
      },
    }
  )
);

export const selectIsAuthenticated = (s: SessionState): boolean => s.user !== null;
export const selectRole = (s: SessionState): UserRole | null => s.user?.role ?? null;
