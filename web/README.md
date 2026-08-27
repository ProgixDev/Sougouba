# Sougouba — landing page

French-first (fr-CA) marketing site for Sougouba. Next.js 15 · Tailwind · TypeScript.

Brief: `../docs/LANDING-MASTER-PROMPT.md` · Plan: `../docs/LANDING-BUILD-PHASES.md`

```bash
npm install
npm run dev            # http://localhost:3000
npm run build && npm start -- -p 4319
```

## Verification

Run these at the end of every phase. The last two need the site running.

```bash
npm run typecheck
npm run verify:contrast   # WCAG AA over every token pair, both themes
npm run verify:layout     # horizontal overflow at 375/768/1024/1440, both themes
npm run shoot /tmp/shots            # full-page captures
npm run review /tmp/rev light       # section-by-section, the honest one
```

Prefer `review` over `shoot` for anything scroll-driven. A full-page capture is
misleading here: sticky sections render at their initial position, lazy images
below the fold never load, and anything behind an IntersectionObserver or scroll
progress is frozen at its starting state. `review` scrolls to each section and
shoots the viewport, which is what a reader actually sees.

`scripts/cdp.mjs` is a dependency-free Chrome DevTools Protocol client (Node's
global `WebSocket`). Plain Chrome flags cannot evaluate script in the page or
emulate device metrics, and both audits need real layout.

## Structure

```
app/page.tsx              composes the sections, in order
components/sections/      one file per section of the page
components/site/          Nav, Footer, StickyCta, BrandBasket, SignalArcs
components/ui/            the primitives — see /styleguide
lib/content.ts            every user-facing string, fr-CA
lib/band.ts               woven-band geometry, shared with the brand-kit script
lib/route.ts              the delivery route and how it is cut
```

`lib/content.ts` holds all copy, so a future English version is a copy job rather
than a refactor. Every figure in it traces to the shipped app, the cahier des
charges or the contract — see `../docs/LANDING-MASTER-PROMPT.md` §1.

## The waitlist form needs an endpoint

The apps are not live, so the email capture carries every shopper conversion the
site makes. It posts JSON `{ email, source }` to `NEXT_PUBLIC_WAITLIST_ENDPOINT`.

**With that unset the form refuses to pretend it worked** — it says the list is not
connected yet. An input that posts nowhere is the worst thing this page could ship.

```bash
echo 'NEXT_PUBLIC_WAITLIST_ENDPOINT=https://…' >> .env.local
```

## App screenshots

`../scripts/seed-sim.mjs` writes a signed-in session straight into the simulator's
AsyncStorage, so the app boots into a role's home instead of being driven through
four onboarding slides, an auth form and a role gate by synthetic taps.

```bash
node ../scripts/seed-sim.mjs <udid> customer   # or business | courier
xcrun simctl io <udid> screenshot shot.png
```

Deep links are not an option: `simctl openurl` raises an iOS "Open in Sougouba?"
confirmation that blocks the app until dismissed.

The current shots come from the **22 August** Release build, which predates the
delivery-pricing and courier-routing commits. Recapture before launch.

## The palette is shared, not copied

`tailwind.config.ts` does `require('../tailwind.tokens.js')` — the same plain-CJS
file the Expo app reads. The two surfaces cannot drift. `lib/band.ts` is likewise
imported by `../scripts/extract-brand-kit.mjs` (Node strips the types), so the
band's CSS-background and inline-SVG forms come from one definition.

Semantic tokens are CSS variables in `app/globals.css`, mirroring the app's
`global.css`. Three deliberate carry-overs:

- `secondary` is **terracotta-600**, not 500 — white on 500 is 3.61:1 and fails AA.
- `muted-foreground` is **neutral-600**, not 500 — 500 fails on every surface.
- `border-strong` gets a CSS variable here. The app has it in `ThemeColors` but
  never exposed it, so it is unreachable from a className there.

And two tokens this surface adds. `success` (3.41:1 on white) and `accent`
(2.45:1) are **fill colours, not ink** — using them as text or as a glyph on a
light ground fails AA. `success-strong` and `accent-strong` exist for that, which
is the same lesson the app recorded as "keep the accent on the icon, carry
emphasis by weight, never meaning by colour alone."

## Animation is CSS, not a library

`motion` is a dependency but nothing imports it yet. Reveals and the woven band
are CSS transitions driven by an `IntersectionObserver` that flips a class, for
three reasons:

1. **No-JS safety.** A motion library serialises `initial` into the SSR HTML as
   inline `opacity:0`, so with scripting off the content never appears. Here the
   hidden state is scoped to `.js` — a class only ever added by script.
2. **Reduced motion.** The media query overrides the hidden state outright, so
   content is *present*, not merely un-animated.
3. **Weight.** Doing it in CSS took the home route from 146 kB to 106 kB of
   first-load JS, under the 120 kB budget.

`motion` earns its place in Phases 2, 4 and 7, where scroll-scrubbing genuinely
needs `useScroll`/`useTransform`. Import it there, code-split per section.

## Variable fonts

Bricolage Grotesque is loaded with `axes: ['opsz', 'wdth']` — `next/font` only
ships non-weight axes you name, and without them the face silently degrades to
static. `/styleguide` renders the same word at the same size with `opsz` 12 and
96 side by side; if those two lines look identical, the variable font is not
loading and the typographic argument has collapsed. Check it after any font change.
