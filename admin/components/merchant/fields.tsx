'use client';
import { useId, useRef, useState, type ReactNode } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { t, useLocale } from '@/lib/i18n';
import { mediaUrl } from '@/lib/api/merchantCatalog';

/**
 * The form controls the merchant portal needs beyond the brand `Input`: a
 * select, a multi-line field, a switch and an image picker. Same border, radius
 * and focus ring as `Input`, so a form mixing them reads as one form.
 */

const shell = (focused: boolean, error?: string) =>
  cn(
    'rounded-lg border-[1.5px] bg-card transition-[border-color,box-shadow] duration-150',
    error ? 'border-destructive' : focused ? 'border-primary shadow-[0_0_0_4px_rgb(var(--color-ring)/0.12)]' : 'border-border-strong'
  );

function Caption({ id, error, helper }: { id: string; error?: string; helper?: string }) {
  useLocale();
  if (error) {
    return (
      <p id={`${id}-err`} role="alert" className="mt-1.5 font-sans text-[0.75rem] text-destructive">
        {error}
      </p>
    );
  }
  return helper ? <p className="mt-1.5 font-sans text-[0.75rem] text-muted-foreground">{helper}</p> : null;
}

const labelClass = 'mb-1.5 block font-sans text-[0.8125rem] font-medium text-foreground';

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
  helper,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  error?: string;
  helper?: string;
  required?: boolean;
}) {
  useLocale();
  const id = useId();
  const [focused, setFocused] = useState(false);
  return (
    <div className="w-full">
      {/* The same 52px box as `Input`, its label already floated: a select always shows a value. */}
      <div className={cn('relative h-[52px]', shell(focused, error))}>
        <label htmlFor={id} className="pointer-events-none absolute left-4 top-[5px] origin-left scale-[0.78] font-sans text-muted-foreground">
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </label>
        <select
          id={id}
          value={value}
          required={required}
          aria-invalid={!!error}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange(e.target.value)}
          className="h-full w-full cursor-pointer rounded-lg bg-transparent pl-3 pr-3 pt-4 font-sans text-foreground outline-none"
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <Caption id={id} error={error} helper={helper} />
    </div>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  rows = 4,
  error,
  helper,
  required,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  error?: string;
  helper?: string;
  required?: boolean;
  maxLength?: number;
}) {
  useLocale();
  const id = useId();
  const [focused, setFocused] = useState(false);
  return (
    <div className="w-full">
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      <div className={shell(focused, error)}>
        <textarea
          id={id}
          value={value}
          rows={rows}
          required={required}
          maxLength={maxLength}
          aria-invalid={!!error}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange(e.target.value)}
          className="block w-full resize-y rounded-lg bg-transparent px-3.5 py-3 font-sans text-foreground outline-none"
        />
      </div>
      <Caption id={id} error={error} helper={helper} />
    </div>
  );
}

/** The switch on its own — for a table row, where the column heading is the label. */
export function Switch({
  checked,
  onChange,
  disabled,
  id,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  /** Read out by a screen reader when no visible `<label htmlFor>` names the switch. */
  label?: string;
}) {
  useLocale();
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-none focus-visible:shadow-[0_0_0_4px_rgb(var(--color-ring)/0.25)]',
        checked ? 'bg-primary' : 'bg-border-strong'
      )}
    >
      <span className={cn('absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150', checked && 'translate-x-5')} />
    </button>
  );
}

/** An on/off setting, with what it means said beside it. */
export function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  useLocale();
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="cursor-pointer">
        <span className="block font-sans text-[0.875rem] font-medium text-foreground">{label}</span>
        {hint && <span className="mt-0.5 block font-sans text-[0.75rem] text-muted-foreground">{hint}</span>}
      </label>
      <Switch id={id} checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

/**
 * An image, chosen from the computer and sent to Storage the moment it is
 * picked. `value` is the Storage path the form saves; `upload` is which bucket
 * it goes to (a product photo or the shop's cover).
 */
export function ImageField({
  label,
  value,
  onChange,
  upload,
  helper,
  aspect = 'aspect-square',
}: {
  label: string;
  value: string;
  onChange: (path: string) => void;
  upload: (file: File) => Promise<string>;
  helper?: ReactNode;
  aspect?: string;
}) {
  useLocale();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const src = mediaUrl(value);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(undefined);
    setBusy(true);
    try {
      onChange(await upload(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('portalShop.fields.image.uploadFailed'));
    } finally {
      setBusy(false);
      // So choosing the same file again after an error fires `change` again.
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div>
      <span className={labelClass}>{label}</span>
      <div className="flex flex-wrap items-start gap-4">
        <div className={cn('relative w-36 shrink-0 overflow-hidden rounded-lg border border-border bg-muted', aspect)}>
          {src ? (
            <img src={src} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImagePlus size={26} strokeWidth={1.5} />
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-card/70">
              <Loader2 size={22} className="animate-spin text-primary" />
            </div>
          )}
        </div>
        <div className="flex flex-col items-start gap-2">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label={label}
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="inline-flex h-9 cursor-pointer items-center rounded-full border-[1.5px] border-border-strong px-4 font-sans text-[0.8125rem] font-semibold text-foreground transition-[filter] hover:brightness-95 disabled:pointer-events-none disabled:opacity-50"
          >
            {busy ? t('portalShop.fields.image.uploading') : src ? t('portalShop.fields.image.replace') : t('portalShop.fields.image.choose')}
          </button>
          {src && !busy && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="cursor-pointer font-sans text-[0.75rem] font-medium text-muted-foreground underline-offset-2 hover:underline"
            >
              {t('portalShop.fields.image.remove')}
            </button>
          )}
          <p className="max-w-xs font-sans text-[0.75rem] text-muted-foreground">{helper ?? t('portalShop.fields.image.formats')}</p>
          {error && (
            <p role="alert" className="font-sans text-[0.75rem] text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
