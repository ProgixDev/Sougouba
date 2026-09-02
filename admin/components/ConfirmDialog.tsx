'use client';
import { useEffect, useId, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/Button';
import { Text } from './ui/Text';
import { cn } from '@/lib/cn';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'primary' | 'destructive';
  requireReason?: boolean;
  reasonLabel?: string;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
  busy?: boolean;
}

/** Confirms before a destructive or status-changing action, with an optional required reason field. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  requireReason = false,
  reasonLabel = 'Motif',
  onConfirm,
  onCancel,
  busy = false,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');
  const id = useId();

  useEffect(() => {
    if (!open) setReason('');
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  const disabled = busy || (requireReason && reason.trim().length === 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={id}>
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-card bg-card p-6 shadow-floating">
        <button
          type="button"
          aria-label="Fermer"
          onClick={onCancel}
          className="absolute right-4 top-4 cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <X size={18} />
        </button>
        <Text as="h2" id={id} variant="title" className="pr-6">
          {title}
        </Text>
        <Text variant="body" tone="muted" className="mt-2">
          {description}
        </Text>
        {requireReason && (
          <div className="mt-4">
            <label htmlFor={`${id}-reason`} className="mb-1.5 block font-sans text-[0.75rem] font-semibold text-foreground">
              {reasonLabel} <span className="text-destructive">*</span>
            </label>
            <textarea
              id={`${id}-reason`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className={cn(
                'w-full resize-none rounded-lg border-[1.5px] border-border-strong bg-card p-3 font-sans text-[0.875rem]',
                'outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgb(var(--color-ring)/0.12)]'
              )}
            />
          </div>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Annuler
          </Button>
          <Button
            variant={tone === 'destructive' ? 'destructive' : 'primary'}
            onClick={() => onConfirm(requireReason ? reason.trim() : undefined)}
            disabled={disabled}
          >
            {busy ? 'Un instant…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
