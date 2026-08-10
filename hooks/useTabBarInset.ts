import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** React Navigation's iOS tab bar content height, above the home-indicator inset. */
const TAB_BAR_CONTENT_HEIGHT = 49;

/**
 * Space a tab screen must reserve at its bottom.
 *
 * The tab bar is positioned absolutely so content can scroll under its blur —
 * which also means it no longer takes part in layout, so anything at the bottom
 * of a tab screen would sit behind it. Every scroll container and pinned footer
 * inside `(tabs)` adds this.
 *
 * Computed rather than read from `useBottomTabBarHeight()`: that hook lives in
 * `@react-navigation/bottom-tabs`, which is only a transitive dependency here,
 * and importing through expo-router's copy is not a stable contract.
 */
export function useTabBarInset(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + TAB_BAR_CONTENT_HEIGHT;
}
