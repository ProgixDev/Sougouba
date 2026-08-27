import { Bike, Car, Check } from 'lucide-react';
import { Button, Reveal } from '@/components/ui';
import { courier } from '@/lib/content';

/**
 * Graphite with a mustard corner glow — the courier's surface everywhere in the
 * product. Muted text is neutral-300, not neutral-400: against the glow, 400 falls
 * under AA, which the app found and fixed arithmetically rather than by eye.
 *
 * The CTA is mustard with dark ink. Terracotta on graphite reads as a warning, and
 * mustard is light enough that white type on it fails contrast.
 */
export function Courier() {
  return (
    <section id="livreurs" className="px-5 py-10 md:px-8 lg:py-16">
      <div className="relative mx-auto max-w-content overflow-hidden rounded-[30px] bg-gradient-to-br from-neutral-900 to-neutral-950">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(circle at 100% 0%, rgba(228,178,51,0.18), transparent 55%)' }}
        />
        <div className="relative grid gap-12 p-8 py-14 md:p-14 lg:grid-cols-[1fr_0.9fr] lg:gap-16 lg:p-16">
          <div>
            <p className="font-sans text-[0.75rem] font-semibold uppercase tracking-[0.09em] text-mustard-300">
              {courier.eyebrow}
            </p>
            <h2 className="mt-3 max-w-[15ch] font-display text-[clamp(1.9rem,4vw,3.25rem)] font-extrabold leading-[1.05] tracking-[-0.015em] display-title text-[#F6F2E9]">
              {courier.title}
            </h2>
            <p className="mt-5 max-w-[44ch] font-sans text-[1.0625rem] leading-[1.65] text-neutral-300">
              {courier.body}
            </p>

            <ul className="mt-9 space-y-4">
              {courier.pay.map((p) => (
                <li key={p.value} className="flex items-baseline gap-4">
                  <span className="tabular w-[5.5ch] shrink-0 text-right font-display text-[1.5rem] font-extrabold leading-none opsz-32 text-mustard-300">
                    {p.value}
                  </span>
                  <span className="font-sans text-[0.9375rem] text-neutral-300">{p.label}</span>
                </li>
              ))}
            </ul>

            <p className="mt-7 flex items-center gap-3 font-sans text-[0.875rem] text-neutral-300">
              <Bike size={16} strokeWidth={2} className="text-mustard-300" aria-hidden />
              <Car size={16} strokeWidth={2} className="text-mustard-300" aria-hidden />
              {courier.payNote}
            </p>
          </div>

          <Reveal index={1}>
            <div className="rounded-card bg-[#F6F2E9]/[0.06] p-7 md:p-8">
              <ol className="space-y-6">
                {courier.steps.map((s, i) => (
                  <li key={s.title} className="flex gap-4">
                    <span className="tabular mt-0.5 font-display text-[0.875rem] font-bold text-neutral-400">
                      0{i + 1}
                    </span>
                    <div>
                      <h3 className="font-display text-[1.0625rem] font-semibold text-[#F6F2E9]">{s.title}</h3>
                      <p className="mt-1 max-w-[38ch] font-sans text-[0.9375rem] leading-relaxed text-neutral-300">
                        {s.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-7 flex items-start gap-2.5 border-t border-[#F6F2E9]/15 pt-6 font-sans text-[0.875rem] text-neutral-300">
                <Check size={15} strokeWidth={2.4} className="mt-0.5 shrink-0 text-mustard-300" aria-hidden />
                {courier.delay}
              </p>
              <Button href="#prevenir" variant="mustard" size="lg" className="mt-7 w-full">
                {courier.cta}
              </Button>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
