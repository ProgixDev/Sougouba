# Sougouba Landing Page — Build Phases

Companion to `docs/LANDING-MASTER-PROMPT.md`. That document is *what to build*.
This one is *in what order, and how to know each part is finished*.

Nine phases. Each one is deliberately narrow so it can be finished properly rather
than approximated, and each ends at a **review gate** — a specific thing you look
at and either approve or send back. Nothing proceeds past a gate that has not been
looked at, because every later phase inherits the decisions of the earlier ones.

---

## Rules that apply to every phase

1. **No placeholder copy, ever.** A section ships with final fr-CA text or it does
   not ship. `Lorem ipsum` in a commit is a failed phase.
2. **The page is shippable at the end of every phase.** Phase 4 ends with a page
   that is missing sections, not with a page that is broken.
3. **Resting state first, motion second.** Build each section static and correct.
   Only then add the animation. If the static version does not look finished, the
   animation is hiding a design problem.
4. **Screenshot test.** At the end of each phase, screenshot the page at five
   arbitrary scroll positions. Every one must look like a finished frame.
5. **Reduced motion is not a final pass.** Every animated element gets its
   `prefers-reduced-motion` branch written in the same commit as the animation.
6. **One depth cue per element** — the standing rule from the master prompt. Check
   it at each gate, not at the end.
7. **Contrast is checked arithmetically, not by eye.** The app has
   `scripts/verify-contrast.ts` for exactly this reason. The site gets its own.

---

## Status — all phases built, awaiting visual review

| Phase | State |
|---|---|
| 0 · Ground truth and raw material | **Done.** Vector brand kit, responsive imagery, re-encoded film |
| 1 · Foundation and design system | **Done.** `web/`, shared tokens, variable fonts, primitives, `/styleguide` |
| 2 · The hero | **Done.** Masked line reveal, basket fill, signal arcs, nav basket progress |
| 3 · Browse chapters | **Done.** Woven divider, counters, halal badge, verticals, ingredient wall, how-it-works |
| 4 · Live-tracking map | **Done.** Three-layer route, scroll-scrubbed puck, sonar, derived ETA |
| 4.5 · App screenshots | **Done.** Three roles captured from the running app via AsyncStorage seeding |
| 5 · Trois applications | **Done.** Three cross-fading palettes, real device frames |
| 6 · Conversion sections | **Done.** Merchant, courier, receipt, final CTA, footer, sticky mobile bar |
| 7 · Language and copy | **Done.** All copy in `lib/content.ts`, fr-CA, JSON-LD, robots, sitemap |
| 8 · Hardening | **Done bar deploy.** Three audits green; deploy + legal pages outstanding |

**Next: your visual review.** The site is at `/`, the primitives at `/styleguide`.

### Self-review pass — four bugs found and fixed

Done before handing over, by reviewing every section at 1280 and 375 in both
themes with `npm run review`:

1. **The proof strip claimed "0 commerces" without JavaScript.** The counters were
   seeded at zero and animated up on scroll, so the SSR HTML shipped zeros. That
   is not a missing animation, it is a false claim about the business — and the
   strip exists to be believed. The server now renders the true values and the
   client resets to zero in a *layout* effect (before paint, so no flash) only
   when it actually intends to animate.
2. **The final CTA was a light island in dark mode.** Its mint gradient was
   hard-coded for both themes, and the sticky nav — still styled dark — put an
   ivory wordmark and light-grey links on a pale ground, both invisible. The
   section is theme-aware now. The merchant and courier slabs stay fixed-dark on
   purpose: that is the app's role-surface language, and this section had no such
   reason.
3. **The nav went unreadable over full-bleed dark sections.** In light mode the
   deep forest wordmark vanished into the ingredient wall's photograph. The nav
   now reads what is under it: any section can declare `data-nav-theme`, and one
   whose ground changes mid-scroll (the app chapter) just updates its own
   attribute. No shared state, one source of truth per section.
4. **`opacity:0` reached the SSR HTML again**, this time from the hero's headline
   and basket — React-state inline styles, the same trap `Reveal` fell into in
   Phase 1. Moved to the `.js`-scoped CSS pattern. Down to a single node, which is
   the courier glow overlay and is correctly hidden.

