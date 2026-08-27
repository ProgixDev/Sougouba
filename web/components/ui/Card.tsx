import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

/** 20px radius — the app's real card radius — and one shadow. Never a border too. */
export function Card({
  elevated = true,
  className,
  children,
}: {
  elevated?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-card bg-card text-card-foreground',
        elevated ? 'shadow-card' : 'border border-border',
        className
      )}
    >
      {children}
    </div>
  );
}
