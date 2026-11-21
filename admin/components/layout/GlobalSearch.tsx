'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Store, Bike, Package, User as UserIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Text } from '../ui/Text';
import { searchAll, TYPE_LABELS, type SearchResult } from '@/lib/api/search';

const ICONS: Record<SearchResult['type'], typeof Search> = {
  vendor: Store,
  courier: Bike,
  order: Package,
  user: UserIcon,
};

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K from anywhere in the dashboard.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /**
   * Debounced by 250 ms.
   *
   * This used to run the mock on every keystroke, which cost nothing because
   * the data was already in memory. It is a network request now, and the API
   * allows 120 requests a minute per account — a fast typist would exhaust that
   * budget in a couple of sentences and start getting 429s on every screen, not
   * just this one. Debouncing here is the fix; raising the budget would only
   * move the cliff.
   */
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      searchAll(query)
        .then((r) => {
          if (!active) return;
          setResults(r);
          setActiveIndex(0);
        })
        // A failed search should quietly show nothing rather than throw an
        // unhandled rejection out of a dropdown the user may already have
        // closed.
        .catch(() => active && setResults([]));
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function go(result: SearchResult) {
    router.push(result.href);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={containerRef} className="relative hidden w-72 sm:block lg:w-80">
      <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-muted-foreground transition-shadow focus-within:border-primary focus-within:ring-4 focus-within:ring-forest-500/10">
        <Search size={16} className="shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              (e.target as HTMLInputElement).blur();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter' && results[activeIndex]) {
              go(results[activeIndex]);
            }
          }}
          placeholder="Rechercher un commerce, une commande…"
          aria-label="Recherche globale"
          className="w-full bg-transparent font-sans text-[0.8125rem] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <kbd className="hidden shrink-0 rounded-md border border-border bg-muted px-1.5 py-0.5 font-sans text-[0.6875rem] font-semibold text-muted-foreground lg:inline">
          ⌘K
        </kbd>
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-96 overflow-y-auto rounded-card border border-border bg-card shadow-floating">
          {results.length === 0 ? (
            <Text variant="body" tone="muted" className="p-4">
              Aucun résultat pour « {query} ».
            </Text>
          ) : (
            <ul className="py-1.5">
              {results.map((r, i) => {
                const Icon = ICONS[r.type];
                return (
                  <li key={`${r.type}-${r.id}`}>
                    <button
                      type="button"
                      onClick={() => go(r)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left',
                        i === activeIndex ? 'bg-muted' : ''
                      )}
                    >
                      <Icon size={16} className="shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <Text variant="body" className="truncate font-medium">
                          {r.label}
                        </Text>
                        <Text variant="caption" tone="muted" className="truncate">
                          {r.sublabel}
                        </Text>
                      </div>
                      <Text variant="caption" tone="muted" className="shrink-0">
                        {TYPE_LABELS[r.type]}
                      </Text>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