Verified alongside: tab order matches visual order with a 2px ring on every stop;
one `h1`, no heading skips, no missing `alt`, no unlabelled buttons; reduced motion
leaves nothing hidden and nothing animating; 451 KB over 20 requests.

**A deliberate divergence:** at 375px the nav carries only the wordmark and theme
toggle. Four links plus a CTA plus a toggle do not fit, and the sticky bottom bar
carries the merchant action from the moment the hero leaves the viewport. The hero
itself has both CTAs above the fold.

### Outstanding, and why

- **Waitlist endpoint.** The form posts to `NEXT_PUBLIC_WAITLIST_ENDPOINT`. Unset,
  it says so plainly rather than pretending to succeed. Needs a provider.
- **Supply-first was assumed.** The nav CTA, the sticky mobile bar and §09's weight
  all follow the recommendation in master prompt §9. Reversible, but not trivially
  — say now if the client wants waitlist volume as the headline instead.
- **Domain assumed** `sougouba.ca`, from the support address. Canonical, OG and
  sitemap all read it from `lib/content.ts`.
- **First-load JS is 122 kB against a 120 kB budget.** Two over, all of it the
  React/Next baseline (103 kB shared). Not worth contorting the code for; noted
  rather than hidden.
- **Legal pages do not exist.** The footer must not link to nothing before launch.
- **App screenshots come from the 22 August Release build**, which predates the
  delivery-pricing and courier-routing commits. Good enough to review; recapture
  before launch with `node scripts/seed-sim.mjs <udid> <role>`.

---

## Phase 0 · Ground truth and raw material

**Goal:** remove every unknown and every missing asset, so that no later phase
stops to guess. Nothing is designed in this phase.

**Scope**

- **Two decisions are now made** and are locked into the master prompt:
  **the apps are not live** (§9 — inert *« Bientôt »* capsules, waitlist, supply-first
  hierarchy) and **the site is French only** (§6 — no `/en`, no language toggle).
- **Answer the remaining questions** (master prompt §12). Two are hard blockers:
  - *Which service receives the waitlist emails?* With no app to download, this is
    the site's only shopper conversion. Phase 6 cannot ship a field that posts
    nowhere. Pick the provider, get the key, confirm it accepts a bare email with
    no name field.
  - *Is `sougouba.ca` the domain?* `soutien@sougouba.ca` implies it. Needed for
    canonical URLs and OG tags.
- **Put the supply-first recommendation to the client.** §9 argues the merchant
  CTA should carry the weight the download CTA would have had, because a
  pre-launch marketplace needs grocers far more than it needs a waitlist. That is
  a business call, not a design one — get an answer before Phase 2 sets the hero's
  CTA hierarchy.
- **Extract the vector brand kit from `docs/logo.pdf`.** Confirmed viable:
  the file is pure Illustrator vector — no embedded rasters, no live fonts — and
  `pdftocairo -svg` yields **270 discrete paths**. That means the basket, *each
  individual triangle in the woven band*, each signal arc and each letterform is
  separately addressable. Split it into four optimised SVGs:
  `mark.svg`, `wordmark.svg`, `band.svg` (triangles as siblings, so they can be
  staggered), `arcs.svg` (three paths, ready for `stroke-dashoffset`).
  This is what makes the woven-band weave and the arc-draw real vector animation
  instead of a traced PNG.
- ~~Capture app screenshots.~~ **Moved — see "Screenshots move to Phase 4.5" below.**
- **Prepare imagery.** The four onboarding photos and a selected subset of the 88
  catalogue photos → AVIF + WebP, at the sizes the layout actually needs, with
  dimensions recorded. Re-encode `splashscreen.mp4` to AV1 + H.264, muted, with a
  poster frame.
- **Confirm photo licensing surfaces.** `assets/images/CREDITS.md` must be
  reachable from the site before launch — decide whether that is a footer link or
  a `/credits` page.

**Not in this phase:** any HTML, any design.

### Screenshots move to Phase 4.5

