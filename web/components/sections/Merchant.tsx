import { Check } from 'lucide-react';
import { Button, Reveal, WovenBand } from '@/components/ui';
import { merchant } from '@/lib/content';

/**
 * The highest-value conversion on the page.
 *
 * Pre-launch, a marketplace with no supply is not a product: a shopper joining a
 * waitlist is worth little, a grocer signing up is worth a great deal, because ten
 * more shops is what makes the app worth downloading at all. So this gets the
 * weight the download CTA would have had, and the terms are stated plainly —
 * hiding 12 % + 70 $ costs more trust than showing it.
 */
export function Merchant() {
  return (
    <section id="partenaire" className="px-5 py-10 md:px-8 lg:py-16">
      <div className="mx-auto max-w-content overflow-hidden rounded-[30px] bg-gradient-to-br from-forest-800 to-forest-950">
        <WovenBand variant="dark" height={20} />
        <div className="grid gap-12 p-8 py-14 md:p-14 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:p-16">
          <div>
            <p className="font-sans text-[0.75rem] font-semibold uppercase tracking-[0.09em] text-forest-200">
              {merchant.eyebrow}
            </p>
            <h2 className="mt-3 max-w-[14ch] font-display text-[clamp(1.9rem,4vw,3.25rem)] font-extrabold leading-[1.05] tracking-[-0.015em] display-title text-[#F3EFE6]">
              {merchant.title}
            </h2>
            <p className="mt-5 max-w-[46ch] font-sans text-[1.0625rem] leading-[1.65] text-forest-200">
              {merchant.body}
            </p>

            <ol className="mt-10 space-y-6">
              {merchant.steps.map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span className="tabular mt-0.5 font-display text-[0.875rem] font-bold text-forest-200/70">
                    0{i + 1}
                  </span>
                  <div>
                    <h3 className="font-display text-[1.0625rem] font-semibold text-[#F3EFE6]">{s.title}</h3>
                    <p className="mt-1 max-w-[42ch] font-sans text-[0.9375rem] leading-relaxed text-forest-200">
                      {s.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <Reveal index={1}>
            <div className="rounded-card bg-[#F3EFE6]/[0.07] p-7 md:p-8">
              <div className="flex flex-wrap gap-x-10 gap-y-6">
                {merchant.terms.map((t) => (
                  <div key={t.value}>
                    <p className="tabular font-display text-[clamp(2.25rem,5vw,3.25rem)] font-extrabold leading-none opsz-48 text-mustard-300">
                      {t.value}
                    </p>
                    <p className="mt-2 max-w-[20ch] font-sans text-[0.875rem] text-forest-200">{t.label}</p>
                  </div>
                ))}
              </div>
              <p className="mt-5 border-t border-[#F3EFE6]/15 pt-5 font-sans text-[0.875rem] font-semibold text-[#F3EFE6]">
                {merchant.termsNote}
              </p>

              <ul className="mt-7 space-y-3">
                {merchant.included.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 font-sans text-[0.9375rem] text-forest-200">
                    <Check size={15} strokeWidth={2.4} className="mt-1 shrink-0 text-mustard-300" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>

              <Button href="#prevenir" variant="mustard" size="lg" className="mt-8 w-full">
                {merchant.cta}
              </Button>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
