import { Nav } from '@/components/site/Nav';
import { Footer } from '@/components/site/Footer';
import { Text, WovenBand } from '@/components/ui';
import {
  LAST_UPDATED,
  REVIEWED,
  draftNotice,
  splitPlaceholders,
  typo,
  type LegalBlock,
  type LegalDoc,
} from '@/lib/legal';

/**
 * Both legal pages, one shell.
 *
 * A legal page's whole job is to be read, so it gets exactly two things the
 * marketing page does not need: a measure narrow enough to hold the eye
 * (`max-w-[68ch]`) and a sticky table of contents, because nobody reads a
 * privacy policy top to bottom — they arrive looking for one section.
 *
 * No motion, no reveal-on-scroll. Text that animates in is text you cannot
 * Ctrl-F, and this is the one page where finding beats feeling.
 *
 * The sticky CTA bar is deliberately absent: it covers the last two lines of a
 * paragraph on mobile, and asking someone to sign up mid-way through the
 * liability clause is the wrong moment.
 */
export function LegalDocument({ doc }: { doc: LegalDoc }) {
  return (
    <>
      <Nav />
      <main id="contenu" className="pt-[72px]">
        <header className="mx-auto max-w-content px-5 pb-14 pt-16 md:px-8 md:pb-16 md:pt-24">
          <Text as="p" variant="label" tone="secondary">
            Sougouba
          </Text>
          <Text as="h1" variant="display" className="mt-4 max-w-[16ch]">
            {doc.title}
          </Text>
          <Text as="p" tone="muted" className="mt-6 max-w-[62ch] text-[1.125rem]">
            {typo(doc.lede)}
          </Text>
          <Text as="p" variant="caption" tone="muted" className="mt-8">
            Dernière mise à jour : {LAST_UPDATED}
          </Text>

          {!REVIEWED && (
            <div
              role="note"
              className="mt-8 max-w-[62ch] rounded-2xl border border-mustard-400/60 bg-mustard-50 p-5 dark:border-mustard-600/50 dark:bg-mustard-950/40"
            >
              <p className="font-sans text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-mustard-800 dark:text-mustard-300">
                Brouillon
              </p>
              <p className="mt-2 font-sans text-[0.9375rem] leading-[1.6] text-mustard-900 dark:text-mustard-100">
                {typo(draftNotice)}
              </p>
            </div>
          )}
        </header>

        <WovenBand height={20} />

        <div className="mx-auto max-w-content px-5 py-14 md:px-8 md:py-20">
          <div className="lg:grid lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-16">
            <Toc doc={doc} />

            <article className="max-w-[68ch]">
              {doc.sections.map((s, i) => (
                <section
                  key={s.id}
                  id={s.id}
                  className={
                    i === 0
                      ? 'scroll-mt-28'
                      : 'mt-14 scroll-mt-28 border-t border-border pt-14'
                  }
                >
                  <Text as="h2" variant="subtitle" className="text-[1.375rem] md:text-[1.5rem]">
                    {typo(s.title)}
                  </Text>
                  {s.blocks.map((b, j) => (
                    <Block key={j} block={b} />
                  ))}
                </section>
              ))}
            </article>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

/**
 * Sticky on desktop, a plain jump list on mobile. Not a client component: the
 * browser's own `:target` scrolling is enough, and a scroll-spy here would buy
 * a highlight nobody asked for at the cost of shipping JS to a text page.
 */
function Toc({ doc }: { doc: LegalDoc }) {
  return (
    <nav aria-label="Sections de ce document" className="mb-12 lg:mb-0">
      <div className="lg:sticky lg:top-28">
        <p className="font-sans text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Sur cette page
        </p>
        <ol className="mt-4 space-y-2 border-l border-border pl-4">
          {doc.sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="font-sans text-[0.875rem] leading-snug text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                {typo(s.title)}
              </a>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case 'h3':
      return (
        <h3 className="mt-8 font-sans text-[0.9375rem] font-semibold tracking-[-0.005em] text-foreground">
          <Marked text={block.text} />
        </h3>
      );

    case 'p':
      return (
        <p className="mt-5 font-sans text-[1.0625rem] leading-[1.68] text-muted-foreground">
          <Marked text={block.text} />
        </p>
      );

    case 'list':
      return (
        <ul className="mt-5 space-y-3">
          {block.items.map((item, i) => (
            <li
              key={i}
              className="relative pl-6 font-sans text-[1.0625rem] leading-[1.68] text-muted-foreground before:absolute before:left-0 before:top-[0.72em] before:h-[5px] before:w-[5px] before:rounded-full before:bg-secondary"
            >
              <Marked text={item} />
            </li>
          ))}
        </ul>
      );

    case 'table':
      // Wide content scrolls inside its own box; the page body never does.
      return (
        <div className="mt-6 -mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
          <table className="w-full min-w-[34rem] border-collapse text-left">
            <thead>
              <tr>
                {block.head.map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="border-b border-border-strong pb-2 pr-6 font-sans text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-foreground last:pr-0"
                  >
                    <Marked text={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className="border-b border-border py-3 pr-6 align-top font-sans text-[0.9375rem] leading-[1.55] text-muted-foreground last:pr-0"
                    >
                      <Marked text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/**
 * French spacing applied, then the ⟦…⟧ gaps marked so they cannot be mistaken
 * for prose. `<mark>` rather than a styled span: a screen reader announces it,
 * which is exactly what you want from "this sentence is not finished".
 */
function Marked({ text }: { text: string }) {
  return (
    <>
      {splitPlaceholders(typo(text)).map((part, i) =>
        part.placeholder ? (
          <mark
            key={i}
            className="rounded-[4px] bg-mustard-200 px-1.5 py-0.5 text-[0.9375em] text-mustard-950 dark:bg-mustard-800/60 dark:text-mustard-50"
          >
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}
