import { Store, CreditCard, Navigation } from 'lucide-react';
import { Reveal, Text } from '@/components/ui';
import { howItWorks } from '@/lib/content';

const ICONS = [Store, CreditCard, Navigation];

export function HowItWorks() {
  return (
    <section id="comment" className="mx-auto max-w-content px-5 py-20 md:px-8 lg:py-28">
      <Reveal>
        <Text variant="label" tone="muted" as="p">{howItWorks.eyebrow}</Text>
        <Text variant="title" as="h2" className="mt-3 max-w-[18ch]">{howItWorks.title}</Text>
      </Reveal>

      <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
        {howItWorks.steps.map((s, i) => {
          const Icon = ICONS[i];
          return (
            <Reveal key={s.n} index={i}>
              <li className="flex flex-col">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-forest-100 text-forest-700 dark:bg-forest-950 dark:text-forest-200">
                  <Icon size={21} strokeWidth={2} aria-hidden />
                </span>
                <span className="mt-5 font-display text-[0.875rem] font-bold tabular tracking-[0.08em] text-mustard-700 dark:text-mustard-300">
                  {s.n}
                </span>
                <h3 className="mt-1 font-display text-[1.375rem] font-semibold leading-snug opsz-20">{s.title}</h3>
                <p className="mt-2 max-w-[34ch] font-sans text-[0.9375rem] leading-relaxed text-muted-foreground">
                  {s.body}
                </p>
              </li>
            </Reveal>
          );
        })}
      </ol>
    </section>
  );
}
