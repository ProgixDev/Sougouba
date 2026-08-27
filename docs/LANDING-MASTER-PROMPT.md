# Sougouba — Master Prompt: Landing Page (sougouba.ca)

> **How to use this file.** Everything below is the brief. Paste it whole into the
> builder (Claude Code, Cursor, v0). It is written to be executed, not admired —
> every number in it is taken from the shipped app, the signed contract
> (`docs/Devis contractuel · Progix — Sougouba.pdf`) or the cahier des charges
> (`CDC Sougouba.pdf`), and nothing in it is invented. If a section tells you to
> confirm something with the client, do not guess it into the page.

---

## 0. The one-paragraph brief

Build **sougouba.ca**: a French-first (fr-CA), scroll-animated marketing site for
Sougouba — a Québec marketplace that connects Montréal, Montréal-Nord, Laval and
Longueuil to the African and Maghrebi grocers, butchers and kitchens already in
those boroughs. It sells three things to three audiences on one page: the
**shopper app** (iOS + Android), the **merchant side** (dashboard, catalogue,
orders, payouts), and the **courier side** (missions, live navigation, earnings).
The page's job is to make a Montrealer who has been driving 40 minutes to Jean-Talon
for ras el hanout understand, in eight seconds, that they no longer have to.

---

## 1. What Sougouba actually is — the facts you may state

Use these. Do not embellish them.

| Fact | Value |
|---|---|
| What | Marketplace connecting Québec consumers to African & Maghrebi grocers and restaurants |
| Where | Montréal, Montréal-Nord, Laval, Longueuil |
| Verticals | **Épicerie** and **Restaurant**. Two. (Boulangerie was withdrawn from v1 scope — CDC addendum §01.) |
| Surfaces | iOS app, Android app, merchant dashboard, courier app, admin back-office |
| Catalogue today | 10 commerces, 78 produits, 8 catégories |
| Real shop names | Marché Bamako · Épicerie Atlas · Boucherie du Sahel · Saveurs de Dakar · Douceurs du Maghreb · Épicerie Teranga · Souk El Medina · Marché Kilimandjaro · Café Tanit · Chez Mama Adjoa |
| Products worth naming | ras el hanout, attiéké, bissap, fonio, agneau halal, gari, jaxatu, chebakia, msemen, jollof |
| Neighbourhoods (name these, not the cities) | Côte-des-Neiges · Villeray · Parc-Extension · Saint-Laurent · Montréal-Nord · Chomedey (Laval) · Vieux-Longueuil |
| Categories | Fruits & Légumes · Épices & Condiments · Viande Halal · Boissons · Plats Préparés · Produits Laitiers · Céréales & Légumineuses · Pains & Pâtisseries |
| **Halal** | **All ten shops are halal-certified** (`isHalalCertified: true` on every seeded vendor). This is a real, checkable differentiator and it is currently missing from the pitch. |
| Payments | Stripe Connect · Apple Pay · Google Pay · Visa / Mastercard / **Interac** · multi-vendor payouts. **No cash on delivery** — removed by the client, août 2026: *« Les paiements se font dans l'application — pas de comptant à la livraison. »* |
| Taxes | TPS 5 % + TVQ 9,975 %, **on the products only** — never on delivery |
| Delivery fee | Distance bands set by Sougouba, not by the shop: ≤2 km 2,99 $ · ≤5 km 3,99 $ · ≤8 km 5,49 $ · ≤12 km 6,99 $ · beyond 8,99 $ |
| Merchant terms | 12 % commission on sales + 70 $/mois abonnement — **cumulative, not either/or** |
| Live tracking | Real GPS, Mapbox, shopper and courier read the same clock so their screens never disagree |
| Courier pay | 3,50 $ prise en charge + 0,90 $/km on the shop→client leg, **plus 100 % of tips** (Sougouba takes nothing from a tip). Rates are placeholders — confirm. |
| Loyalty | Points, coupons, parrainage |
| Support | soutien@sougouba.ca |
| Built by | Progix Inc. (NEQ 1181317117) — Montréal |
| Bundle / package | `pro.progix.sougouba` |

**The name.** *Sougouba* is Bambara for **"the big market"** — this is recorded in
`docs/PROGRESS.md`, not guessed. It is the single best story hook available and it
is used nowhere in the product. Give it a quiet line in the footer or the About
block — never a hero headline, never a "Did you know?" card. Have the client
confirm the gloss before it goes public; it is their word, from their language.

---

## 2. The organizing idea — steal it from the brand's own film

`assets/video/splashscreen.mp4` is 8.2 seconds long and it already tells the
story: **an empty woven basket rises → it fills with produce → a signal arc rises
above it → the wordmark resolves.** Empty, full, connected, named.

**The page is that film, unrolled down a scroll.**

- The hero holds the **empty basket**.
- Each section that follows **drops one real item into it** — a bunch of plantains
  at the Épicerie section, a bowl at the Restaurant section, a courier puck at
  the tracking section.
- A **small basket icon in the sticky nav fills in step**, item by item, as a
  scroll-progress indicator that is not a progress bar.
- The final CTA is the basket **full**, with the signal arc firing — the same
  frame the film ends on.

This is the spine. It is why the page is animated rather than decorated. Do not
replace it with a generic parallax hero.

### The second motif: the woven band

