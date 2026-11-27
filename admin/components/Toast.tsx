'use client';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, XCircle, Info } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useLocale } from '@/lib/i18n';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

const ToastContext = createContext<{ push: (tone: ToastTone, message: string) => void } | null>(null);

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  useLocale();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = ++seq;
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className={cn(
              'pointer-events-auto flex items-center gap-2.5 rounded-lg border px-4 py-3 shadow-floating font-sans text-[0.8125rem] font-medium',
              'bg-card text-card-foreground',
              t.tone === 'success' && 'border-forest-200 dark:border-forest-800',
              t.tone === 'error' && 'border-destructive/30',
              t.tone === 'info' && 'border-border'
            )}
          >
            {t.tone === 'success' && <CheckCircle2 size={17} className="text-success-strong shrink-0" />}
            {t.tone === 'error' && <XCircle size={17} className="text-destructive shrink-0" />}
            {t.tone === 'info' && <Info size={17} className="text-muted-foreground shrink-0" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.push;
}