Originally scheduled here so Phase 5 would never wait. Moved, on evidence: the
newest Release build on this machine is **22 August**, which predates the delivery
pricing and courier routing/dispatch commits — the very screens §08's device
frames are meant to show. Capturing now would either ship a misrepresentation or
be redone later, and the app is still being worked on.

They are therefore captured in a short **Phase 4.5**, immediately before Phase 5
needs them: rebuild Release (not Debug + Metro, which red-boxes on this machine),
drive three roles × 3–4 screens at 3× with `scripts/tap.sh`, deep links and
AsyncStorage seeding for populated state. Nothing between here and there depends
on them.

**Review gate:** a single folder of assets you can open, plus written answers to
the remaining questions. You should be able to open `band.svg` in a browser and
see the triangles as separate objects, and to submit a test address to the
waitlist provider and find it in the list.

**Done when:** no later phase needs to ask a question or wait for a file.

---

## Phase 1 · Foundation and the design system, proved in a browser

**Goal:** make the web surface indistinguishable in character from the app before
a single marketing section exists. This is the phase where "premium, not generic"
is actually decided.

**Scope**

- `web/` scaffolded as a sibling of `app/` (Next.js 15, App Router, TypeScript).
  **Not** a monorepo conversion of the Expo app.
- `web/tailwind.config.ts` does `require('../tailwind.tokens.js')` so the palettes
  physically cannot drift.
- Semantic tokens as CSS variables, light and dark, mirroring `global.css`.
- Both fonts via `next/font`, **with the variable axes exposed** — this is a real
  configuration step, not a `<link>` tag.
- The motion tokens from master prompt §5 as a single exported object.
- **A `/_styleguide` route** that renders every primitive: the type scale at live
  `opsz`/`wdth`, the five button variants, the six badge tones × soft/solid, cards
  at the 20 px radius, the input with its floating label and focus-ring
  interpolation, the woven band, the `Reveal` entrance primitive, and a
  light/dark toggle.
- A `verify-contrast` script for the web tokens, both themes.

**Detail work — this is the substance of the phase**

- Bricolage's `opsz` must visibly change the letterforms between 16 px and 96 px.
  If it does not, the variable font is not actually loading and the whole
  typographic argument collapses. Inspect it.
- The button's coloured shadow is `rgba(124,52,23,.16)` — terracotta-800 at 16 %.
  Not grey, not `.35`. The `.35` version is the one that was rejected.
- The badge is an 8 px radius, 11 px bold uppercase, 0.6 px tracking. Not a pill.
- Mustard carries `neutral-950` ink, never white.
- Muted text is `neutral-600`, never `neutral-500` — 500 fails AA on every surface.

**Not in this phase:** the hero, or any page content.

**Review gate:** `/styleguide` open in one window, the app's `/_dev/styleguide`
open in a simulator beside it. They should read as the same design system. This is
the most important gate in the project — everything downstream inherits it.

**Done when:** contrast passes in both themes, and the two styleguides match.

### What Phase 1 actually turned up

Four things worth carrying forward, all recorded in `web/README.md`:

1. **Two token gaps.** The contrast audit failed on `success` (3.41:1 on white)
   and `accent` (2.45:1). Neither value is wrong — both are *fill* colours being
   asked to act as ink. Added `success-strong` and `accent-strong`. Also exposed
   `border-strong` as a CSS variable, which the app defines in `ThemeColors` but
   never exposed, leaving it unreachable from a className there.
2. **The reveal shipped `opacity:0` into the SSR HTML.** A motion library
   serialises `initial` inline, so with scripting off the revealed content never
   appeared — a direct violation of the "reads completely with JS off" criterion.
   Rebuilt as CSS transitions behind a `.js` class, driven by an
   IntersectionObserver. Side effect: first-load JS fell from **146 kB to 106 kB**,
   under the 120 kB budget, and `motion` now costs nothing until Phases 2/4/7
   actually need scroll-scrubbing.
3. **149 px of horizontal overflow at 375 px**, from an oversized headline that
   overflowed its box *without widening it* — so no element reported a wide rect
   and nothing looked wrong. Only `scrollWidth` vs `clientWidth` catches that.
   It is now `npm run verify:layout`, over 4 breakpoints × 2 themes.
