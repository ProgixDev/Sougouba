/**
 * Type pairing: Bricolage Grotesque (display) + Hanken Grotesk (body/UI).
 * Bricolage — a French-designed grotesque with warm, slightly handcrafted
 * letterforms ("bricolage" = tinkering/craft) — carries the app's personality
 * on headings, prices, and hero moments. Hanken stays quiet and highly
 * legible for dense UI: labels, inputs, nutrition stats, French body copy.
 * Loaded via @expo-google-fonts/* in app/_layout.tsx.
 */
export const displayFamily = {
  regular: 'BricolageGrotesque_400Regular',
  medium: 'BricolageGrotesque_500Medium',
  semibold: 'BricolageGrotesque_600SemiBold',
  bold: 'BricolageGrotesque_700Bold',
  extrabold: 'BricolageGrotesque_800ExtraBold',
} as const;

export const bodyFamily = {
  regular: 'HankenGrotesk_400Regular',
  medium: 'HankenGrotesk_500Medium',
  semibold: 'HankenGrotesk_600SemiBold',
  bold: 'HankenGrotesk_700Bold',
  extrabold: 'HankenGrotesk_800ExtraBold',
} as const;

/** Type scale, in px. Matches the design system's 12/14/16/18/24/32 rhythm. */
export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 32,
  '5xl': 40,
} as const;

export const lineHeight = {
  tight: 1.2,
  snug: 1.35,
  normal: 1.5,
  relaxed: 1.65,
} as const;
