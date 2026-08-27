import { WovenBand } from '@/components/ui';
import { footer, site } from '@/lib/content';

export function Footer() {
  return (
    <footer className="bg-forest-950 text-forest-100">
      <WovenBand variant="dark" height={20} animate={false} />
      <div className="mx-auto max-w-content px-5 py-16 md:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {footer.columns.map((c) => (
            <div key={c.title}>
              <h2 className="font-sans text-[0.75rem] font-semibold uppercase tracking-[0.09em] text-forest-300">
                {c.title}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="font-sans text-[0.9375rem] text-forest-100/85 underline-offset-4 transition-colors hover:text-white hover:underline"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-6 border-t border-forest-100/12 pt-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/wordmark-dark.svg" alt={site.name} className="h-6 w-auto" />
            <p className="mt-4 max-w-[40ch] font-sans text-[0.875rem] text-forest-300">{footer.meaning}</p>
          </div>
          <div className="space-y-1 font-sans text-[0.8125rem] text-forest-300 sm:text-right">
            <p>© {new Date().getFullYear()} {site.name}. {footer.rights}</p>
            <p>{footer.builtBy}</p>
            <p>{footer.credits}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