The logo's basket carries a band of **green / terracotta / mustard triangles** on
raffia. That band is the page's structural rhythm — draw it as inline SVG and use
it as the section divider. Each triangle is an independent `<path>`, so the band
can **weave itself in** left-to-right on scroll (stagger 24 ms per triangle,
capped at 400 ms total). It is brand-native ornament. It replaces every rule,
every gradient blob, and every "decorative shape" you would otherwise reach for.

---

## 3. THE ANTI-SLOP CONTRACT — read this twice

This project has already rejected over-decorated work once. From the build log,
verbatim:

> The first CTA design (diagonal gradient + glossy white top-highlight + strong
> 0.35-opacity coloured shadow) was explicitly rejected as **"so ugly."** Fixed by
> going flatter, not richer. **Lesson: prefer ONE subtle depth cue, not stacked
> gradient + gloss + glow.**

> Wants visibly premium UI by default — but the ceiling is "confident + flat +
> one subtle depth cue." **When in doubt, do less, more precisely.**

**Banned outright. Any one of these fails the review:**

1. **Mesh gradients, gradient blobs, aurora backgrounds, animated blurred orbs.**
   The ground is ivory `#FAF9F7`. Depth comes from photography and one shadow.
2. **Purple/indigo/violet anywhere.** Not in a gradient, not in an icon, not in a
   focus ring. This palette is forest, terracotta, mustard, ivory. Four colours.
3. **Stacked depth.** One element gets at most **one** of: a shadow, a gradient,
   a blur, a border. Never two. Never three.
4. **Fabricated social proof.** The app is pre-launch. No star ratings, no
   "4.9 ★ · 12 000 téléchargements", no invented testimonials, no headshots from a
   stock library with a made-up name and borough under them. If you want proof,
   use the catalogue: *78 produits. 10 commerces. 4 villes.* That is true.
5. **Stock photography of smiling delivery couriers, or hands holding phones.**
   Use the repo's own photography (§7). It is licensed, it is real, and it is the
   only imagery that matches the app.
6. **Emoji as icons.** Lucide only, 1.5–2 px stroke, one weight per hierarchy level.
7. **English section labels.** No "Features", "Benefits", "Get Started", "Pricing",
   "FAQ" as headings on a fr-CA page. Write French headlines that say something —
   the app's own onboarding copy is the register to match (§6).
8. **Lorem ipsum, placeholder names, `[Your Company]`, "Company Inc."** Every string
   ships final or the section does not ship.
9. **"Powered by AI" badges, sparkle icons, glowing borders, bento grids of empty
   cards.** There is an AI support assistant in the contract; it is a line item,
   not a personality.
10. **Fake App Store / Play Store links.** The apps are **not live** (§9). The
    badges are inert *« Bientôt »* capsules. They are never buttons and they never
    link to a 404.
11. **Numbers you cannot source.** No "+40 % de ventes", no "livré en 25 minutes",
    no growth chart with invented data. Every figure on the page traces to §1.
12. **Auto-playing audio, scroll-jacking, a custom cursor, a preloader.**
13. **Claims that run ahead of the code.** The app today is a front-end prototype:
    mock data, no backend, no real payment processing, admin back-office not built.
    Stripe Connect, live GPS and the dashboards are all **contracted scope** and are
    fine to describe as what Sougouba does — but do not write *"des milliers de
    commandes traitées"*, do not show a live order counter, and do not put a
    delivery time on the page. The seeded ETAs (25–35 min) are mock values; treat
    them as unconfirmed until the client says otherwise.

**Required, as the positive counterpart:**

- The page must be **legible with JavaScript off and with `prefers-reduced-motion:
  reduce` on.** Animation reveals content that is already there; it never gates it.
- Every animated element has a **resting state that is the design** — if you paused
  the page at any scroll position and screenshotted it, it would look finished.
- **Terracotta is rationed.** It is the CTA colour and nothing else. At most one
  terracotta element is visible in the viewport at any time. Scarcity is what makes
  it read as *the* action.

---

## 4. Design system — non-negotiable, lifted from the app

The site and the app must be visibly the same product. These values are already in
`tailwind.tokens.js` and `global.css`; port them, do not re-pick them.

### Colour ramps

```
forest      50 #EEF6F1 · 100 #D6EBDF · 200 #AFD7C0 · 300 #82BE9C · 400 #57A379
            500 #35875C · 600 #246B47 · 700 #1C5439 · 800 #17422E · 900 #123626 · 950 #0A2018
terracotta  50 #FDF3EE · 100 #FBE3D6 · 200 #F5C4A8 · 300 #EE9F72 · 400 #E67D48
            500 #D9642C · 600 #BF5122 · 700 #9C401B · 800 #7C3417 · 900 #642A13 · 950 #38160A
mustard     50 #FDF8E9 · 100 #FAEEC4 · 200 #F4DD8C · 300 #EDC957 · 400 #E4B233
            500 #D89A1E · 600 #B57C16 · 700 #8E6013 · 800 #714E14 · 900 #5C4114 · 950 #332309
neutral     25 #FEFDFB · 50 #FAF9F7 · 100 #F0EEEA · 200 #E2DED7 · 300 #C9C3B8 · 400 #A9A196
            500 #8A8175 · 600 #6E665C · 700 #554F47 · 800 #3D3833 · 900 #292520 · 950 #17140F
```

### Semantic tokens (light — the site's default)

