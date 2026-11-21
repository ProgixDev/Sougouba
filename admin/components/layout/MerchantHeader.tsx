'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Text } from '../ui/Text';
import { ThemeToggle } from '../ui/ThemeToggle';
import { merchantSignOut, type MerchantSession } from '@/lib/merchantAuth';

const NAV = [
  { href: '/merchant', label: 'Aperçu' },
  { href: '/merchant/orders', label: 'Commandes' },
];

export function MerchantHeader({ session }: { session: MerchantSession }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-16 max-w-content items-center gap-6 px-4 sm:px-6 md:px-8">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-terracotta-600 font-display text-[1.05rem] font-bold text-white">
            {session.vendorName.slice(0, 1)}
          </div>
          <div className="hidden sm:block">
            <Text variant="subtitle" className="leading-none">
              {session.vendorName}
            </Text>
            <Text variant="caption" tone="muted" className="leading-none">
              Espace commerçant
            </Text>
          </div>
        </div>
        <nav className="flex flex-1 items-center gap-1">
          {NAV.map((item) => {
            const active = item.href === '/merchant' ? pathname === '/merchant' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-full px-3.5 py-2 font-sans text-[0.8125rem] font-semibold transition-colors',
                  active ? 'bg-terracotta-50 text-terracotta-700 dark:bg-terracotta-950 dark:text-terracotta-200' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            type="button"
            aria-label="Se déconnecter"
            onClick={async () => {
              await merchantSignOut();
              router.push('/merchant/login');
            }}
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </header>
  );
}
