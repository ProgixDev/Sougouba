import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

type Variant = 'primary' | 'cta' | 'outline' | 'ghost' | 'destructive' | 'mustard';
type Size = 'sm' | 'md' | 'lg';

/**
 * Capsule, flat confident fill, single tinted shadow — the brand's button rule.
 * No gradients, no gloss: that combination was tried on this brand and
 * rejected. One depth cue, never three.
 */
const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-[0.8125rem]',
  md: 'h-11 px-5 text-[0.875rem]',
  lg: 'h-12 px-6 text-[0.9375rem]',
};

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground shadow-cta-primary',
  cta: 'bg-secondary text-secondary-foreground shadow-cta',
  outline: 'bg-transparent text-foreground border-[1.5px] border-border-strong',
  ghost: 'bg-transparent text-foreground',
  destructive: 'bg-destructive text-destructive-foreground shadow-[0_3px_9px_rgba(220,38,38,.16)]',
  mustard: 'bg-mustard-400 text-mustard-950',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  type = 'button',
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-sans font-semibold whitespace-nowrap',
        'cursor-pointer select-none transition-[filter,transform] duration-100 ease-out',
        'hover:brightness-[0.96] active:scale-[0.97] active:brightness-[0.92]',
        'disabled:pointer-events-none disabled:opacity-50',
        sizes[size],
        variants[variant],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