```css
--background: #FAF9F7;   --foreground: #292520;   --card: #FFFFFF;
--primary: #246B47;      --primary-fg: #FFFFFF;   /* forest-600 */
--secondary: #BF5122;    --secondary-fg: #FFFFFF; /* terracotta-600 — the CTA */
--accent: #D89A1E;       --accent-fg: #292520;    /* mustard-500 */
--muted: #F0EEEA;        --muted-fg: #6E665C;     --border: #E2DED7;
--success: #2F9E5C;      --ring: #246B47;
```

Two contrast decisions were made deliberately in the app — keep them:
- **terracotta-500 fails AA with white text (3.61:1). Use terracotta-600 (4.76:1).**
- **neutral-500 fails AA on every surface. Muted text is neutral-600.**
- **Mustard never carries white text.** On mustard, ink is `neutral-950`.

### Dark mode

Ship it. It is a **tonal derivation, not an inversion** — forest-tinted near-blacks:
`bg #0B1712 · card #132420 · muted #1B302A · border #24382F · fg #F3EFE6`, with
`primary → forest-300 #82BE9C`, `secondary → terracotta-400 #E67D48`,
`accent → mustard-400 #E4B233`. Respect `prefers-color-scheme` and offer a toggle.

### Typography

**Bricolage Grotesque** (display) + **Hanken Grotesk** (body/UI). Both on Google
Fonts. This pairing is chosen and confirmed — do not substitute Inter, do not
substitute a serif.

```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
```

**Use Bricolage as a variable font, on all three axes.** This is the single
highest-leverage anti-slop move on the page and almost nobody does it:

- `opsz` tracks the rendered size. A 96 px hero headline sets `opsz: 96`; a 20 px
  subtitle sets `opsz: 20`. The letterforms are drawn for their size instead of
  scaled.
- `wdth` narrows to **85–90** on long French headlines so they hold their line
  without shrinking. French runs ~20 % longer than English; this is how you
  absorb it without a smaller headline.
- `wght` 800 for hero, 600 for section titles, 500 for eyebrows.

Rules:
- Display face is **spent, not sprayed** — hero, section titles, prices, numerals.
  Everything else is Hanken.
- Hero: `clamp(2.75rem, 7.5vw, 6.5rem)`, `line-height: 0.95`, `letter-spacing: -0.03em`.
- Section titles: `clamp(1.9rem, 4vw, 3.25rem)`, `line-height: 1.05`.
- Body: 17–18 px, `line-height: 1.6`, measure **60–72 characters**.
- Eyebrows/labels: 12 px, `600`, `uppercase`, `letter-spacing: 0.08em`, muted.
- **Tabular figures on every price, tax line, distance and percentage**
  (`font-variant-numeric: tabular-nums`).
- French typographic detail is not optional: **narrow no-break space before
  `:` `?` `!` `%` `$`** (`&#8239;`), `«… »` for quotes, `1 234,56 $` for money —
  space as the thousands separator, comma as the decimal, dollar sign **after**
  with a space.

### Shape, depth, spacing

- Radii: `8 / 12 / 16 / 20 / 24`. **20 px is the card radius** (it is the app's
  de-facto card radius, used 52 times). Buttons and chips are `rounded-full`.
- Shadows — exactly two, plus the coloured lift:
  ```css
  --shadow-card:     0 4px 12px rgba(0,0,0,.06);
  --shadow-floating: 0 8px 20px rgba(0,0,0,.14);
  /* CTA only — tinted to the button's own fill, never grey: */
  --shadow-cta:      0 3px 9px rgba(124,52,23,.16);   /* terracotta-800 @ .16 */
  ```
  That `.16` is load-bearing. `.35` was the rejected value.
- Spacing on a 4 px rhythm. Section vertical padding `clamp(5rem, 12vh, 9rem)`.
  Container `max-width: 1200px`, gutters `20px / 32px / 48px` at `375 / 768 / 1280`.

---

## 5. Motion system — port the app's, do not invent one

The app has a house motion vocabulary. Reuse the exact numbers so the site feels
like the same hand made both. Use **Motion** (`motion` / framer-motion v12).

```ts
export const motionTokens = {
  // The house spring — every sheet, card and modal in the app uses this.
  spring:      { type: 'spring', damping: 20, stiffness: 190, mass: 0.9 },
  springSnap:  { type: 'spring', damping: 13, stiffness: 220, mass: 0.6 }, // small overshoot
  reveal:      { duration: 0.38, ease: [0.22, 1, 0.36, 1] },               // ease-out
  backdrop:    { duration: 0.18, ease: 'linear' },
  stagger:     0.055,   // 55 ms per item
  staggerCap:  0.33,    // never queue longer than 330 ms
  kenBurns:    { duration: 16, zoom: 0.14, driftPx: 18 },  // 16 s, ±18 px, alternating
  sonar:       { duration: 2.0, from: { opacity: .34, scale: .5 }, to: { opacity: 0, scale: 1 } },
};
```

**Laws:**

1. **Enter from below, 18 px, fade in.** `FadeInDown` is the app's only entrance.
   `y: 18 → 0`, `opacity: 0 → 1`, 380 ms, ease-out. That is the site's entrance too.
2. **Stagger is capped.** `min(index × 55ms, 330ms)`. Beyond that it reads as jank,
   not choreography.
3. **Animate `transform` and `opacity` only.** Never width, height, top, left.
   The one exception is the earnings-bar growth, which the app animates on height —
   if you replicate it, use `scaleY` with `transform-origin: bottom`.
