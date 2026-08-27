import { Reveal, Text } from '@/components/ui';
import { verticals } from '@/lib/content';
import manifest from '@/public/img/manifest.json';

type PhotoKey = keyof typeof manifest.photos;

/**
 * Two cards, one per vertical, with the app's own four-stop photo scrim. A
 * two-stop approximation looks noticeably cheaper — the extra stops are what stop
 * the middle of the image going muddy while the bottom stays dark enough to hold
 * type.
 *
 * The Ken Burns drift alternates direction per card so they never move in lockstep.
 */
export function Verticals() {
  return (
    <section id="verticales" className="mx-auto max-w-content px-5 py-20 md:px-8 lg:py-28">
      <Reveal>
        <Text variant="label" tone="muted" as="p">{verticals.eyebrow}</Text>
        <Text variant="title" as="h2" className="mt-3 max-w-[16ch]">{verticals.title}</Text>
      </Reveal>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {verticals.items.map((v, i) => {
          const photo = manifest.photos[v.photo as PhotoKey];
          return (
            <Reveal key={v.key} index={i}>
              <article className="group relative aspect-[4/5] overflow-hidden rounded-card sm:aspect-[5/4] md:aspect-[4/5]">
                <picture>
                  <source
                    type="image/avif"
                    srcSet={photo.widths.map((w) => `/img/${v.photo}-${w}.avif ${w}w`).join(', ')}
                    sizes="(max-width: 768px) 100vw, 570px"
                  />
                  <source
                    type="image/webp"
                    srcSet={photo.widths.map((w) => `/img/${v.photo}-${w}.webp ${w}w`).join(', ')}
                    sizes="(max-width: 768px) 100vw, 570px"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/img/${v.photo}-1200.jpg`}
                    alt={photo.alt}
                    width={photo.intrinsic[0]}
                    height={photo.intrinsic[1]}
                    loading="lazy"
                    decoding="async"
                    className={`kenburns kenburns-${i % 2 === 0 ? 'a' : 'b'} absolute inset-0 h-full w-full object-cover`}
                  />
                </picture>
                {/* The app's own scrim, four stops with explicit positions. */}
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(to bottom, rgba(10,32,24,0.42) 0%, rgba(10,32,24,0.05) 30%, rgba(10,32,24,0.88) 68%, #0A2018 100%)',
                  }}
                />
                <div className="absolute inset-x-0 bottom-0 p-7 md:p-8">
                  <p className="font-display text-[clamp(1.75rem,3.4vw,2.5rem)] font-extrabold leading-none opsz-32 text-[#F3EFE6]">
                    {v.name}
                  </p>
                  <p className="mt-3 max-w-[38ch] font-sans text-[0.9375rem] leading-relaxed text-[#F3EFE6]/85">
                    {v.blurb}
                  </p>
                  <ul className="mt-5 flex flex-wrap gap-x-3 gap-y-1.5">
                    {v.shops.map((s) => (
                      <li
                        key={s}
                        className="font-sans text-[0.8125rem] text-[#F3EFE6]/70 after:ml-3 after:text-[#F3EFE6]/30 after:content-['·'] last:after:content-['']"
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
