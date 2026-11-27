import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { t } from '@/lib/i18n';

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label={t('nav.sidebar.breadcrumb')} className="mb-4 flex items-center gap-1.5 font-sans text-[0.8125rem] text-muted-foreground">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight size={13} />}
          {item.href ? (
            <Link href={item.href} className="hover:text-foreground hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-foreground">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
