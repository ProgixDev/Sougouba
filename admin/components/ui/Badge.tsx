import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'secondary' | 'destructive';

/** Squared 8px badge, soft tint + deep same-ramp ink. Never a pill. */
const soft: Record<Tone, string> = {
  neutral: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  primary: 'bg-forest-50 text-forest-700 dark:bg-forest-950 dark:text-forest-200',
  success: 'bg-forest-100 text-forest-800 dark:bg-forest-900 dark:text-forest-100',
  warning: 'bg-mustard-50 text-mustard-800 dark:bg-mustard-950 dark:text-mustard-200',
  secondary: 'bg-terracotta-50 text-terracotta-700 dark:bg-terracotta-950 dark:text-terracotta-200',
  destructive: 'bg-destructive/10 text-destructive dark:bg-destructive/20',
};

const solid: Record<Tone, string> = {
  neutral: 'bg-neutral-700 text-white',
  primary: 'bg-forest-600 text-white',
  success: 'bg-forest-500 text-white',
  warning: 'bg-mustard-500 text-mustard-950',
  secondary: 'bg-terracotta-600 text-white',
  destructive: 'bg-destructive text-destructive-foreground',
};

export function Badge({
  tone = 'neutral',
  variant = 'soft',
  size = 'md',
  className,
  children,
}: {
  tone?: Tone;
  variant?: 'soft' | 'solid';
  size?: 'sm' | 'md';
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center self-start gap-1 rounded-sm font-sans font-bold uppercase tracking-[0.6px]',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px] leading-[13px]' : 'px-2 py-1 text-[11px] leading-[14px]',
        variant === 'soft' ? soft[tone] : solid[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