4. **Tooling worth reusing.** `scripts/cdp.mjs` is a dependency-free DevTools
   Protocol client; Chrome's plain flags can neither evaluate script in the page
   nor emulate device metrics, and both audits need real layout. `npm run shoot`
   uses it for review-gate screenshots.

---

## Phase 2 · The hero, alone

**Goal:** the eight seconds that decide whether anyone scrolls. It gets a phase to
itself because it is the highest-leverage screen on the site and because the
basket mechanic that runs through the whole page is established here.

**Scope:** sticky nav (§00) and hero (§01) only.

**Detail work**

- **The masked line reveal.** Three lines, each in an `overflow: hidden` wrapper,
  rising `y: 18 → 0` over 380 ms, 55 ms apart. The mask is what makes it read as
  typesetting rather than as a fade-in.
- **`wdth: 88`** on the headline. French runs ~20 % longer than English; narrowing
  the axis is how the headline holds its size instead of shrinking.
- **The basket fill.** Four produce items arriving on the house spring
  (`damping 20, stiffness 190, mass 0.9`), 55 ms apart, from `y: -24, scale: 0.9`.
- **The signal arcs** drawing via `stroke-dashoffset`, three paths, 120 ms apart,
  then a single terracotta pulse every 4 s.
- **The nav basket** — the scroll-progress mechanic that Phases 3–6 will feed.
  Build the state machine now, even though only one section fills it yet.
- **The marquee eyebrow** of neighbourhood names, 40 s linear, paused on hover.
- Exactly **one terracotta element** in the viewport.
- Reduced motion: arcs drawn, basket full, marquee static, nothing pulsing.

**Not in this phase:** anything below the fold.

**Blocked on:** the supply-first answer from Phase 0. The hero's CTA is either
*« Être prévenu du lancement »* with the merchant link secondary, or the reverse.
Do not guess — rebuilding the hero's hierarchy is not a small edit.

**Review gate:** the hero on a phone and on a 1440 px display, in both themes,
with reduced motion on and off. Watch the load animation five times — if it gets
annoying by the third, it is too long.

**Done when:** you would put it on a billboard.

---

## Phase 3 · The browse chapters

**Goal:** the middle of the page — proof, the two verticals, the ingredient wall,
and how it works. Four sections that share a rhythm.

**Scope:** §02 woven band divider · §03 counter strip + halal badge · §04 les deux
verticales · §05 l'ingredient wall · §06 comment ça marche.

**Detail work**

- **The woven band weave** — per-triangle stagger, 24 ms, capped at 400 ms. Now
  that the triangles are separate paths from Phase 0, this is real.
- **The counters** count once, on enter, tabular figures, and land on the exact
  values: 10 / 78 / 8 / 2.
- **The halal badge.** All ten seeded shops are certified and this appears nowhere
  in the current marketing. It goes here, in the app's exact badge spec.
- **The four-stop scrim** on the vertical cards, with `locations` —
  `rgba(10,32,24,.42) 0% · .05 30% · .88 68% · #0A2018 100%`. A two-stop
  approximation looks noticeably cheaper; this is the app's own recipe.
- **Ken Burns**: 16 s, `scale 1 → 1.14`, `translateY ±18 px`, alternating per card.
- **The ingredient wall** is the loudest moment on the page and the only place
  `spices.jpg` appears. Words in a loose wrapping flow — not a grid, not chips.
  Roughly one word in four is mustard.
- Reveals fire **once**, at 25 % visibility, and never re-fire on scroll-up.

**Basket events:** plantains (§04), spice bowl (§05).

**Review gate:** scroll the whole page top to bottom slowly, then quickly. The
rhythm between sections should feel even. Then scroll back up — nothing should
flicker or re-animate.

---

## Phase 4 · The live-tracking map

**Goal:** the section that proves the product is real. It is isolated because it
is the hardest engineering on the page and because it is easy to do badly.

**Scope:** §07 only.

**Detail work**

- Rebuild the app's `DeliveryMap` as inline SVG. **Draw the mechanism, do not
  illustrate it.**
