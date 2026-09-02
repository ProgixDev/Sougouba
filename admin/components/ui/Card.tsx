import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

/** 20px radius, one shadow. Never a border and a shadow together. */
export function Card({
  elevated = true,
  className,
  children,
  as: Tag = 'div',
}: {
  elevated?: boolean;
  className?: string;
  children: ReactNode;
  as?: 'div' | 'section' | 'article';
}) {
  return (
    <Tag
      className={cn(
        'rounded-card bg-card text-card-foreground',
        elevated ? 'shadow-card' : 'border border-border',
        className
      )}
    >
      {children}
    </Tag>
  );
}
