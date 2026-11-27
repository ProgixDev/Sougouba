'use client';
import { useId, useState } from 'react';
import { cn } from '@/lib/cn';
import { useLocale } from '@/lib/i18n';

/** Floating label, ported from the brand's Input. Validation on blur, never on keystroke. */
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
  useLocale();
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [filled, setFilled] = useState(!!rest.value || !!rest.defaultValue);
  const floated = focused || filled;

  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'relative h-[52px] rounded-lg bg-card transition-[border-color,box-shadow] duration-150',
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
            floated ? 'top-[5px] scale-[0.78]' : 'top-[15px] scale-100'
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
          className="h-full w-full rounded-lg bg-transparent px-4 pt-4 font-sans text-foreground outline-none"
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            setFocused(false);
            setFilled(e.target.value.length > 0);
            onBlur?.(e);
          }}
          {...rest}
        />
      </div>
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1.5 font-sans text-[0.75rem] text-destructive">
          {error}
        </p>
      ) : helper ? (
        <p id={`${id}-help`} className="mt-1.5 font-sans text-[0.75rem] text-muted-foreground">
          {helper}
        </p>
      ) : null}
    </div>
  );
}
