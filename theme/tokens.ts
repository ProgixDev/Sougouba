/**
 * Raw brand color ramps. Source of truth for theme/colors.ts and for any
 * non-className context (charts, native shadow colors, status bar).
 * Mirrored as RGB variables in global.css — keep both in sync if you edit these.
 */

export const forest = {
  50: '#EEF6F1',
  100: '#D6EBDF',
  200: '#AFD7C0',
  300: '#82BE9C',
  400: '#57A379',
  500: '#35875C',
  600: '#246B47',
  700: '#1C5439',
  800: '#17422E',
  900: '#123626',
  950: '#0A2018',
} as const;

export const terracotta = {
  50: '#FDF3EE',
  100: '#FBE3D6',
  200: '#F5C4A8',
  300: '#EE9F72',
  400: '#E67D48',
  500: '#D9642C',
  600: '#BF5122',
  700: '#9C401B',
  800: '#7C3417',
  900: '#642A13',
  950: '#38160A',
} as const;

export const mustard = {
  50: '#FDF8E9',
  100: '#FAEEC4',
  200: '#F4DD8C',
  300: '#EDC957',
  400: '#E4B233',
  500: '#D89A1E',
  600: '#B57C16',
  700: '#8E6013',
  800: '#714E14',
  900: '#5C4114',
  950: '#332309',
} as const;

export const neutral = {
  25: '#FEFDFB',
  50: '#FAF9F7',
  100: '#F0EEEA',
  200: '#E2DED7',
  300: '#C9C3B8',
  400: '#A9A196',
  500: '#8A8175',
  600: '#6E665C',
  700: '#554F47',
  800: '#3D3833',
  900: '#292520',
  950: '#17140F',
} as const;

export const semantic = {
  success: { light: '#2F9E5C', dark: '#4ADE80' },
  destructive: { light: '#DC2626', dark: '#F87171' },
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
} as const;