4. **One or two animated elements per viewport.** Not five.
5. **Exit is 60–70 % of enter.**
6. **Everything is interruptible.** A scroll or a click cancels an in-flight
   animation immediately.
7. **`prefers-reduced-motion: reduce` disables the Ken Burns drift, the sonar
   pulse, the basket fill and every scroll-scrub.** Content appears at its
   resting state instantly. The app guards every single animation this way;
   the site must too.
8. **Scroll-triggered reveals fire once**, at `amount: 0.25`, and never re-fire on
   scroll-up. Nothing on this page should flicker when the user scrolls back.

**Scroll scrubbing** (`useScroll` + `useTransform`) is reserved for exactly three
moments: the basket filling, the courier moving along the route, and the receipt
totalling. Everywhere else, motion is a one-shot reveal.

---

## 6. Voice — French, Québec, specific

The app's onboarding copy is the register. Match it. Note how it names real
products and real boroughs; **a promise this specific is the one thing a generic
delivery app cannot copy.**

```
« Les épiceries d'ici, enfin réunies »
  Commerces africains et maghrébins de Montréal, Montréal-Nord, Laval et
  Longueuil, réunis dans une seule application.

« Ce qu'on ne trouve pas ailleurs »
  Ras el hanout, attiéké, bissap, agneau halal, fonio : les rayons de dix
  commerces, au complet.

« Commandez, suivez, recevez »
  De la préparation à votre porte, chaque étape de votre commande s'affiche
  en direct.

« Votre panier habituel, en deux gestes »
  Vos favoris et vos commandes passées restent à portée.
```

Rules: **tutoiement never — use *vous*.** Short sentences. No exclamation marks.
No "révolutionnaire", "incontournable", "l'expérience ultime", "en un clin d'œil".
Name things: say *attiéké*, not *authentic ingredients*. Say *Montréal-Nord*, not
*your neighbourhood*.

**Language. Decided: French only.** `lang="fr-CA"`, one route, no `/en`, no
`hreflang` alternates, and — importantly — **no language toggle in the nav.**
Shipping a toggle with one language in it is a dead control, which is worse than
not offering the choice.

