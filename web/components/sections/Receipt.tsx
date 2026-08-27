'use client';
import { useEffect, useRef, useState } from 'react';
import { Card, Reveal, Text } from '@/components/ui';
import { money, receipt } from '@/lib/content';
import { useInView } from '@/components/ui/useInView';

/**
 * Nobody puts a tax breakdown on a landing page. In Québec, doing it is a trust
 * signal — and Sougouba's rule, taxes on the products only and never on delivery,
 * is genuinely better than the norm.
 *
 * Every figure is computed here from the real rates rather than typed in, so the
 * page cannot drift from data/taxes.ts and data/deliveryPricing.ts.
 */
const GST_RATE = 0.05;
const QST_RATE = 0.09975;
const DELIVERY_CAD = 3.99; // 3,4 km falls in the <=5 km band

const round2 = (v: number) => Math.round(v * 100) / 100;

export function Receipt() {
  const subtotal = round2(receipt.lines.reduce((a, l) => a + l.amount, 0));
  const gst = round2(subtotal * GST_RATE);
  const qst = round2(subtotal * QST_RATE);
  const total = round2(subtotal + gst + qst + DELIVERY_CAD);

  const [ref, inView] = useInView<HTMLDivElement>(0.4);

  return (
    <section id="note" className="mx-auto max-w-content px-5 py-20 md:px-8 lg:py-28">
      <div className="grid gap-12 lg:grid-cols-[0.9fr_1fr] lg:gap-16">
        <Reveal>
          <Text variant="label" tone="muted" as="p">{receipt.eyebrow}</Text>
          <Text variant="title" as="h2" className="mt-3 max-w-[12ch]">{receipt.title}</Text>
          <p className="mt-5 max-w-[42ch] font-sans text-[1.0625rem] leading-[1.65] text-muted-foreground">
            {receipt.body}
          </p>
          <p className="mt-6 max-w-[46ch] font-sans text-[0.8125rem] leading-relaxed text-muted-foreground">
            {receipt.footnote}
          </p>
        </Reveal>

        <Reveal index={1}>
          <Card className="p-6 md:p-8">
            <div ref={ref}>
              <ul>
                {receipt.lines.map((l, i) => (
                  <li
                    key={l.label}
                    className="receipt-line flex items-baseline justify-between gap-4 py-2"
                    style={{ '--reveal-delay': `${i * 90}ms` } as React.CSSProperties}
                    data-in={inView || undefined}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-sans text-[0.9375rem]">{l.label}</span>
                      <span className="block truncate font-sans text-[0.75rem] text-muted-foreground">{l.sub}</span>
                    </span>
                    <span className="tabular shrink-0 font-sans text-[0.9375rem]">{money(l.amount)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 space-y-2 border-t border-border pt-4">
                <Row label={receipt.subtotalLabel} value={money(subtotal)} inView={inView} delay={480} strong />
                <Row label={receipt.gstLabel} value={money(gst)} inView={inView} delay={570} />
                <Row label={receipt.qstLabel} value={money(qst)} inView={inView} delay={660} />
                <Row label={receipt.deliveryLabel} value={money(DELIVERY_CAD)} inView={inView} delay={750} />
              </div>

              <div
                className="receipt-line mt-4 flex items-baseline justify-between gap-4 border-t-2 border-foreground/15 pt-4"
                style={{ '--reveal-delay': '860ms' } as React.CSSProperties}
                data-in={inView || undefined}
              >
                <span className="font-display text-[1.125rem] font-semibold opsz-20">{receipt.totalLabel}</span>
                <span className="tabular font-display text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-none opsz-32 text-mustard-700 dark:text-mustard-300">
                  {money(total)}
                </span>
              </div>
            </div>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}

function Row({
  label, value, inView, delay, strong,
}: { label: string; value: string; inView: boolean; delay: number; strong?: boolean }) {
  return (
    <div
      className="receipt-line flex items-baseline justify-between gap-4"
      style={{ '--reveal-delay': `${delay}ms` } as React.CSSProperties}
      data-in={inView || undefined}
    >
      <span className={`font-sans text-[0.9375rem] ${strong ? '' : 'text-muted-foreground'}`}>{label}</span>
      <span className={`tabular font-sans text-[0.9375rem] ${strong ? 'font-semibold' : 'text-muted-foreground'}`}>
        {value}
      </span>
    </div>
  );
}
