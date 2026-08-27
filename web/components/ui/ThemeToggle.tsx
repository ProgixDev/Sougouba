'use client';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

/** Light default with a manual toggle, persisted — the app's own arrangement. */
export function ThemeToggle({ onDark = false }: { onDark?: boolean }) {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);
  return (
    <button
      type="button"
      aria-label={dark ? 'Passer au thème clair' : 'Passer au thème sombre'}
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle('dark', next);
        try { localStorage.setItem('sougouba-theme', next ? 'dark' : 'light'); } catch {}
      }}
      className={
        'inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border transition-colors ' +
        (onDark
          ? 'border-white/25 text-[#F3EFE6] hover:bg-white/10'
          : 'border-border text-foreground hover:bg-muted')
      }
    >
      {dark ? <Sun size={19} strokeWidth={2} /> : <Moon size={19} strokeWidth={2} />}
    </button>
  );
}
