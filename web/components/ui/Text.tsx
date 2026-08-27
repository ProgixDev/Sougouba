import { cn } from '@/lib/cn';
import type { ElementType, ReactNode } from 'react';

type Variant = 'hero' | 'display' | 'title' | 'subtitle' | 'body' | 'caption' | 'label';
type Tone = 'default' | 'muted' | 'primary' | 'secondary' | 'accent' | 'inverted';

/**
 * Which face each variant reaches for, and at what optical size.
 *
 * The display face is spent deliberately, not sprayed: hero, section titles,
 * prices and numerals. Everything else is Hanken. `opsz` tracks the rendered
 * size on every display variant — that is the point of loading a variable font.
 */
const variants: Record<Variant, string> = {
  hero: 'font-display font-extrabold display-hero text-[clamp(2.75rem,7.5vw,6.5rem)] leading-[0.95] tracking-[-0.03em]',
  display: 'font-display font-extrabold opsz-48 text-[clamp(2rem,4.5vw,3.5rem)] leading-[1.02] tracking-[-0.02em]',
  title: 'font-display font-semibold display-title text-[clamp(1.9rem,4vw,3.25rem)] leading-[1.05] tracking-[-0.015em]',
  subtitle: 'font-display font-medium opsz-20 text-[1.25rem] leading-snug',
  body: 'font-sans text-[1.0625rem] leading-[1.6]',
  caption: 'font-sans text-[0.875rem] leading-[1.5]',
  label: 'font-sans text-[0.75rem] font-semibold uppercase tracking-[0.08em] leading-[1.4]',
};

const tones: Record<Tone, string> = {
  default: 'text-foreground',
  muted: 'text-muted-foreground',
  primary: 'text-primary',
  secondary: 'text-secondary',
  accent: 'text-mustard-700',
  inverted: 'text-primary-foreground',
};

export function Text({
  as,
  variant = 'body',
  tone = 'default',
  className,
  children,
  ...rest
}: {
  as?: ElementType;
  variant?: Variant;
  tone?: Tone;
  className?: string;
  children: ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  const Tag = as ?? (variant === 'hero' || variant === 'display' ? 'h1' : variant === 'title' ? 'h2' : 'p');
  return (
    <Tag className={cn(variants[variant], tones[tone], className)} {...rest}>
      {children}
    </Tag>
  );
}
