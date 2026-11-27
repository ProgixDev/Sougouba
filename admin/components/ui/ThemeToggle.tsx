'use client';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { t } from '@/lib/i18n';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);
  return (
    <button
      type="button"
      aria-label={dark ? t('common.theme.toLight') : t('common.theme.toDark')}
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle('dark', next);
        try {
          localStorage.setItem('sougouba-admin-theme', next ? 'dark' : 'light');
        } catch {}
      }}
      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted"
    >
      {dark ? <Sun size={17} strokeWidth={2} /> : <Moon size={17} strokeWidth={2} />}
    </button>
  );
}