- **The three-layer route**, exactly as the app does it: a white casing underneath
  (a 4 pt forest line disappears over a dark park), the road already driven in
  `neutral-300`, the road ahead in `forest-600` at full weight. Both halves
  include the cut point so they meet exactly under the puck at any zoom.
- **The sonar ring**: `opacity .34 → 0`, `scale .5 → 1`, 2000 ms, linear, no
  reverse — and **on only while the courier is moving.** A pulse on a stationary
  courier claims movement that is not happening; the app is explicit about this.
- **Scroll-scrubbed, not autoplaying.** The visitor drives the delivery.
- The ETA card reads from the *same* progress value as the puck, so the number and
  the marker can never disagree — the same rule that keeps the shopper's and the
  courier's screens in sync in the app.

**Basket event:** the courier puck.

**Review gate:** scrub the section forward and backward slowly. The route split
must stay welded under the puck. Then check it on a 375 px screen, where the map
has to simplify rather than shrink.

---

## Phase 4.5 · App screenshots

**Goal:** capture the device-frame imagery Phase 5 needs, from a build that
reflects the app as it actually stands.

- Fresh **Release** build. Debug + Metro red-boxes on this machine.
- Three roles × 3–4 screens, 3×: customer (home, product, cart, tracking),
  merchant (aperçu, commandes, catalogue), courier (missions, gains).
- Seed AsyncStorage and use deep links to reach populated states — an empty cart
  or a courier reading 0,00 $ demonstrates nothing.
- Watch the two known traps: the tap harness's warm-up click has destroyed the
  simulator window twice, and the *Save Password?* dialog fires after every
  sign-in.

**Review gate:** every screenshot shows real data and no debug overlay.

---

## Phase 5 · Trois applications — the colour-changing chapter

**Goal:** the page's most ambitious section, and the one that carries the
three-sided-marketplace story.

**Scope:** §08 only.

**Detail work**

- **Three background palettes cross-fading** as each sub-chapter crosses 50 % of
  the viewport, 600 ms: ivory→mint (customer), forest slab `#17422E → #0A2018`
  (merchant, *le comptoir*), graphite `#292520 → #17140F` with the mustard corner
  glow (courier).
- **Text colour must change with the ground, and the app already learned this the
  hard way:** on the forest slab, muted text is `forest-200 #AFD7C0`; on the
  graphite slab it is `neutral-300 #C9C3B8` — `neutral-400` fails AA against the
  mustard glow. Verify arithmetically, with the glow composited in.
- Real device frames with the Phase 0 screenshots at 3×. Two or three per chapter,
  overlapping, centre one forward. **No CSS-mocked phone screens.**
- The cross-fade must not cause a flash of unreadable text mid-transition. Test at
  slow scroll speeds, which is where that bug lives.

**Review gate:** scroll through the three chapters at three different speeds. Text
must stay readable at every intermediate state.

---

## Phase 6 · The conversion sections

**Goal:** everything that asks for something.

**Scope:** §09 merchant · §09b courier · §10 the receipt · §11 final CTA ·
§12 footer.

**Detail work**

- **Terms stated plainly.** 12 % + 70 $/mois, cumulative. 3,50 $ + 0,90 $/km +
  100 % of tips. Hiding them costs more trust than showing them.
- **Merchant and courier onboarding steps verbatim** from `lib/merchantOnboarding.ts`
  and `lib/courierOnboarding.ts`. Do not rewrite them; they are already good.
- **No turnaround time for merchants** — none exists in the source. The courier's
  *« un jour ouvrable »* is real and may be used, on the courier section only.
- **The receipt** — scroll-scrubbed, tabular figures, five real products, and the
  arithmetic checked against `data/taxes.ts` and `data/deliveryPricing.ts`:
  34,48 → TPS 1,72 → TVQ 3,44 → livraison 3,99 → **43,63 $**.
- **The courier CTA is mustard with dark ink**, not terracotta — terracotta on
  graphite reads as a warning. The one-terracotta-per-viewport rule still holds.
- **Store badges are inert.** Muted ground, hairline border, dark ink, small
  Lucide glyph, *« Bientôt sur l'App Store »* / *« Bientôt sur Google Play »*. Not
  buttons, no hover state, no `href`. **No QR code** — one that resolves to
  nothing is worse than none.
