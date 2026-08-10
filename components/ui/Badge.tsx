import { View } from 'react-native';

import { Text } from './Text';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'secondary' | 'destructive';
type Variant = 'soft' | 'solid';
type Size = 'sm' | 'md';

export interface BadgeProps {
  label: string;
  tone?: Tone;
  /** `soft` for inline status, `solid` when the badge itself is the emphasis (e.g. over an image). */
  variant?: Variant;
  size?: Size;
}

/**
 * Redesigned after the first pass read as washed out and shapeless. Three things
 * changed, all deliberate:
 *
 *  - Colour: soft tints were 10–20% opacity with a mid-tone text colour, so they
 *    were barely visible and failed contrast. Now each tone pairs a light tint
 *    with a *deep* step from the same ramp, and there is a `solid` variant for
 *    when the badge needs to hold its own over photography.
 *  - Shape: a full-round pill on a 20px-tall chip read as a stray lozenge.
 *    Squared off to an 8px radius, which sits with the cards rather than fighting
 *    the capsule buttons.
 *  - Type: 11px bold uppercase with letter-spacing instead of 14px medium
 *    sentence case — a badge should read as a label, not as body copy.
 */
const softClasses: Record<Tone, string> = {
  neutral: 'bg-neutral-100 dark:bg-neutral-800',
  primary: 'bg-forest-50 dark:bg-forest-950',
  success: 'bg-forest-100 dark:bg-forest-900',
  warning: 'bg-mustard-50 dark:bg-mustard-950',
  secondary: 'bg-terracotta-50 dark:bg-terracotta-950',
  destructive: 'bg-destructive/10 dark:bg-destructive/20',
};

const softTextClasses: Record<Tone, string> = {
  neutral: 'text-neutral-700 dark:text-neutral-300',
  primary: 'text-forest-700 dark:text-forest-200',
  success: 'text-forest-800 dark:text-forest-100',
  warning: 'text-mustard-800 dark:text-mustard-200',
  secondary: 'text-terracotta-700 dark:text-terracotta-200',
  destructive: 'text-destructive',
};

const solidClasses: Record<Tone, string> = {
  neutral: 'bg-neutral-700',
  primary: 'bg-forest-600',
  success: 'bg-forest-500',
  warning: 'bg-mustard-500',
  secondary: 'bg-terracotta-600',
  destructive: 'bg-destructive',
};

// Mustard is light enough that white type on it fails contrast — it keeps dark ink.
const solidTextClasses: Record<Tone, string> = {
  neutral: 'text-white',
  primary: 'text-white',
  success: 'text-white',
  warning: 'text-mustard-950',
  secondary: 'text-white',
  destructive: 'text-white',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-1.5 py-0.5',
  md: 'px-2 py-1',
};

const textSizeClasses: Record<Size, string> = {
  sm: 'text-[10px] leading-[13px]',
  md: 'text-[11px] leading-[14px]',
};

export function Badge({ label, tone = 'neutral', variant = 'soft', size = 'md' }: BadgeProps) {
  const solid = variant === 'solid';
  return (
    <View
      className={`self-start rounded-sm ${sizeClasses[size]} ${
        solid ? solidClasses[tone] : softClasses[tone]
      }`}
    >
      <Text
        weight="bold"
        className={`uppercase tracking-[0.6px] ${textSizeClasses[size]} ${
          solid ? solidTextClasses[tone] : softTextClasses[tone]
        }`}
      >
        {label}
      </Text>
    </View>
  );
}
