import { Reveal } from '@/components/ui';
import { ingredients } from '@/lib/content';
import manifest from '@/public/img/manifest.json';
import { cn } from '@/lib/cn';

/**
 * The loudest moment on the page, and the only place the spice photograph appears.
 *
 * The words are set in a loose wrapping flow, not a grid and not chips: the point
 * is a wall of things you cannot buy at the corner store, and a tidy grid turns
 * that into a feature list. Roughly one word in four takes the mustard.
 */
export function IngredientWall() {
  const photo = manifest.photos.spices;
  return (
    // Dark in both themes, and full-bleed under the sticky nav — so it declares
    // which palette the nav must wear over it. See components/site/useNavTheme.ts.
    <section
      id="rayon"
      data-nav-theme="dark"
      className="relative isolate overflow-hidden py-24 lg:py-36"
    >
      <picture>
        <source
          type="image/avif"
          srcSet={photo.widths.map((w) => `/img/spices-${w}.avif ${w}w`).join(', ')}
          sizes="100vw"
        />
        <source
          type="image/webp"
          srcSet={photo.widths.map((w) => `/img/spices-${w}.webp ${w}w`).join(', ')}
          sizes="100vw"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/img/spices-1920.jpg"
          alt={photo.alt}
          width={photo.intrinsic[0]}
          height={photo.intrinsic[1]}
          loading="lazy"
          decoding="async"
          className="kenburns kenburns-a absolute inset-0 -z-10 h-full w-full object-cover"
        />
      </picture>
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            'linear-gradient(to bottom, rgba(10,32,24,0.86) 0%, rgba(10,32,24,0.72) 45%, rgba(10,32,24,0.92) 100%)',
        }}
      />

      <div className="mx-auto max-w-content px-5 md:px-8">
        <Reveal>
          <p className="font-sans text-[0.75rem] font-semibold uppercase tracking-[0.09em] text-mustard-300">
            {ingredients.eyebrow}
          </p>
          <h2 className="mt-3 max-w-[18ch] font-display text-[clamp(1.9rem,4vw,3.25rem)] font-extrabold leading-[1.05] tracking-[-0.015em] display-title text-[#F3EFE6]">
            {ingredients.title}
          </h2>
        </Reveal>

        <ul className="mt-12 flex max-w-[24ch] flex-wrap items-baseline gap-x-6 gap-y-2 sm:max-w-none">
          {ingredients.words.map((w, i) => (
            <Reveal key={w} index={i}>
              <li
                className={cn(
                  'font-display text-[clamp(1.5rem,3.4vw,3rem)] font-bold leading-[1.15] opsz-32',
                  i % 4 === 1 ? 'text-mustard-300' : 'text-[#F3EFE6]'
                )}
              >
                {w}
              </li>
            </Reveal>
          ))}
        </ul>

        <Reveal index={6}>
          <p className="mt-12 max-w-[52ch] font-sans text-[1.0625rem] text-[#F3EFE6]/80">
            {ingredients.closing}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
