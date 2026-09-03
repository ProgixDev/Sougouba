'use client';
import { useRouter } from 'next/navigation';
import { LogOut, Menu } from 'lucide-react';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Text } from '../ui/Text';
import { GlobalSearch } from './GlobalSearch';
import { signOut, type AdminSession } from '@/lib/auth';

export function Topbar({ session, title, onOpenMenu }: { session: AdminSession | null; title?: string; onOpenMenu?: () => void }) {
  const router = useRouter();

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 sm:px-5 md:px-8">
      <button
        type="button"
        aria-label="Ouvrir la navigation"
        onClick={onOpenMenu}
        className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
      >
        <Menu size={19} />
      </button>
      {title ? (
        <Text as="h1" variant="title" className="mr-2 shrink-0 truncate">
          {title}
        </Text>
      ) : (
        <GlobalSearch />
      )}
      <div className="ml-auto flex items-center gap-3">
        <ThemeToggle />
        <div className="hidden items-center gap-2 border-l border-border pl-3 sm:flex">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-mustard-400 font-sans text-[0.75rem] font-bold text-mustard-950">
            {session?.name.slice(0, 1) ?? 'A'}
          </div>
          <Text variant="caption" className="max-w-[120px] truncate">
            {session?.name ?? 'Administrateur'}
          </Text>
        </div>
        <button
          type="button"
          aria-label="Se déconnecter"
          onClick={async () => {
            // Awaited so the token is actually revoked before we navigate —
            // firing and forgetting can leave a refreshable session behind if
            // the route change tears the request down mid-flight.
            await signOut();
            router.push('/login');
          }}
          className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut size={17} />
        </button>
      </div>
    </header>
  );
}