- **The email capture is the most important element in this phase**, because it
  carries every shopper conversion the site will make. Real destination, inline
  validation on blur, error stating cause and fix, and a genuine success state
  that replaces the field rather than a toast that vanishes. One field only.
- The sticky mobile CTA bar, safe-area padded, appearing after the hero exits,
  carrying the **merchant** action.
- Footer: photo attribution surfaced, Progix credit, the Bambara line.

**Basket event:** full, arcs firing — the film's last frame.

**Review gate:** click every link. Any that goes nowhere either gets a destination
or gets removed.

---

## Phase 7 · Language and copy

**Goal:** the writing, treated as its own craft rather than as filler between
components.

**Scope**

- **A full French typographic pass.** Narrow no-break space before `: ? ! % $`,
  `«… »` quotes, `1 234,56 $` with a space as thousands separator and the dollar
  sign after. This is the detail that tells a Québécois reader whether the site was
  made by someone who speaks their language.
- **A voice pass.** *Vous*, never *tu*. No exclamation marks. No
  "révolutionnaire", "incontournable", "en un clin d'œil". Every claim traceable
  to master prompt §1.
- **Decided: French only.** No `/en`, no `hreflang`, and **no language toggle** —
  a toggle with one language in it is a dead control. Two cheap hedges so a future
  English version is a copy job and not a refactor: keep user-facing strings in a
  single `copy/` module rather than inline in JSX (the app made the same call in
  `lib/copy/common.ts`), and put `fr-CA` behind one constant instead of hard-coding
  it at call sites.
- Alt text on every meaningful image, in French.
- Metadata, OG image, `SoftwareApplication` + `LocalBusiness` JSON-LD.

**Review gate:** read the entire page aloud in French. Anything that sounds
translated gets rewritten.

---

## Phase 8 · Hardening and launch

**Goal:** the difference between a demo and a site.

**Scope**

- **Performance:** LCP < 2.0 s on 4G throttle, CLS < 0.05, INP < 200 ms, initial
  JS < 120 KB gzipped. Motion code-split per section; nothing below the fold ships
  JS above it.
- **Accessibility, as an audit not an assumption:** contrast in both themes,
  focus rings, heading order, full keyboard operation, skip link, 44 px targets.
- **Reduced motion, end to end.** Nothing moves; nothing is missing.
- **Dark mode reviewed independently**, not inferred from light.
- **Responsive at 375 / 768 / 1024 / 1440 and in landscape.** 375 is the one that
  breaks.
- **JavaScript off:** the page still reads completely.
- Lighthouse ≥ 95 × 4. Sitemap, robots, canonical.
- Deploy, domain, SSL, analytics (privacy-respecting), and the legal pages —
  **which must exist, because the footer links to them.**

**Review gate:** the Definition of Done checklist in master prompt §11, walked
line by line on the deployed URL rather than on localhost.

---

## Sequencing notes

- **Phase 0 blocks Phase 5** (screenshots) and **Phase 6** (store badges). Start
  it first and let it run while Phase 1 proceeds — they do not conflict.
- **Phase 1 blocks everything.** Do not start the hero to "see how it looks"; the
  hero built on unfinished primitives has to be rebuilt.
- **Phases 3, 4 and 5 are independent of each other** once Phase 2 has established
  the basket mechanic and the section rhythm. If more than one person is working,
  this is where the work parallelises.
- **Phase 7 could be folded into each section** — but historically it then gets
  skipped, and French typographic detail is precisely the kind of thing that only
  survives as a dedicated pass.

---

## What I need from you

**Answered, and now locked in:** the apps are not live, and the site is French
only. Both are reflected in the master prompt.

**Still needed, in priority order:**

1. **The waitlist provider** — blocks Phase 6, and it is now the only shopper
   conversion on the site.
2. **Supply-first or waitlist-first?** — blocks Phase 2's CTA hierarchy. My
   recommendation is supply-first; the reasoning is in master prompt §9.
3. **The domain**, and confirmation of the Bambara gloss with the client.
4. The remaining §12 questions, which can arrive during Phases 1–3 without
   stalling anything.

Everything else in Phase 0 I can do from the repo.
