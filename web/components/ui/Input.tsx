'use client';
import { useId, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Floating label, 58px tall, with a focus ring that interpolates border -> primary.
 *
 * Ported from the app's Input, including the rule that it takes no placeholder:
 * a placeholder collides visually with the floating label. The label is the
 * label. Validation is on blur, never on keystroke.
 */
export function Input({
  label,
  type = 'text',
  error,
  helper,
  required,
  className,
  onBlur,
  ...rest
}: {
  label: string;
  error?: string;
  helper?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'placeholder'>) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [filled, setFilled] = useState(false);
  const floated = focused || filled;

  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'relative h-[58px] rounded-lg bg-card transition-[border-color,box-shadow] duration-150',
          'border-[1.5px]',
          error
            ? 'border-destructive'
            : focused
              ? 'border-primary shadow-[0_0_0_4px_rgb(var(--color-ring)/0.12)]'
              : 'border-border-strong'
        )}
      >
        <label
          htmlFor={id}
          className={cn(
            'pointer-events-none absolute left-4 origin-left font-sans text-muted-foreground',
            'transition-all duration-150 ease-out',
            floated ? 'top-[6px] scale-[0.78]' : 'top-[17px] scale-100'
          )}
        >
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </label>
        <input
          id={id}
          type={type}
          required={required}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : helper ? `${id}-help` : undefined}
          className="h-full w-full rounded-lg bg-transparent px-4 pt-5 font-sans text-foreground outline-none"
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            setFocused(false);
            setFilled(e.target.value.length > 0);
            onBlur?.(e);
          }}
          {...rest}
        />
      </div>
      {/* Error sits below its own field, never in a summary at the top. */}
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1.5 font-sans text-[0.8125rem] text-destructive">
          {error}
        </p>
      ) : helper ? (
        <p id={`${id}-help`} className="mt-1.5 font-sans text-[0.8125rem] text-muted-foreground">
          {helper}
        </p>
      ) : null}
    </div>
  );
}
