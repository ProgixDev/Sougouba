import { cn } from '@/lib/cn';
import type { ElementType, ReactNode } from 'react';

type Variant = 'display' | 'title' | 'subtitle' | 'body' | 'caption' | 'label';
type Tone = 'default' | 'muted' | 'primary' | 'secondary' | 'accent' | 'destructive';

/** The display face (Bricolage) is spent deliberately: page titles and big numbers only. */
const variants: Record<Variant, string> = {
  display: 'font-display font-extrabold text-[clamp(1.75rem,3vw,2.25rem)] leading-[1.05] tracking-[-0.02em]',
  title: 'font-display font-semibold text-[1.375rem] leading-[1.2] tracking-[-0.01em]',
  subtitle: 'font-display font-medium text-[1.0625rem] leading-snug',
  body: 'font-sans text-[0.875rem] leading-[1.5]',
  caption: 'font-sans text-[0.75rem] leading-[1.4]',
  label: 'font-sans text-[0.6875rem] font-bold uppercase tracking-[0.08em] leading-[1.4]',
};

const tones: Record<Tone, string> = {
  default: 'text-foreground',
  muted: 'text-muted-foreground',
  primary: 'text-primary',
  secondary: 'text-secondary',
  accent: 'text-mustard-700 dark:text-mustard-300',
  destructive: 'text-destructive',
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
  const Tag = as ?? (variant === 'display' ? 'h1' : variant === 'title' ? 'h2' : 'p');
  return (
    <Tag className={cn(variants[variant], tones[tone], className)} {...rest}>
      {children}
    </Tag>
  );
}
