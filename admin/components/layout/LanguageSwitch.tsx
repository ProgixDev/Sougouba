'use client';
import { cn } from '@/lib/cn';
import { locale, setLocale, t, type Locale, lazy, useLocale } from '@/lib/i18n';

const LANGUAGES: { value: Locale; short: string; name: string }[] = lazy(() => ([
  { value: 'fr', short: 'FR', name: t('common.language.french') },
  { value: 'en', short: 'EN', name: t('common.language.english') },
]));

/**
 * French or English — the same two-way pill as the period selectors. Choosing
 * the other one changes every text on the page where it stands, with no reload
 * and no request, and remembers the choice (`setLocale`).
 *
 * `onDark` is for the sign-in pages' dark panel; the default sits on a page.
 */
export function LanguageSwitch({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  useLocale();
  return (
    <div
      role="group"
      aria-label={t('common.language.label')}
      className={cn('flex shrink-0 gap-1 rounded-full border p-1', onDark ? 'border-white/15 bg-white/[0.04]' : 'border-border bg-card', className)}
    >
      {LANGUAGES.map((language) => {
        const active = language.value === locale;
        return (
          <button
            key={language.value}
            type="button"
            // Each name in its own language, so it is readable to whoever needs it.
            lang={language.value}
            title={language.name}
            aria-label={language.name}
            aria-pressed={active}
            onClick={() => setLocale(language.value)}
            className={cn(
              'cursor-pointer rounded-full px-2.5 py-1 font-sans text-[0.75rem] font-bold tracking-wide transition-colors',
              active
                ? 'bg-forest-600 text-white'
                : onDark
                  ? 'text-white/60 hover:text-white'
                  : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {language.short}
          </button>
        );
      })}
    </div>
  );
}
