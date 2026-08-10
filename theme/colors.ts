import { forest, mustard, neutral, semantic, terracotta } from './tokens';

/**
 * Semantic light/dark color maps — for use outside className strings
 * (native shadowColor, status bar, chart series, SVG fills). The same
 * values are hand-mirrored as RGB CSS variables in global.css for the
 * `dark:` / tailwind class pipeline; keep both in sync when editing.
 */
export interface ThemeColors {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  accent: string;
  accentForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  /** Stronger boundary for interactive fields, where the divider weight is too faint to read as an edge. */
  borderStrong: string;
  destructive: string;
  destructiveForeground: string;
  success: string;
  ring: string;
}

export const lightColors: ThemeColors = {
  background: neutral[50],
  foreground: neutral[900],
  card: '#FFFFFF',
  cardForeground: neutral[900],
  primary: forest[600],
  primaryForeground: '#FFFFFF',
  // terracotta[500] gave white labels only 3.61:1; 600 clears AA at 4.76:1.
  secondary: terracotta[600],
  secondaryForeground: '#FFFFFF',
  accent: mustard[500],
  accentForeground: neutral[900],
  muted: neutral[100],
  // neutral[500] failed AA on every surface (3.31–3.83:1); 600 clears it at 4.87–5.65:1.
  mutedForeground: neutral[600],
  border: neutral[200],
  borderStrong: neutral[400],
  destructive: semantic.destructive.light,
  destructiveForeground: '#FFFFFF',
  success: semantic.success.light,
  ring: forest[600],
};

export const darkColors: ThemeColors = {
  background: '#0B1712',
  foreground: '#F3EFE6',
  card: '#132420',
  cardForeground: '#F3EFE6',
  primary: forest[300],
  primaryForeground: neutral[950],
  secondary: terracotta[400],
  secondaryForeground: neutral[950],
  accent: mustard[400],
  accentForeground: neutral[950],
  muted: '#1B302A',
  mutedForeground: neutral[400],
  border: '#24382F',
  borderStrong: '#456B59',
  destructive: semantic.destructive.dark,
  destructiveForeground: neutral[950],
  success: semantic.success.dark,
  ring: forest[300],
};

export function getThemeColors(scheme: 'light' | 'dark'): ThemeColors {
  return scheme === 'dark' ? darkColors : lightColors;
}

/** Category-circle badge colors, keyed by Category.colorToken — soft pastel behind a deeper-tinted icon, same in both themes. */
export const categoryPalette = {
  forest: { background: forest[100], icon: forest[600] },
  terracotta: { background: terracotta[100], icon: terracotta[600] },
  mustard: { background: mustard[100], icon: mustard[700] },
} as const;

export type CategoryColorToken = keyof typeof categoryPalette;
