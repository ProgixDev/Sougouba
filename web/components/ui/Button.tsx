import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

type Variant = 'cta' | 'primary' | 'outline' | 'ghost' | 'mustard';
type Size = 'sm' | 'md' | 'lg';

/**
 * Capsule, flat confident fill, and a shadow tinted to the button's own colour.
 *
 * The app's first CTA — diagonal gradient + glossy white top-highlight + a
 * 0.35-opacity coloured shadow — was rejected outright. The fix was to go
 * flatter, not richer: solid fill, no gloss, shadow at 0.16. That is the rule
 * this component encodes. One depth cue, never three.
 */
const sizes: Record<Size, string> = {
  sm: 'h-10 px-5 text-[0.9375rem]',
  md: 'h-12 px-6 text-[1rem]',
  lg: 'h-14 px-8 text-[1.0625rem]',
};

const variants: Record<Variant, string> = {
  cta: 'bg-secondary text-secondary-foreground shadow-cta',
  primary: 'bg-primary text-primary-foreground shadow-cta-primary',
  outline: 'bg-transparent text-foreground border-[1.5px] border-border-strong',
  ghost: 'bg-transparent text-foreground',
  // Mustard never carries white type — it is light enough to fail contrast.
  mustard: 'bg-mustard-400 text-mustard-950',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  href,
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
  href?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const Comp = href ? 'a' : 'button';
  return (
    <Comp
      {...(href ? { href } : {})}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-sans font-semibold',
        // Press feedback in CSS, not in a motion component: it keeps the
        // animation library off every page that only has buttons on it. Scale
        // and brightness only — layout bounds never shift.
        'cursor-pointer select-none transition-[filter,transform] duration-100 ease-out',
        'hover:brightness-[0.96] active:scale-[0.97] active:brightness-[0.92]',
        'disabled:pointer-events-none disabled:opacity-50',
        sizes[size],
        variants[variant],
        className
      )}
      {...(rest as object)}
    >
      {children}
    </Comp>
  );
}
