import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { User, UserRole } from '@/data/types';
import { asyncStorage } from './storage';
import { useCartStore } from './useCartStore';
import { useFavoritesStore } from './useFavoritesStore';
import { usePreferencesStore } from './usePreferencesStore';

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

      signIn: (user) => set({ user }),

      signUp: (user) => set({ user }),

      setRole: (role) =>
        set((state) => (state.user ? { user: { ...state.user, role } } : state)),

      // `id` and `role` are deliberately not patchable: identity is what every
      // order and favourite is keyed on, and the role gate is one-way by design.
      updateUser: (patch) =>
        set((state) => (state.user ? { user: { ...state.user, ...patch } } : state)),

      signOut: () => {
        // Account-scoped stores must not leak into the next session.
        useCartStore.getState().clear();
        useFavoritesStore.getState().reset();
        usePreferencesStore.getState().reset();
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