Two consequences worth building in now, so a later English version is a copy job
rather than a refactor:
- Keep user-facing strings out of JSX, in a single `copy/` module — the app made
  the same call (`lib/copy/common.ts`: *"so future i18n extraction is a
  find-and-replace, not an archaeology dig"*).
- Do not hard-code `fr-CA` at call sites; put it behind one constant.

That costs nothing now and saves a rewrite if the client changes their mind.

---

## 7. Assets — everything you need is already in this repo

| Use | Path |
|---|---|
| Full logo + wordmark, transparent, 3746×2274 | `assets/images/brand/full-logo.png` |
| Basket mark alone, transparent, 1817×1610 | `assets/images/brand/mark.png` |
| Brand film, 8.2 s, silent, 608×1080 portrait | `assets/video/splashscreen.mp4` |
| Hero photography, 1400×2800, Pexels-licensed | `assets/images/onboarding/{market,spices,table,shopping}.jpg` |
| 78 product + 10 vendor photos, 900×900 | `assets/images/catalog/` |
| Attribution for every photo | `assets/images/CREDITS.md` |
| Logo source | `docs/logo.pdf` |

What the four hero photos actually show — use them for what they are:
- `market.jpg` — a shelf of glass jars, preserves, a brass scale. **Quiet, ordered, shop-interior.**
- `spices.jpg` — a spice souk: mounded chilli, saffron, indigo pigment in open bowls. **The loudest, most saturated image. Use it for "Ce qu'on ne trouve pas ailleurs."**
- `table.jpg` — a close, dark, shallow-focus bowl of couscous. **The Restaurant vertical.**
- `shopping.jpg` — crates of produce and a hand reaching over farm eggs. **Human, but no face. Use where a stock site would put a smiling model.**

Every raster ships as **AVIF with a WebP fallback**, `srcset` at 1×/2×, explicit
`width`/`height` or `aspect-ratio`. The brand film is re-encoded to **AV1 + H.264
MP4, muted, `playsinline`, `preload="metadata"`**, with a poster frame — and it is
**not** the hero background; see §8.

The Sougouba wordmark is a supplied asset. **Never re-set it in a font, never
recolour it, never redraw the leaf.** Clear space around it equals the height of
the lowercase *o*.

---

## 8. Page structure

Eleven sections. The basket fills across them.

### 00 · Sticky nav
Ivory, `backdrop-filter: blur(12px)` at 78 % opacity — the app's one real
glassmorphism recipe, used because content moves underneath. Wordmark left.
Links: *Comment ça marche · Commerces · Devenir partenaire · Livreurs*. Right:
theme toggle, and one terracotta capsule — **« Inscrire ma boutique »**, not a
download link. See §9: pre-launch, the merchant is the valuable conversion.
The **filling basket icon** sits beside the wordmark as the scroll indicator.
Nav height 72 px; the hero compensates with padding, never with overlap.

### 01 · Hero — the empty basket
Full-bleed but **not a video wall**. Split: type left, the basket right.

- Eyebrow: `CÔTE-DES-NEIGES · VILLERAY · PARC-EXTENSION · SAINT-LAURENT · MONTRÉAL-NORD · CHOMEDEY · VIEUX-LONGUEUIL` — 12 px, mustard-700, tracked, marquee-scrolled slowly (40 s, linear, paused on hover and under reduced motion). **Neighbourhoods, not cities** — "Parc-Extension" tells a Montrealer this is for them in a way "Montréal" never does.
- H1: **« Les épiceries d'ici, enfin réunies »** — Bricolage 800, `wdth: 88`,
  `clamp(2.75rem, 7.5vw, 6.5rem)`. Set it on **three lines**, and reveal it one
  line at a time: `y: 18 → 0`, 380 ms, 55 ms apart, with `overflow: hidden` on
  each line's wrapper so the words rise out of a mask.
- Sub: *Commerces africains et maghrébins, livrés chez vous. Commandez auprès du
  commerce, suivez la préparation, recevez à la maison.* — 18 px, 60-char measure.
- CTAs: terracotta capsule **« Être prévenu du lancement »** (the apps are not
  live — §9) + a ghost link **« Je suis commerçant »**. One terracotta element.
  That is the one.
- Trust line, small, muted, with Lucide glyphs: *Paiement sécurisé Stripe · Apple
  Pay et Google Pay · Suivi GPS en direct*.
- **The basket.** On the right: the basket mark, resting on the ivory ground with
  `--shadow-card`. It is empty. Around it, four produce items sit at low opacity
  and slight scale, waiting. On first paint they **drop in** — 4 items, house
  spring, 55 ms apart, arriving from `y: -24, scale: 0.9, opacity: 0`. Then the
  signal arc above it draws itself (SVG `stroke-dashoffset`, three arcs, 120 ms
  apart) and **pulses once every 4 s** in terracotta-500.
- Background: ivory. **No gradient. No blob. No blur.** One thing moves.
- Reduced motion: everything is already in place, arcs drawn, no pulse.

### 02 · The woven band (divider)
The triangle band, weaving itself in left to right. 24 ms per triangle, 400 ms cap.
It recurs between every major chapter. It is the only divider on the page.

### 03 · La preuve — the counter strip
Four figures, Bricolage 700 with tabular numerals, counting up **once** on enter
(1.1 s, ease-out, reduced-motion → final value immediately):

**10** commerces · **78** produits · **8** catégories · **2** verticales

Beneath, in muted 14 px: *Épicerie et Restaurant. Chaque commerce est vérifié et
approuvé manuellement avant sa mise en ligne.* That clause is true (CDC §02) and it
is worth more than any star rating.

Beside the figures, one badge — forest-100 fill, forest-700 ink, 8 px radius,
11 px bold uppercase, tracked 0.6 px, exactly the app's `Badge` spec:
**« Tous nos commerces sont certifiés halal »**. Every one of the ten is
(`isHalalCertified: true`). This is the strongest true differentiator in the
dataset and it currently appears nowhere in the marketing. Put it here.

### 04 · Les deux verticales
Two cards, `rounded-[20px]`, `--shadow-card`, side by side, stacking under 768 px.

- **Épicerie** — `shopping.jpg`, forest-tinted scrim, real shop names listed
  underneath (Marché Bamako, Épicerie Teranga, Souk El Medina…).
- **Restaurant** — `table.jpg`, terracotta-tinted scrim, *Entrées · Plats ·
  Desserts · Boissons*.

Scrim recipe, taken from the app's onboarding slide, four stops with `locations`:
`rgba(10,32,24,.42) 0% · rgba(10,32,24,.05) 30% · rgba(10,32,24,.88) 68% · #0A2018 100%`.

Each card's photo carries the **Ken Burns drift**: 16 s, `scale 1 → 1.14`,
`translateY ±18 px`, alternating direction per card, `ease-in-out`, infinite,
`repeatReverse`. Hover lifts the card 4 px on the house spring — no scale, no glow.

**Basket event:** a bunch of plantains drops in.

### 05 · Ce qu'on ne trouve pas ailleurs — the ingredient wall
The page's loudest moment, and the only place `spices.jpg` appears. Full-bleed
photograph, heavily scrimmed, with the ingredient names set **large, in Bricolage,
in ivory**, revealed one at a time as the section scrolls through:

*ras el hanout · attiéké · bissap · fonio · agneau halal · gari · jaxatu ·
chebakia · msemen · jollof*

Set them at `clamp(1.5rem, 3.5vw, 3rem)`, `wdth: 100`, in a loose wrapping flow —
not a grid, not chips. Each fades up 380 ms, 55 ms apart, capped. Some words get
mustard, most stay ivory; the ratio is roughly one in four.

Closing line, Hanken, 18 px, ivory-80 %: *Les rayons de dix commerces, au complet.*

**Basket event:** a spice bowl drops in.

### 06 · Comment ça marche — three steps
Three columns, Lucide glyphs in forest circles (`forest-100` fill, `forest-600`
stroke), numerals in Bricolage.

1. **Choisissez votre commerce** — *Épicerie ou restaurant, près de chez vous.*
2. **Payez en sécurité** — *Apple Pay, Google Pay ou carte. Traité par Stripe.*
3. **Suivez la livraison** — *Le livreur apparaît sur la carte, en direct.*

Reveal on scroll, 55 ms apart. Nothing loops here.

### 07 · Le suivi en direct — the map
**Rebuild the app's `DeliveryMap` as inline SVG.** This is the section that proves
the product is real, and it must be drawn from the actual mechanism, not
illustrated:

- A stylised Montréal street grid, forest-950 lines at low opacity on ivory.
- The route drawn in **three layers, exactly as the app does it**: a white casing
  underneath (because a 4 pt forest line vanishes over a dark park), the road
  **already driven** in `neutral-300`, the road **ahead** in `forest-600` at full
  weight. Both halves include the cut point so they meet exactly under the puck.
- A **44 px courier puck** in mustard, with the **sonar ring**: `opacity .34 → 0`,
  `scale .5 → 1`, 2 000 ms, linear, infinite, no reverse. The ring is on **only
  while the courier is moving** — the app is explicit that a pulse on a stationary
  courier claims movement that is not happening.
- **Scroll-scrubbed**: the puck's position along the path maps to the section's
  scroll progress. Scrub, do not autoplay. The user drives the delivery.
- A small floating card, glass over the map, counting down an ETA that derives
  from the same progress value — so the number and the marker can never disagree.

Copy: **« Vous savez exactement où en est votre commande »** / *De la préparation
à votre porte, chaque étape s'affiche en direct.*

**Basket event:** the courier puck drops in.

### 08 · Trois applications, une plateforme — the chapter that changes colour
This is where the page earns its ambition. The app gives each role its own
surface, deliberately: *"the customer app is daylight; the merchant app is the
other side of the counter."* Reproduce that by **transitioning the page background
across three sub-chapters** as they scroll:

| Chapter | Background | Accent | Content |
|---|---|---|---|
| **Pour vous** | ivory `#FAF9F7` → mint wash `#D6EBDF → #FDF8E9` | forest-600 | Shopper phone: home, product detail, cart, tracking |
| **Pour votre commerce** | forest slab `#17422E → #0A2018` | ivory `#F3EFE6`, mint `#AFD7C0` | Merchant phone: *le comptoir* — catalogue, commandes, ventes |
| **Pour les livreurs** | graphite `#292520 → #17140F` with a mustard corner glow | mustard-300 `#EDC957` | Courier phone: missions, navigation, gains |

Cross-fade the background over 600 ms as each sub-chapter crosses 50 % of the
viewport. Phones are **realistic device frames**, screenshots at 3× — take them
from the running app, never mock them up in CSS. Two or three per chapter,
overlapping, the centre one forward.

On the merchant chapter, note the contrast rule the app enforces: on the dark
slab, muted text is `forest-200 #AFD7C0`; on the courier slab it is
`neutral-300 #C9C3B8` (neutral-400 fails AA against the mustard glow).

### 09 · Devenir partenaire — the merchant pitch
Dark forest slab, `border-radius: 30px` on the bottom corners only — the app's
merchant header shape.

Left: **« Vendez à tout le Grand Montréal »** + *Catalogue, commandes, ventes et
versements, dans un seul tableau de bord. Vous êtes payé automatiquement par
Stripe Connect.*

Right: the terms, stated plainly, because hiding them costs more trust than
showing them:

> **12 %** de commission sur chaque vente
> **70 $** par mois d'abonnement
> Les deux s'appliquent ensemble.
> Versements automatiques · Tableau de bord commandes et ventes · Inscription
> validée manuellement par un administrateur avant la mise en ligne

**Do not state a turnaround time for merchants** — none exists in the source. (The
*courier* flow does state one: *« La validation prend généralement un jour
ouvrable. »* That string is real and may be used, on the courier section only.)

The three steps, in the app's own words (`lib/merchantOnboarding.ts`) — use these
verbatim rather than writing new ones:

1. **Votre commerce** — *Le nom de votre boutique, sa catégorie — épicerie ou
   restaurant — et sa spécialité.*
2. **Adresse et livraison** — *Où vous êtes et le délai que vous annoncez à vos
   clients. Les frais de livraison sont fixés par Sougouba selon la distance.*
3. **Documents et validation** — *Votre numéro d'entreprise, la personne
   responsable, et le permis MAPAQ pour un restaurant. Un administrateur valide
   avant la mise en ligne.*

CTA: **« Inscrire ma boutique »**. Note: registration happens **in the app**, not
on a separate admin site — the client changed this after the CDC. The button opens
the app-download flow or an email capture; it does not link to a portal that does
not exist.

### 09b · Devenir livreur
Graphite ground `#292520 → #17140F` with the mustard corner glow (`mustard-400` at
low alpha, falling off from the top-right — the app's `CourierSlab` recipe). Ink is
`#F6F2E9`; muted text is `neutral-300 #C9C3B8`, **not** neutral-400 — that fails AA
against the glow, and the app already fixed it once.

**« Livrez pour les commerces de votre quartier »**

The pay, stated as plainly as the merchant terms:

> **3,50 $** de prise en charge par course
> **+ 0,90 $** par kilomètre jusqu'au client
> **+ 100 % des pourboires** — Sougouba ne prélève rien dessus
> Vélo, moto ou voiture · Vous choisissez quand vous êtes en ligne
> *La validation prend généralement un jour ouvrable.*

Three steps, from `lib/courierOnboarding.ts`, verbatim: **Vous et votre véhicule** ·
**Vos documents** · **Validation manuelle**.

Rates are placeholders in the source — the build log flags that courier pay can
out-earn the delivery fee on long runs. **Confirm the numbers before publishing
them**, or show the structure without the figures.

CTA: a mustard capsule (dark ink, never white — mustard fails contrast with white)
**« Devenir livreur »**. This is the one place terracotta is not the CTA colour,
because terracotta on graphite reads as a warning. The one-terracotta-per-viewport
rule holds: there is none in this section.

### 10 · La note, ligne par ligne — the honest receipt
Nobody puts a tax breakdown on a landing page. In Québec, doing it is a trust
signal — and Sougouba's rule (taxes on products only, never on delivery) is
genuinely better than the norm.

An animated order summary, **scroll-scrubbed**, on a white card, tabular figures,
each line ticking in 380 ms apart:

Build it from a **real basket of seeded products at their real prices** — not a
round number. This one is arithmetically checked against `data/taxes.ts` and
`data/deliveryPricing.ts`:

```
Ras el hanout · Épicerie Atlas                     5,50 $
Banane plantain · Marché Bamako                    3,25 $
Jus de bissap · Épicerie Teranga                   4,25 $
Merguez maison · Boucherie du Sahel               11,99 $
Fonio précuit · Marché Bamako                      9,49 $
─────────────────────────────────────────────────────────
Sous-total (produits)                             34,48 $
Taxe fédérale (TPS 5 %)                            1,72 $
Taxe provinciale (TVQ 9,975 %)                     3,44 $
Livraison (3,4 km)                                 3,99 $
─────────────────────────────────────────────────────────
Total                                             43,63 $
```

(The cart is single-vendor in the app, so if you show shop names beside the lines,
use one shop for all five. The arithmetic is the point, not the sourcing.)

A footnote, muted 13 px: *Les taxes s'appliquent aux produits seulement, jamais
aux frais de livraison. Les frais de livraison dépendent de la distance : 2,99 $
jusqu'à 2 km, 8,99 $ au-delà de 12 km.*

The **Total** counts up on the house spring while the lines above hold. That single
number is the only mustard on the section.

### 11 · Le panier plein — final CTA
The film's last frame. The basket, **full**, signal arc firing. Behind it, a soft
mint wash (`forest-100 → mustard-50`, the app's own home-header gradient, at
`start {0,0} end {1,1}` with a 34 px bottom radius).

**« Le grand marché, dans votre poche »**

The **inert *« Bientôt »* capsules** side by side (§9) — muted ground, hairline
border, dark ink. Beneath them the real action: *Soyez prévenu dès l'ouverture* +
a single email field, floating label, 58 px tall, animated focus ring
interpolating `border` → `primary` (the app's `Input`, ported), with inline
validation on blur and a genuine success state that replaces the field.

### 12 · Footer
Four columns: Sougouba (à propos, commerces, blogue) · Commerçants (devenir
partenaire, tableau de bord, tarifs) · Livreurs (devenir livreur, gains) ·
Soutien (soutien@sougouba.ca, FAQ, confidentialité, conditions).

Bottom bar: wordmark, `© 2026 Sougouba`, and — quietly — *Conçu et développé par
Progix Inc., Montréal.* Photo credits link to `CREDITS.md` content: **required**,
the Pexels attribution must be surfaced before public release.

---

## 9. Conversion — the pre-launch reality

**Decided: the apps are not live.** There is an App Store Connect record
(`ascAppId 6799634702`), but nothing is published. That single fact changes what
this page is for, and the change is not cosmetic.

### The page cannot ask for a download

- Store badges become **non-interactive capsules** — muted ground, `border`
  hairline, dark ink, a small Lucide `Apple` / `Play` glyph:
  **« Bientôt sur l'App Store »** · **« Bientôt sur Google Play »**.
  They are not buttons. They do not have hover states. They never link anywhere.
- **No QR code.** A QR that resolves to nothing is worse than no QR.
- The hero's primary CTA is **not** *« Télécharger l'app »*. Use
  **« Être prévenu du lancement »**, opening the email capture.

### Read this before building the CTA hierarchy

A marketplace with no supply is not a product. Before launch, a shopper who joins
a waitlist is worth very little; **a grocer who signs up is worth a great deal**,
because ten more shops is the thing that makes the app worth downloading at all.
The same is true of couriers — the contract's dispatch model needs bodies in
Montréal-Nord and Chomedey before it needs shoppers there.

So the page's honest hierarchy right now is **supply first**:

1. **Commerçants** — the highest-value conversion on the page. §09 is not a
   secondary section; it deserves the same weight as the hero.
2. **Livreurs** — §09b, second.
3. **Shoppers** — the waitlist. Real, but it is a promise to keep, not a sale.

Reflect this concretely: the sticky nav's second action is
**« Inscrire ma boutique »**, not a download link. §09 gets full-viewport
treatment rather than a half-height band. The shopper waitlist stays in the hero
and the final CTA, where it belongs, and does not fight the merchant CTA for the
terracotta.

**This is a recommendation, not a decision.** If the client wants consumer
waitlist volume as the headline metric — for investor optics, or because supply is
already secured off-platform — say so and the hierarchy flips back. But it should
be a choice someone made, not the default that fell out of copying a launched
app's landing page.

### The email capture is now the most important element on the page

It carries every shopper conversion the site will make. Build it properly:

- Floating label, 58 px tall, animated focus ring interpolating `border` →
  `primary` — the app's `Input`, ported.
- **A real destination.** Decide the list service in Phase 0. An input that posts
  nowhere is the single worst thing this page could ship.
- Inline validation **on blur, not on keystroke**. Error below the field, stating
  cause and fix.
- A genuine success state — not a toast that vanishes. The field is replaced by a
  confirmation that says what happens next and when.
- `type="email"`, `autocomplete="email"`, `aria-live` on the error region.
- One field. No name, no city, no "how did you hear about us".

**Two placements only:** the hero and §11. Not a modal, not an exit-intent popup,
not a slide-in after 30 seconds.

### Sticky mobile CTA

Below 768 px, a bottom bar appears once the hero leaves the viewport — one
terracotta capsule, safe-area padded (`env(safe-area-inset-bottom)`), 56 px tall,
dismissible, and it carries the **merchant** action per the hierarchy above.

---

## 10. Build

**Stack:** Next.js 15 (App Router, TypeScript, `output: 'export'` if static) ·
Tailwind CSS · **Motion** (`motion`, v12) · `lucide-react` · `next/image` ·
`next/font` for the two Google faces.

**Location:** the repo has no web scaffold and no workspaces. Create `web/` as a
sibling of `app/`, with its own `package.json`. **Do not** convert the Expo app to a
monorepo to accommodate the site.

**Share the palette, not the code.** `tailwind.tokens.js` at the repo root is
already plain CJS. `require('../tailwind.tokens.js')` from `web/tailwind.config.ts`
so the two surfaces cannot drift. Nothing else crosses the boundary.

**Budgets (enforce, don't aspire):**
- LCP < 2.0 s on a 4G throttle · CLS < 0.05 · INP < 200 ms
- Lighthouse ≥ 95 across all four categories
- Initial JS < 120 KB gzipped. Motion is code-split per section; nothing below the
  fold ships JS above the fold.
- Every image `loading="lazy"` except the hero's.

**Accessibility — this is a checklist, run it:**
- Contrast ≥ 4.5:1 body, ≥ 3:1 large text and UI glyphs, **verified in both
  themes** (the app has `verify:contrast` for exactly this reason).
- Visible focus rings, 2 px, `--ring`, never removed.
- Sequential headings, one `h1`.
- `alt` text on every meaningful image, in French.
- Full keyboard operation; skip-to-content link.
- All motion gated behind `prefers-reduced-motion`.
- Touch targets ≥ 44 px, ≥ 8 px apart.
- Test at **375 px**, 768 px, 1024 px, 1440 px, and in landscape.

**SEO:** `lang="fr-CA"`; title *Sougouba — Les épiceries africaines et maghrébines
du Grand Montréal*; OG image drawn from the basket mark on the mint wash;
`SoftwareApplication` + `LocalBusiness` JSON-LD; **no `hreflang`** (single
language); sitemap; canonical. On `SoftwareApplication`, do **not** emit
`aggregateRating` or `downloadUrl` — there is no rating and nothing to download.

---

## 11. Definition of done

- [ ] The basket fills across the page and is full at the final CTA.
- [ ] The woven triangle band is the only divider used.
- [ ] Exactly one terracotta element is visible in any viewport.
- [ ] No element carries more than one depth cue.
- [ ] Bricolage renders with live `opsz` and `wdth` axes — inspect and confirm.
- [ ] Every number on the page traces to §1. No invented metric survives.
- [ ] No testimonial, star rating, or download count appears anywhere.
- [ ] All copy is final fr-CA, *vous*, with correct narrow no-break spaces.
- [ ] Store badges are inert *« Bientôt »* capsules — not buttons, no hover, no href.
- [ ] The email capture posts to a real list and has a real success state.
- [ ] No language toggle exists anywhere in the UI.
- [ ] Screenshot the page at five random scroll positions: each looks finished.
- [ ] Turn off JavaScript: the page reads completely.
- [ ] Turn on `prefers-reduced-motion`: nothing moves, nothing is missing.
- [ ] Dark mode reviewed independently, not inferred from light.
- [ ] Photo attribution is surfaced.
- [ ] Lighthouse ≥ 95 × 4.

---

## 12. Open questions — do not invent answers

1. **The Bambara gloss** — "Sougouba = the big market" is recorded in the repo.
   Have Salif Eric Sogodogo confirm the wording before it goes on a public page.
2. **Is `sougouba.ca` the domain?** `soutien@sougouba.ca` implies it; confirm.
   Needed for canonical URLs and OG tags.
3. **Which service receives the waitlist emails?** This is now the site's only
   shopper conversion — it cannot post nowhere. Decide in Phase 0.
4. **Supply-first or waitlist-first?** §9 recommends giving the merchant CTA the
   weight the download CTA would have had. Confirm, or say the client wants
   consumer waitlist volume as the headline metric instead.
5. **Merchant approval turnaround** — no figure exists in the source. Get one or
   the page stays silent on it.
6. **Delivery tiers and courier pay rates** are both marked *"confirm with the
   client"* in the source, and the two are known to be inconsistent on long runs.
   Show them as examples, clearly labelled, or not at all.
7. **Halal certification** — the seed marks all ten shops halal. Is that a
   platform requirement or a coincidence of the sample? It changes whether the
   badge in §03 is a promise or a snapshot.
8. **Launch date** — is there one to name on the page, or does the waitlist stay
   open-ended? *« Bientôt »* with no date is honest; a date that slips is not.
9. **Legal pages** — privacy policy and terms must exist before launch; the
   footer cannot link to nothing.
