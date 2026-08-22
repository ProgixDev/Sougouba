# Sougouba — Build Progress & Handoff

Read this first in a fresh session. It captures everything decided and built so far, so you don't need the original (500k-token) conversation history. The original architecture plan is also saved at `/Users/snow/.claude/plans/users-snow-projects-sougouba-devis-cont-jiggly-pony.md` if you want the original phase-by-phase rationale — this doc supersedes it with actual implementation status.

## What this project is

100%-frontend React Native (Expo) mobile app prototype for **Sougouba**, a Quebec marketplace connecting consumers to African/Maghreb grocery shops (like Uber Eats, but for African/Maghreb specialty groceries). No backend, no real auth, no real payments — fully seeded/mock data, built to look and feel like a finished premium app. Two separate experiences (Customer / Business Owner) gated behind a one-time role choice at signup. Full context/contract: `docs/Devis contractuel · Progix — Sougouba.pdf` (the commercial contract covers a much bigger system — web platform, dashboards, real backend — none of that is in scope here, this is just the RN mobile app slice).

Brand: forest green / terracotta / mustard gold, derived from `docs/logo.pdf` (a woven basket of groceries). French-only UI (Quebec market).

## ✅ Phase 1 verified live (2026-08-09)

The port collision is resolved and the **full pre-auth flow has been walked end-to-end on the iPhone 17 Pro simulator**. Verified in order: cold boot → animated splash → 4-slide onboarding → auth landing → sign up (new email) → role choice → correct tab shell → kill & relaunch (lands straight back, no onboarding/auth) → sign out (lands on auth landing) → sign in with the same account (skips role-select, restores the role).

Both role branches were exercised (customer and business). Doing this uncovered **five real bugs that made the app unusable**; all are fixed — see "Phase 1 bug fixes" below.

### Driving the simulator without a human

There is no `xcrun simctl` command for taps, and `idb`/`cliclick` aren't installed. The working harness now lives in the repo — `scripts/tap.sh <deviceX> <deviceY> [shotName] [settleSeconds]`, backed by `scripts/geom.js` (raise the window, report the device screen's rect) and `scripts/click.js` (post the CGEvent). Its three non-obvious requirements, in case it needs rebuilding:

1. Post real `CGEvent`s via JXA (`osascript -l JavaScript`, `ObjC.import('CoreGraphics')`). `System Events`' `click at {x, y}` does **not** reach the Simulator.
2. Set `kCGMouseEventClickState = 1` (field id `1`) on the mouse-down/up events. Without it the click is silently ignored — this is the single easiest thing to get wrong.
3. `activate` the Simulator **and** `AXRaise` the window, then throw away one warm-up click — macOS swallows the first click into a non-key window. ⚠️ **Where that warm-up click lands has destroyed the device window twice**: the title bar's *left* end is the traffic lights, and *below the device screen* can fall outside the window onto the Dock depending where the window sits. `tap.sh` now uses the title bar's horizontal **centre**, which is inside the window and hits no control. Recovery (`xcrun simctl shutdown all`, quit Simulator, `xcrun simctl boot <udid>`, `open -a Simulator`) worked once and failed once — see Phase 5.

Coordinate mapping: the device screen is the window's `AXGroup` child (read its `position`/`size` — the Simulator applies its own zoom, so don't assume 1:1). Screenshot pixels ÷ 3 = device points; the iPhone 17 Pro is **402 × 874 pt** (1206 × 2622 px). With more than one device booted there is more than one Simulator window, so match on the window name rather than taking `windows[0]`. Also: `keystroke` with a multi-character string silently truncates at spaces and `@`, so type one character at a time. `screencapture -R` is unavailable (no Screen Recording permission) — use `xcrun simctl io <udid> screenshot`.

Two iOS system dialogs interrupt the flow and must be dismissed ("Not Now"): the **Save Password?** prompt fires after each sign-up and sign-in.

## Phase 1 bug fixes (read before touching routing or session state)

The routing worked in a type-check and a bundle export but was broken at runtime. What was wrong, and the rule each fix encodes:

1. **Sign-up bricked the app.** `app/(auth)/_layout.tsx` redirected to `/(auth)/role-select` *instead of* rendering its `<Stack>` — a redirect into the very stack the guard was refusing to mount, so nothing ever rendered and the redirect re-fired every render. Worse, the state persisted, so the app stayed bricked across relaunches. **Fix:** `role-select` moved out of the group to a top-level `app/role-select.tsx` with its own inline preconditions. **Rule: a layout guard must never redirect to a route inside itself.**

2. **Four routes all resolved to `/`** (`app/index.tsx` plus an `index.tsx` in each of the three groups). Expo Router disambiguates a bare `/` using the segments you are *currently* on, so `<Redirect href="/" />` from inside `(customer)` resolved back into `(customer)` and looped. **Fix:** group indexes renamed to named leaves — `(auth)/welcome`, `(customer)/(tabs)/home`, `(business)/(tabs)/dashboard` — with `export const unstable_settings = { anchor: '...' }` in each layout to keep the right initial route. `app/index.tsx` is now the only `/`. All hrefs come from **`lib/routes.ts`** — add new routes there, don't scatter string literals.

3. **Sign-out looped** for the same reason (`signOut(); router.replace('/')` from a tab screen). **Fix:** the four sign-out handlers just call `signOut()` — the group guard does the navigating. **Rule: mutate session state and let the guard redirect; don't do both.**

4. **`isAuthenticated` / `hasSelectedRole` could drift from `user.role`** (e.g. `selectRole` set `hasSelectedRole: true` even when `user` was null, producing a state no screen could satisfy). **Fix:** `store/useSessionStore.ts` now holds only `user`; everything else is derived (`selectIsAuthenticated`, `selectRole`). Persist is at `version: 2` with a `migrate` that strips the old booleans (Phase 5 dropped `hasCompletedOnboarding` too). `signOut()` also clears the cart and favorites, which previously leaked into the next account.

5. **The mock backend forgot accounts on restart.** `data/api/auth.ts` kept users in memory only, so an account created during a demo hit "Aucun compte ne correspond à cette adresse courriel." after a relaunch. **Fix:** the mock account table persists itself to AsyncStorage (`sougouba-mock-accounts`), seeds first with the persisted layer applied on top; `mockSelectRole` is now actually called (from `role-select`) so a chosen role survives sign-out. This was the "role permanence for new mock signups" risk called out in the original plan.

Also fixed along the way: sign-up's OAuth path called `signUp` (re-gating a returning user) instead of `signIn`; neither OAuth handler had a `catch`, so a failure was an unhandled rejection with no user-visible error; forms had no RHF `defaultValues` (uncontrolled→controlled flip on first keystroke); `BackHeader` called bare `router.back()` with no `canGoBack()` fallback; the hydration gate watched only the session store and had no failure path (a corrupted store or a font error hung the app on the native splash forever — now all four persisted stores are gated with a 3s timeout, and a font error renders with system fallbacks); the business tab label "Tableau de bord" overflowed to "Tableau de…" and is now "Aperçu".

`lib/devLogs.ts` (imported first in `app/_layout.tsx`) silences two dependency warnings whose LogBox toast physically covers the primary CTA. Keep that list short and specific — anything from our own code belongs fixed, not silenced.

## Tech stack (installed & working)

- Expo SDK 57 (TypeScript), React Native 0.86, **New Architecture on** (required by Reanimated 4)
- Expo Router (file-based routing, route groups)
- NativeWind v4 (Tailwind), CSS-variable-driven light/dark theming (see Theming below)
- Zustand + `persist` (AsyncStorage) for session/theme/cart/favorites
- React Native Reanimated 4 + `react-native-worklets` (separate peer dep, required for Reanimated 4) + Moti
- `expo-blur`, `expo-linear-gradient`, `react-native-svg`, `lucide-react-native` (icons), `expo-image`
- `react-hook-form` + `zod` for forms
- `patch-package` — **one active patch**: `patches/expo-modules-jsi+57.0.4.patch` fixes an upstream Swift compiler error in `expo-modules-jsi` (Xcode 26.3 / Swift strictness issue with `abs()` overload resolution). Runs automatically via `postinstall`. Don't remove without re-testing the native build.

Run `npm install` after cloning fresh (postinstall applies the patch automatically). Native iOS build: `npx expo run:ios --device "iPhone 17 Pro"` (or whatever simulator is available — check `xcrun simctl list devices`).

## Design system decisions (confirmed with user, do not re-litigate lightly)

- **Colors**: brand-true palette from the logo — deep forest green (primary), terracotta/rust (secondary/CTA), mustard gold (accent), warm ivory background. Full ramps in `theme/tokens.ts` (also mirrored in plain-JS `tailwind.tokens.js` since `tailwind.config.js` can't import TS directly).
- **Theme**: light default + manual dark toggle. Dark mode is a proper *tonal* derivation (forest-tinted near-black, not inverted) — see `theme/colors.ts` (`lightColors`/`darkColors`) and the CSS variables in `global.css` (`:root` / `.dark:root` blocks — NativeWind v4's documented pattern). Toggle via `store/useThemeStore.ts` + `hooks/useColorScheme.ts` (`useSyncColorScheme()` mounted once in `app/_layout.tsx`, calls NativeWind's `colorScheme.set()`).
- **Typography**: **Bricolage Grotesque** (display — headings, hero moments only) + **Hanken Grotesk** (body/UI — everything else). This replaced an initial DM Sans-only pass that the user rejected as "too simple." Font-family → weight mapping lives in `components/ui/Text.tsx` (`variant` picks the family+default weight; `weight` prop can override within that family). Tailwind tokens in `tailwind.config.js` under `fontFamily`.
- **Buttons** (`components/ui/Button.tsx`): capsule shape (`rounded-full`), flat confident fills (no gradient except the CTA variant which is now also flat solid terracotta-600 after a redesign — see below), soft *colored* shadow tinted to the button's own fill (not generic gray), a subtle press-darken overlay (~10-12% black) for tactile feedback instead of a gloss/shine overlay.
  - **Important correction**: the *first* CTA design (diagonal gradient + glossy white top-highlight + strong 0.35-opacity colored shadow) was explicitly rejected as **"so ugly."** Fixed by going flatter, not richer: solid fill, no gloss, much softer shadow (0.16 opacity / 9px radius / 3px offset). **Lesson for any future button/card work: prefer ONE subtle depth cue, not stacked gradient+gloss+glow.**
- **Inputs** (`components/ui/Input.tsx`): animated floating label (Reanimated), optional leading icon, rounded-2xl card surface, animated colored focus glow/border. Note: the component explicitly discards any `placeholder` prop passed to it (destructured as `_placeholder` and dropped) — passing one used to visually collide with the floating label; don't reintroduce that.
- **Category badges** (`components/customer/CategoryCircle.tsx` + `CategoryRow.tsx`): circular badges on a soft pastel **gradient** background band (`expo-linear-gradient`, sweeps through forest-50/mustard-50/terracotta-50). Selected state = **white ring** (not colored) + soft colored glow shadow, on every category regardless of its own color. Icons are **real Unicode emoji** (🍎🌶️🍖🥤🍲🥛🌾🥐, mapped in `lib/categoryEmoji.ts`), rendered via a **plain `RNText` from `react-native`**, not the themed `<Text>` wrapper — the themed wrapper forces Hanken/Bricolage font-family which has no emoji glyphs and blocks the OS's fallback to Apple's color emoji font (renders as "tofu" □ boxes otherwise). This was extensively verified: confirmed via isolated zero-styling tests and a full simulator erase+reinstall that it's a **Simulator-only font rendering bug** on this particular iOS 26.3 runtime, not a code defect — should render correctly on a real device. If you see tofu boxes again, don't re-debug the code; verify on a different simulator runtime or a real device first.
- **Badges** (`components/ui/Badge.tsx`): **resolved.** The user confirmed all three of colour, shape and typography were wrong. Rebuilt: light tint + *deep* same-ramp text (was 10–20% opacity with a mid-tone that barely showed), 8px radius instead of a full pill, and 11px bold uppercase with letter-spacing instead of 14px medium sentence case. Added a `solid` variant for badges sitting over photography and a `sm` size for card corners. Six tones (`neutral | primary | success | warning | secondary | destructive`), all dark-mode aware. Visible on the styleguide route.
- **Icons**: `lucide-react-native` v1.x, cross-platform thin-stroke, SF-Symbols-style. Note this version renamed some icons vs. what you might expect from memory: `Home` → `House`, `BarChart3` → `ChartColumn`. Always grep `node_modules/lucide-react-native/dist/esm/icons/` for the kebab-case file name before assuming an icon name compiles.
- **App icon / splash**: generated from `docs/logo.pdf` via a cropped, hand-composed basket mark (no wordmark) on a solid forest-700 background — see `assets/icon.png`, `assets/android-icon-*.png`, `assets/splash-icon.png` (full logo+wordmark, for the splash only). Also a clean transparent mark + full logo saved at `assets/images/brand/mark.png` and `assets/images/brand/full-logo.png` for reuse in-app (used on the auth landing screen and the real splash slot).

## Mock data layer

- `data/types.ts` — all types (`Category`, `Vendor`, `Product`, `Order`, `User`, `Cart`, etc.)
- `data/seed/` — categories (8), **vendors (10)**, **products (78)**, users (1 customer + 10 business owners, one per vendor), orders (5, varied statuses — still to be expanded for the Phase 3 dashboard). Vendors span Montréal / Montréal-Nord / Laval / Longueuil and cover West African, Maghrebi and East African groceries, butchers, a bakery and a prepared-food kitchen. Nine products carry a `compareAtPriceCad` so discount treatments have something to show; a couple are `isAvailable: false` so out-of-stock states are reachable.
- Seed integrity is checkable in one command — it caught two real inconsistencies while expanding:
  ```bash
  node -e "…"   # see the invariant checks used in the Phase 2 commit:
  # every product's vendorId resolves, every vendor has products,
  # every categoryId is one of the 8, and each vendor's categoryIds
  # is a superset of the categories it actually sells (getVendorsByCategory
  # filters on that field, so a mismatch silently hides a shop from browse).
  ```
- `data/api/` — async wrapper functions (`categoriesApi`, `vendorsApi`, `productsApi`, `ordersApi`, `authApi`) that `await delay()` to simulate network latency, so screens already code against real loading states. Mutable in-memory stores inside `products.ts`/`orders.ts`/`auth.ts` so runtime CRUD (business catalog edits, new orders, new signups) persists for the session.
## Images — done, 88 photos bundled

Every product (78) and vendor (10) now ships a real photo under `assets/images/catalog/<id>.jpg`,
wired through `data/images.generated.ts`. ~11 MB of assets; the exported iOS bundle is ~21 MB total.

**All 88 are Pexels-licensed** — free for commercial use, no attribution required, no share-alike.
One image initially came from Wikimedia under CC BY-SA; it was deliberately replaced, because
share-alike is viral and awkward in a commercial deliverable. `assets/images/CREDITS.md` records
photographer and source for every asset anyway.

Fetch with `scripts/fetch-product-images.mjs`:

```bash
PEXELS_API_KEY=… node scripts/fetch-product-images.mjs          # fetch anything missing
node scripts/fetch-product-images.mjs --report --diagnose        # score without downloading
node scripts/fetch-product-images.mjs --only=prd_gari --force    # redo one
```

The key is read from the environment and never written to disk. Without it the script still runs,
falling back to the keyless providers.

### How it picks, and why it is not simply "take the first result"

Three providers, scored: **Pexels** (professional food photography), **Openverse** (`rawpixel` CC0
stock, then flickr/wikimedia — keyless but noisy) and **Wikimedia Commons**. Unsplash is not used:
its search sits behind a proof-of-work bot challenge. Pexels' and Pixabay's public web endpoints
are behind bot walls too, which is why the keyless path goes through Openverse's official API.

Four things were needed to get usable results, each found by looking at what actually came back:

1. **Taking Pexels' top hit blindly is wrong.** With `orientation=square&size=medium` the candidate
   pool shrank so far that "ripe mango fruit" returned a Vietnamese street scene and "fresh okra
   pods" a lotus seed pod. Those filters are gone; the square crop is applied by URL instead.
2. **Scoring purely on title is also wrong.** Commons' long taxonomic filenames match more query
   tokens than Pexels' short captions, so okra was awarded to a photo of *Proboscidea parviflora*.
   Pexels now wins as soon as it clears the bar — its photography is categorically better, and the
   score gap was a scoring artefact, not a better picture.
3. **The noise filter matched substrings.** `'man'` fired on *"mangoes"*, `'cat'` on *"delicate"*,
   `'sign'` on *"design"* — burying good candidates. Single terms are whole-word matched now.
4. **No stemming meant `mango` missed `mangoes`** and `pod` missed `pods`.

Also: candidates are scored against the Pexels **URL slug as well as the caption** (the slug is more
literal), and picked photos are deduped across the whole catalogue — the first full run gave
baghrir and msemen the same image and handed the Saveurs de Dakar storefront the same plate as the
jollof product. `usedPhotos` is seeded from `CREDITS.md` so re-runs respect earlier picks.

⚠️ Openverse anonymous limits are **20/min and 200/day**. Every HTTP response is cached under
`.image-cache/` (gitignored), so re-running after a tuning change costs zero requests. Delete that
directory to force a refetch.

Product names are French loanwords stock libraries do not index ("bissap", "jaxatu", "attiéké"), so
each entity has a hand-written English query in `QUERY`. Where the regional name *is* indexed it is
used — Pexels really does have chebakia, jollof and puff-puff. **If a photo looks wrong, fix its
query there and re-run with `--only=<id> --force`.**

## State (Zustand + persist, AsyncStorage)

- `store/useSessionStore.ts` — `user`, `isAuthenticated`, `hasCompletedOnboarding`, `hasSelectedRole` + `signIn`/`signUp`/`selectRole`/`signOut`/`completeOnboarding`. Role selection is **one-way** — no UI anywhere lets a user change it later, matches the confirmed design decision.
- `store/useThemeStore.ts` — light/dark preference.
- `store/useCartStore.ts` — single-vendor-cart enforcement built in (`pendingItem` + `resolveVendorSwitch` for the "clear cart to switch shops?" confirmation flow) — the confirmation **dialog UI itself isn't built yet**, only the store logic. Needed in Phase 2 when Product Detail's "Add to Cart" is wired up.
- `store/useFavoritesStore.ts` — product/vendor favorite toggles.

## Route map (what's built)

```
app/
  _layout.tsx          — root: loads Bricolage+Hanken fonts, waits for session-store hydration,
                          hides native splash, mounts GestureHandlerRootView + SafeAreaProvider + Stack
  index.tsx             — the brand film (expo-video, assets/video/splashscreen.mp4) + the one-time
                          redirect decision, taken on the video's `playToEnd`. No user → /onboarding
                          (Phase 5: signed out always lands on the pitch); user without a role →
                          /role-select; full session → that role's home.
  onboarding.tsx         — 4-slide swipeable pager (react-native-pager-view), each slide FULL-BLEED
                          catalogue photography with a Ken Burns drift and a scrim
                          (components/onboarding/OnboardingSlide.tsx) + stretching dot indicator.
                          The old SVG-illustration component was deleted in Phase 5.
  role-select.tsx        — the one-time Customer/Business Owner choice. TOP-LEVEL on purpose (see
                          bug 1 above). Guards itself: no user → /onboarding, role already set →
                          that role's home. Writes through to authApi.mockSelectRole.
  _dev/styleguide.tsx    — the Phase-0 design-system showcase screen, moved out of the real flow.
                          Not linked from anywhere in the app; open manually via router if needed.

  (auth)/                 — anchor: 'welcome'
    _layout.tsx          — guard: role set → that role's home; user but no role → /role-select;
                            otherwise render the Stack. Reached FROM onboarding's last slide.
    welcome.tsx           — landing ("Bienvenue sur Sougouba" + logo + Créer un compte / Se connecter)
    sign-in.tsx            — react-hook-form + zod, mock email/password + Google/Apple mock buttons
    sign-up.tsx            — same pattern, + fullName field
    forgot-password.tsx    — email → fake "check your email" success state

  (customer)/
    _layout.tsx           — guard: no user → /onboarding; wrong role → that role's home or
                            /role-select. Never redirects to "/". Also mounts useDemoSeed().
    (tabs)/_layout.tsx     — Tabs: Accueil, Recherche, Panier, Profil  (anchor: 'home')
    (tabs)/home.tsx         — placeholder "Bienvenue, {name}" + logout (Phase 2 replaces with real Home)
    (tabs)/search.tsx       — ComingSoon placeholder
    (tabs)/cart.tsx         — ComingSoon placeholder
    (tabs)/profile.tsx      — real name/email + logout (will grow in Phase 2)

  (business)/
    _layout.tsx           — guard: mirror of the customer one
    (tabs)/_layout.tsx     — Tabs: Aperçu, Catalogue, Commandes, Analytique, Boutique
                              (anchor: 'dashboard')
    (tabs)/dashboard.tsx    — placeholder "Bienvenue, {name}" + logout
    (tabs)/catalog.tsx      — ComingSoon placeholder
    (tabs)/orders.tsx       — ComingSoon placeholder
    (tabs)/analytics.tsx    — ComingSoon placeholder
    (tabs)/profile.tsx      — fetches & shows the linked Vendor name + logout
```

`npx tsc --noEmit` and `npx expo export --platform ios` both pass cleanly, **and** the whole flow has now been walked live on the simulator (see top of this doc).

## Components built (`components/ui/`, all exported from `components/ui/index.ts`)

`Text`, `Button`, `Card`, `GlassSurface`, `Input`, `Chip`, `Avatar`, `Badge` (disliked, open item), `Skeleton`/`SkeletonCircle`/`SkeletonCard`, `EmptyState`, `StatPill`, `BackHeader` (back-chevron header, theme-aware), `ComingSoon` (wraps EmptyState, used for placeholder tabs).

`components/customer/`: `CategoryCircle`, `CategoryRow` (exported from `components/customer/index.ts`).

`components/onboarding/illustrations/OnboardingIllustration.tsx`: the reusable onboarding art component.

## Livreur (courier) — the third role

Added after the CDC addendum flagged livreurs as a party to disputes (§04). The
role is `courier` in code, "Livreur" in every string.

**Route group** `app/(courier)/`, anchor `missions`, four tabs — Missions
(`Navigation`), Courses (`History`), Gains (`Wallet`), Profil (`User`). Four not
five: the home screen is a full-bleed map and a fifth label starts eating the
only screen that matters while someone is driving. Stack screens: `signup`,
`delivery/[id]`, `proof/[id]`, `report/[id]`.

**`UserRole` is now three-way.** `homeRouteForRole` was a binary ternary that
fell through to the customer home — it is an exhaustive `Record` now, so a
fourth role fails to compile instead of silently landing in the shopper app.
Both existing group guards route through it for the same reason.

**Ownership of the order status split.** The merchant's path ends at `ready`;
the courier owns `ready → out_for_delivery → delivered`. `lib/orderStatus.ts`
keeps `nextStatus` / `ADVANCE_LABELS` untouched (verify-logic asserts them) and
adds `STATUS_ACTOR` + `nextStatusFor(status, actor)` beside them. The merchant's
"Confier au livreur" button is gone; the queue row shows "En attente d'un
livreur" / "Livreur en route" instead.

**Position is derived, never stored.** `lib/courierRoute.ts` regenerates a route
from the order id (deterministic dog-legs over the Montréal grid, no Directions
API) and `progressAt()` reads the wall clock against `delivery.acceptedAt` /
`pickedUpAt`. Kill the app mid-run and the courier is exactly where they should
be. `hooks/useDeliveryProgress.ts` is the **same hook on both sides** — two
implementations would eventually disagree, and the bug would be a shopper
watching a driver who is not where the driver's own screen says they are.

**Dispatch** (`lib/dispatch.ts`, `store/useDispatchStore.ts`,
`hooks/useDispatchEngine.ts`): one offer at a time, 30 s countdown, nearest shop
first with age breaking ties inside ~500 m. `passedOrderIds` is what makes a
decline stick. Two traps already hit and fixed — an expired offer must be
cleared even while the courier is mid-run or offline (the store persists it), and
an active run outranks an offer in the render.

**Mapbox** (`@rnmapbox/maps` 10.3.5, Maps SDK v11). `components/map/DeliveryMap.tsx`
is the only file that renders Mapbox components; everything above it speaks
`LatLng`, so `MapFallback` can replace it wholesale when there is no token.
`app.json` became `app.config.ts` so the secret download token comes from `.env`
(see `.env.example`) instead of being committed. Three things that cost real
time and are easy to hit again:
  - a zero-area camera `bounds` (idle state, where pickup/dropoff/courier are all
    the same point) gives no usable zoom and renders a **blank grey map that
    still authenticates** — it reads as a bad token. Falls back to
    `centerCoordinate` + `zoomLevel`.
  - the compass draws at the map's top-right, under the floating header, and
    bleeds through the glass as a dark blob. Disabled — rotation is off anyway.
  - a map-first layout must pass `padding` matching its floating UI, or the
    camera frames the route behind the header and the sheet.

**Courier pay** — `data/courierPay.ts`, base + per km + tip. In `data/` for the
reason `data/taxes.ts` is: the seed builder needs it and `data/` must not import
from `lib/`. **Rates are placeholders — confirm with the client.** The earnings
breakdown derives its distance line by subtraction so it reconciles to the sum of
what was actually paid; recomputing it from raw kilometres rounds a different
number of times and put 254,88 $ at the top of the screen and 254,86 $ at the
bottom.

## Livreur, second pass — motion, history, and a look of its own

**The simulation now runs on a fast clock.** `DEMO_TIME_SCALE` in
`lib/courierRoute.ts` (currently 10; **set it to 1 for production**) multiplies
elapsed time inside `progressAt`. At 1x a courier advances about five metres a
second, which on a camera framing a five-kilometre route is under a pixel — the
map was indistinguishable from a still photograph for the whole length of a
demo. Scaling the *clock* rather than nudging a stored position keeps every
guarantee the module was built on: position is still a pure function of (route,
elapsed), a cold start still resumes correctly, and the courier's screen and the
shopper's still agree because both read the same scaled clock. The ETA is derived
from the same progress value, so the countdown falls in step with the marker
instead of contradicting it. `hooks/useDeliveryProgress.ts` ticks at 250 ms now,
not 1 s — under the fast clock a one-second tick moved the puck in visible jumps.

**Two map bugs the fast clock exposed.**
  - The camera `bounds` memo depended on the courier's coordinate object, which
    is new on every tick. Mapbox restarted its 600 ms fly-to four times a second
    and the map *shivered*. Bounds are now keyed on a ~200 m quantised
    `frameKey`, so the frame is recomputed only when the run has actually gone
    somewhere.
  - A single end-to-end line says where a trip goes, never how much is left.
    `splitPath()` cuts the route at the courier and `DeliveryMap` draws three
    layers — a white casing (a 4pt forest line vanishes over a dark park or a
    motorway ribbon), the road already driven in neutral, the road ahead at full
    weight. Both halves include the cut point, so they meet exactly under the
    puck at any zoom; `verify-logic` asserts that and that the cut sits where
    `positionAlong` puts the marker. `MapFallback` does the same split, because
    the point of the fallback is that it is the same picture without tiles.

The courier marker gained a sonar ring, on only when a route exists — idle, the
Missions map still plots the courier at their own base, and a pulse there claims
movement that is not happening.

**A courier who signs up in the app now has a history.** Only the eight seeded
couriers appeared on any delivery, so a demo account opened on an empty Courses
tab, a Gains screen reading 0,00 $ and a profile stuck at "nouveau" — three of
the four courier screens demonstrating nothing. `ordersApi.ensureDemoRuns()` is
the courier twin of `ensureDemoOrders`: idempotent by construction (it does
nothing once this courier is on an order), seeded from the courier id, and built
through the *same* `buildOrder` as everything else — `OrderSpec` gained an
optional `courier` so the seed builder can be told who drove it instead of
drawing one by proximity. Shops are the ones nearest the courier's base, by the
same measure the dispatcher ranks with; drop-offs are the addresses nearest those
shops. ~30 days, with rest days, so the chart is not a flat comb.

⚠️ **It is two writes and they can be interrupted between.** The runs go into the
orders table, then `couriersApi.recordDemoHistory` reconciles the courier's own
`deliveryCount` / `rating`. `useCourierDemoSeed` originally depended on the
`courier` *object*, which `useCourierProfile` rebuilds on every focus — the
effect re-ran mid-flight and its cleanup cancelled the second write, leaving a
courier with 97 deliveries and a profile still reading "nouveau". It depends on
primitives now, only the `onSeeded` callback is cancellable, and it repairs an
account already in that state by counting the existing runs.

**The courier has its own headline surface.** `components/courier/CourierSlab.tsx`
is to the livreur what `CounterHeader` is to the merchant — same rounded shelf,
own palette: graphite with a mustard corner glow, mustard being the accent that
already marks the courier on every map in the product. Three roles, three
surfaces, recognisable before a word is read. `CourierSlabSurface` is the bare
gradient pair, shared with the profile header, and it owns the status bar
(set on focus, restored on blur — a mounted `<StatusBar>` keeps forcing light
glyphs over the Missions map, because tab screens stay mounted after they are
left).

**Three contrast findings, all caught arithmetically rather than by eye** — see
the new blocks in `scripts/verify-contrast.ts`:
  - The glow is composited *over* the slab, so the audit blends it in before
    checking anything drawn on top. Against that corner, `neutral[400]` labels
    fell under AA; they are `neutral[300]`. The glow's alpha is mirrored in both
    files — keep them in step.
  - Chart bars are data marks and must clear 3:1 against the card. Fading the
    quiet days to 40 % put them at ~1.5:1. Darkening the highlight instead
    cleared the threshold and read *backwards* — on a white card the brighter bar
    looks emphasised, so the best day looked like the dullest. The highlight is
    the app's primary green now: unmistakable among gold, and it already means
    "selected" everywhere else.
  - Mustard body text does not reach AA on a white card at caption size. The tip
    line keeps the accent on the icon (3:1) and sets the amount in the foreground
    colour at semibold — emphasis by weight, and never meaning by colour alone.

**Deltas on the courier screens are not green-up / red-down.** On a shop's
dashboard that reads as performance; on a courier's payout it reads as a verdict
on their week, and a quiet Tuesday is not a failing grade. The arrow carries the
direction. `components/business/StatColumns.tsx` keeps the merchant convention —
this is a deliberate divergence, not drift.

`lib/courierAnalytics.ts` is the courier twin of `lib/analytics.ts` and the
reason the headline, the chart, the breakdown and the payout cannot disagree: the
merchant module sums `subtotalCad` over orders a shop sold, a courier is paid
`delivery.earningsCad` over runs they drove, and those are different numbers over
different sets. `verify-logic` checks that bucket totals sum to the range total,
that the fare components add up, that an empty window is zero rather than NaN,
and that a payout date is always a Friday and never behind us.

## Merchant registration moved into the app

The CDC addendum (§02) routed shop registration to the administration website.
**The client has since asked for it to happen in the app, and it now does** —
`lib/merchantPortal.ts` is deleted, replaced by `lib/merchantOnboarding.ts` +
`app/(business)/signup.tsx`. What did *not* change is that a human approves it;
this is a deliberate divergence from §02 worth restating when the back-office
ships.

`vendorsApi` was read-only over the seed and is now a persisted table. `Vendor`
gained `status` + `registration`, and **every customer-facing list filters to
`approved`** — a pending shop is invisible to shoppers, which is what the
approval step is for. Id and owner lookups deliberately do not filter, so a
merchant can see their own pending shop. A seed invariant fails the build if a
seeded shop is ever left `pending`, because that bug looks like an empty
catalogue rather than like a bug.

`useOwnerVendor` and `useCourierProfile` both answer three states now (missing /
pending / approved), and `PendingApproval` / `CourierGate` say a different
sentence for each — telling someone to wait when they have not applied, or
asking them to apply when they already have, are both ways of looking broken.

## What's left

### Finish Phase 1 (splash/onboarding/auth/role-gate)
- [x] Real end-to-end simulator walkthrough, both role branches, incl. kill-and-relaunch and sign-out/sign-in. Five blocking bugs found and fixed.
- [ ] Ask the user what's wrong with `Badge` and fix it. **Still open — ask before redesigning blind.**
- [ ] The cart-store's vendor-switch confirmation dialog UI doesn't exist yet (store logic does) — needed once Phase 2 wires up "Add to Cart."

### Not yet verified
- Android has never been run. iOS simulator only.
- Dark mode is now toggleable from the customer Profile tab (and the styleguide route), but has still never been *reviewed* — expect contrast problems. Known hard-coded light-mode colours to fix in the Phase 4 audit: `EmptyState`'s icon (`forest[600]`), `Input`'s focus glow (`#246B47`), and the destructive icon in Profile's sign-out row.

### Phase 2 — Customer app
- [x] Seed data at full richness (10 vendors, 78 products).
- [x] Image pipeline **and 88 real photos bundled** (see the Images section above). `CatalogImage` still falls back to the branded placeholder for anything added later without a photo — a product created in-app, for instance.
- [x] Badge redesign.
- [x] **Home**, **Product Detail** and **Vendor Detail** built against the reference (`docs/references/home-and-product-detail.png`). Not yet seen running — the user asked to verify these personally.
- [x] Cart vendor-switch confirmation dialog (`components/customer/VendorSwitchDialog.tsx`), mounted once in `app/(customer)/_layout.tsx` so every add-to-cart surface is covered.
- [x] **Search** — debounced query (`hooks/useDebounce.ts`) + category chips, sharing `ProductGrid`.
- [x] **Cart → Checkout → Order confirmation → Orders list → Order detail with tracking timeline.** The full browse-to-order happy path now runs end to end and writes real `Order` records through `ordersApi.createOrder`.
- [x] **Favorites** and a real **Profile** (favourites count, orders link, dark-mode switch, sign out).
- [x] Customer tabs are now the five from the original plan — Accueil, Recherche, Panier, Commandes, Profil — with a live item-count badge on Panier.
- [ ] Address entry and payment-method management are visual only: checkout shows the user's first address or `data/seed/addresses.ts`'s fallback (accounts created in-app have no address), and the two payment options are mock.
- [x] Seeded orders expanded to **28 across all 10 vendors**, from 4 different customers, with a realistic status mix (19 delivered, 6 in flight, 2 cancelled). `data/seed/orders.ts` is now a compact spec plus a builder that resolves each line against the catalogue and derives totals, fees and status history — hand-writing full `Order` objects meant hand-summing money and hand-copying product names, which drifts silently.
- [x] `data/api/products.ts` moved onto `createPersistedTable`, so catalogue edits survive a relaunch. All three mock tables (accounts, orders, products) now share that helper.

**Mock persistence.** `data/utils/persistedTable.ts` is the shared helper behind both `authApi` and `ordersApi`: seeds are the baseline, the AsyncStorage snapshot is layered on top by id, and every read returns a copy so callers can't mutate the table through a held reference. Keys: `sougouba-mock-accounts`, `sougouba-mock-orders`. **Superseded in Phase 6** — only rows the app itself wrote are persisted now, and `save()` takes a row id. See the Phase 6 section.

**Order status vocabulary** lives in `lib/orderStatus.ts` — French label + badge tone per status, plus the canonical happy-path progression. `OrderStatusTimeline` renders steps from that progression rather than from `statusHistory`, so a fresh order still shows what is coming; `cancelled` gets its own row because it is an exit from the flow, not a position on it.

**New components** (`components/customer/`, all exported from its index): `HomeHeader` (gradient panel: location + search + categories), `SearchField`, `ProductCard`, `VendorCard`, `SectionHeader`, `DiscountMark`, `NutritionRow`, `VendorSwitchDialog`. `CategoryCircle` / `CategoryRow` were rewritten (see below). `components/ui/CatalogImage.tsx` is the shared photo-or-placeholder.

**Two gotchas worth not rediscovering:**

1. **`className` does nothing on `expo-image`.** NativeWind only auto-registers React Native core components, and this project calls `cssInterop` nowhere — so classes on a third-party component are silently dropped. `CatalogImage` sizes through `style` for exactly this reason (`Avatar` already did the same). If you add another third-party component, style it the same way or register it explicitly.
2. **Don't build the product grid out of percentages + `flex-1`.** The first version wrapped each card in a `min-w-[45%] flex-1 max-w-[48%]` item and gave the card `flex-1`. A `flex-row flex-wrap` container aligns items with `stretch` by default, so every wrapper grew to the tallest card in its row and the card then filled it — cards rendered far taller than their content. `ProductGrid` now computes an exact pixel width from `useWindowDimensions()` and the card carries no `flex` at all, so height is purely content-driven. The card also shows a single price: two prices side by side don't fit the ~106px left beside the add button and wrapped onto a second line, stretching the whole row.
3. **`CategoryCircle` no longer uses emoji.** The custom display/body fonts carry no emoji glyphs, so rendering one depends on an OS fallback that this simulator runtime does not do reliably — hence the long-documented tofu boxes. It now draws the Lucide glyph from `lib/categoryIcons.ts`, which renders identically everywhere and matches the reference's use of imagery over emoji. `lib/categoryEmoji.ts` is now unused.

**Reading of the reference** (`docs/references/home-and-product-detail.png`, two phone mockups side by side):

*Home* — a soft mint→pale-lime gradient panel with a large bottom-only corner radius holds the status bar, a location row (pin in a white disc, small "Location" label above a bold city line, avatar right), a translucent pill search field with a filter glyph, and a horizontally-scrolling row of circular category badges (each a photo on its own pastel disc, label beneath, last one clipped to hint scroll). Below on plain background: "Popular Items" + "See All", then a 2-column product grid. Cards are near-white with a soft shadow and ~20px radius; the product photo floats directly on the card with no image container; outline heart top-right; a *typographic* discount mark top-left (large bold "20%" with a smaller raised "OFF", no chip); name, then price bold; a circular white add-to-cart button bottom-right.

*Product Detail* — full-bleed pale-mint gradient behind a large floating hero photo; circular white back and kebab buttons with a centred "Details" title; a white sheet with a large top radius covering the lower ~45%, containing a big display title, a row of pin + location (muted) against a bold right-aligned price, a "Description" heading with two muted lines, then the nutrition row: a soft cream rounded container split into 4 equal columns by hairline dividers, each a muted label above a bold value with a smaller muted unit; finally a full-width pill CTA.

**Deviation to keep:** the reference CTA is an orange *gradient*. Ours stays flat terracotta-600 — the gradient+gloss CTA was explicitly rejected as "so ugly" (see the button note above). Match the reference's layout and proportions, not that fill.

Remaining screens: Home (matches a reference screenshot the user provided — location selector + search + category circles + featured listings), Product Detail (matches a second reference screenshot — hero image on soft background, rounded sheet, 4-col nutrition stat row, gradient/flat CTA), Vendor Detail, Search/Filters, Cart, Checkout, Order Confirmation, Orders/Tracking, Favorites, Profile sub-screens (edit profile, addresses, payment methods, notifications, settings).

### Phase 3 — Business Owner app ✅ built (not yet run)
- **Aperçu** (`dashboard.tsx`) — revenue / orders / average basket / active products from `ordersApi.getVendorStats()`, plus in-progress orders, best sellers and a low-stock list (≤ 20 units).
- **Commandes** (`orders.tsx` + `order/[id].tsx`) — filterable queue with counts, and a detail screen that advances status one step at a time via `updateOrderStatus`. Cancelling is behind a confirm because there is no transition back onto the happy path.
- **Catalogue** (`catalog.tsx`, `product/new.tsx`, `product/[id].tsx`) — searchable list with stock/availability badges, and full create / edit / delete through a shared `components/business/ProductForm.tsx`.
- **Analytique** (`analytics.tsx`) — 7/30-day range, revenue bar chart (`react-native-gifted-charts`), best sellers with inline share bars, status mix.
- **Boutique** (`profile.tsx`) — shop cover, rating, delivery terms, opening hours (Monday-first, today highlighted), account, dark-mode switch, sign out.

`hooks/useOwnerVendor.ts` resolves the signed-in owner's shop and exposes a `missing` state. That state is real: anyone who signs up in-app and picks "commerçant" has no `vendorId`, since there is no shop-onboarding flow — every business screen branches on it rather than rendering an empty dashboard that looks broken.

**`react-native-gifted-charts` works under Expo without `react-native-linear-gradient`** — its gradient shim tries that package and falls back to `expo-linear-gradient`, and Metro tolerates the unresolvable branch. Verified by bundling. Don't "fix" it by installing the bare-RN package.

### Verifying without a simulator
`npm run verify` = typecheck + three runtime suites. They exist because the type-checker proves nothing about the things most likely to be wrong here:
- `scripts/verify-contrast.ts` — WCAG ratios for both themes, plus `global.css` ↔ `theme/colors.ts` sync. It found the light-mode failures described in Phase 4; nothing about them was visible in a type-check or a screenshot.
- `scripts/verify-seed.ts` — every order's subtotal/total recomputed from its items, delivery fee matched against the vendor, product names and prices matched against the catalogue, status history monotonic and ending at the current status, every vendor covered. It caught real drift while the seed was being expanded.
- `scripts/verify-logic.ts` — the product schema (blank price rejected, `0` rejected, French decimal comma accepted, strike-through price must exceed the sale price, tag dedupe), the order-status transition table, and the analytics aggregation (cancelled revenue excluded but still counted in the status mix, buckets summing to the total, no divide-by-zero on an empty range).

### Phase 4 — Polish (partly done)

**Contrast audit — done, and light mode was the one that failed.** `npm run verify:contrast` computes WCAG ratios across the semantic palette in both themes and re-checks `global.css` against `theme/colors.ts` (they are hand-mirrored and can silently disagree). Dark mode passed everywhere. Light mode did not, and the fixes are in:
- `mutedForeground` was `neutral[500]` — **3.31–3.83:1**, below AA on every surface, and it carries most secondary text in the app. Now `neutral[600]` (4.87–5.65:1).
- `secondary` was `terracotta[500]` — white labels at 3.61:1, which affected the cart tab badge and the discount mark. Now `terracotta[600]` (4.76:1).
- Added `borderStrong` for the resting edge of a text field. The plain `border` is deliberately faint for dividers; reusing it on inputs left the only boundary of a field at 1.34:1.

**Theme-correctness sweep.** ~35 icon/shadow colours were passing raw ramp values as props, which bakes in the light theme — `neutral[600]` sits at 1.7:1 on the dark card, so those icons were invisible. All now go through the new `useThemeColors()` hook. **Rule: anything taking a colour as a prop (Lucide `color`, `shadowColor`, chart series, SVG fill) uses `useThemeColors()`, never a raw ramp.** The gold rating star is the deliberate exception.

**Glassmorphism — the tab bar.** `components/ui/TabBarBackground.tsx` is a blur plus a card-tinted wash; the tab bar is `position: 'absolute'` with a transparent background so content scrolls under it. Glass needs movement behind it to read as glass, which is why the tab bar is the right place and a static card is not. The wash is heavy on purpose: blur alone left labels hard to read over a scrolling product grid.

⚠️ **Consequence:** the tab bar no longer takes part in layout, so every screen inside `(tabs)` reserves `useTabBarInset()` (`insets.bottom + 49`) at its bottom — on its scroll `contentContainerStyle`, and on the cart's pinned checkout footer. All ten tab screens use `edges={['top']}` so the inset is not double-counted. **If anything is clipped behind the tab bar, that hook is the place to look.**

### Phase 4 — remaining
- Further glass moments if wanted: bottom sheets and the circular controls over the product-detail hero. `GlassSurface` exists for this.
- `FlatList` pass. Everything is a `ScrollView` today. It is fine at current volumes — the search browse list is capped at 24 for exactly this reason — but a vendor catalogue could outgrow it.
- French-copy overflow on a real device. The two known-tight spots are already handled ("Tableau de bord" → "Aperçu"; the product card shows one price because two overflowed), but the 5-tab customer bar ("Recherche", "Commandes") is worth a look on a narrower phone.
- Empty/loading/error audit: every screen built so far has all three, but they have not been seen running.
- `components/ui/ComingSoon.tsx` is now unused — every tab is real. Kept as a primitive; delete if it stays unused.
- `app/_dev/styleguide.tsx` still ships as a reachable route (`/_dev/styleguide`) in a production build. Harmless for a prototype demo, and useful — it is the quickest way to eyeball the design system, including the dark-mode toggle.

### Phase 5 — "make it feel premium" pass (2026-08-09)

Prompted by a single round of feedback: *the category icons bother me, the app doesn't feel animated, onboarding should be fullscreen pictures not centred icons, the app feels empty (Panier/Commandes/Profil), the search filter buttons don't work, and navigating between screens isn't animated.* Home's hero was explicitly kept — the user likes it.

**Motion.** `components/ui/Reveal.tsx` is the one entrance primitive: fade + 18px rise, 55ms stagger **capped at 330ms** (a linear `index * step` left the last row of a 24-card grid arriving three seconds late), and it short-circuits to a plain View under `useReducedMotion()`. Applied to the product grid, vendor rail, orders, cart lines, addresses, cards and the profile's sections.

⚠️ **`ProductGrid` now sets `alignItems: 'flex-start'`.** Each card sits inside a `Reveal` wrapper, and a `flex-wrap` row stretches its items by default — the exact coupling that once made every card grow to the tallest in its row. Don't remove it.

**Navigation was genuinely un-animated, and the cause is an Expo 57 change.** expo-router 57 no longer depends on `@react-navigation/*` as a peer — it vendors them under `expo-router/build/react-navigation/` and depends on `standard-navigation`. `npm ls @react-navigation/bottom-tabs` finds nothing; read the types from the vendored path instead. In that version **`Tabs` defaults to `animation: 'none'`**, so every tab switch was a hard cut. Both tab layouts now set `animation: 'shift'`. Root-level group changes ((auth) ↔ (customer) ↔ (business)) are `animation: 'fade'` — a context change, not a step forward; stacks inside a group keep the native push. `components/ui/TabBarIcon.tsx` springs the selected glyph.

**Category circles are photographs now** (`lib/categoryImages.ts` → a representative product photo per category). The Lucide glyph survives as the fallback for a category with no photo. Selection changed from a white ring to a **forest ring floating 3px outside the disc**, animated by opacity+scale on a fixed-size box — white read as a gap once the disc was photographic, and animating padding/width would relayout the whole strip on every tap. `CategoryRow` gained `pt-1.5 pb-1.5` so the ring is not clipped.

**Onboarding is full-bleed photography** (`components/onboarding/OnboardingSlide.tsx`): four catalogue photos, a 16s Ken Burns drift alternating direction by index, one four-stop scrim carrying both the skip link at the top and the headline at the foot. The old `components/onboarding/illustrations/` is deleted. Slide 4 no longer promises a rewards/points programme that does not exist — it describes favourites and reordering, which do. Note the source photos are 900×900, so full-screen is a ~1.3× upscale; re-fetch larger if it ever bothers anyone.

**The app was empty for anyone who signed up in it.** Only the four hard-coded seed customers had orders. `ordersApi.ensureDemoOrders()` + `hooks/useDemoSeed.ts` (mounted in the (customer) layout) give a new account five orders — three delivered, one out for delivery, one preparing — and a three-line cart. Offsets are **relative to first launch**, not fixed dates, so a demo months from now still shows a live delivery timestamped minutes ago. Both halves hang off one condition (does this customer have any orders?), which makes it idempotent with no extra flag *and* means a shopper who empties their cart never finds it refilled. `buildOrder` is exported from the seed so runtime orders come off the same builder — totals from the catalogue, fee from the vendor.
`Order` gained `customerName?`, set at checkout and by the seeder, so the shop-side queue names in-app accounts instead of falling through to "Client Sougouba" (`customerLabel(order)` in `lib/customerNames.ts` is now the single call site).

**Search filters work.** `lib/productFilters.ts` (sort / price band / vendor / on-sale / in-stock) + `components/customer/FilterSheet.tsx`. The sheet edits a **draft** and reports every change up, because its button says how many products the selection leaves; committing on close would make dismissing destructive, committing per tap would make that count meaningless. `activeFilterCount` deliberately ignores sort. Price bands are half-open (min inclusive, max exclusive) so $10.00 lands in exactly one band — `npm run verify:logic` now asserts the bands partition the catalogue exactly.

**Profile is a real profile.** Cover photo + overlapping portrait (`ProfileHeader`), a stat strip of three honest numbers (orders, favourites, spend — cancelled excluded, matching the shop dashboard), and section rows that all lead somewhere real: `app/(customer)/account/{edit,addresses,payment,notifications,about}.tsx`. **The directory is `account/`, not `profile/`** — the profile tab already owns `/profile`. New store `usePreferencesStore` (notification toggles + payment methods, cleared on sign-out, registered in `useStoreHydration`); `useSessionStore.updateUser()` patches everything except `id` and `role`. `User` gained `memberSince`. Portrait picking goes through `expo-image-picker` (already configured; the permission string was reworded to mention profile photos, which needs a native rebuild to take effect).

Checkout stopped lying as a result: it honours the address marked default, links to both new screens, and shows the actual default card instead of a hard-coded "•••• 4242" — falling back to cash if the last card is removed.

`DiscountMark` gained a card-coloured plate. It was designed to sit on card colour per the reference, where the photo floats inside the card; here the photo fills the card's top, so terracotta type on mangoes was unreadable. Confirmed on the simulator.

**Onboarding photography was re-shot from the library** after *"we are a premium brand"* — slides 1, 3 and 4 were rejected, slide 2 (the Marrakech spice stall) was kept. It now runs on its own assets in `assets/images/onboarding/` via `lib/onboardingImages.ts`, **not** the catalogue: catalogue images are 900×900 squares cut for product cards, so full-screen they upscale ~1.3×, and a brand screen cannot afford that softness. The replacements are 1400×2800 portrait crops of Pexels originals, pulled straight from the CDN by photo id with no API key — `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=700&h=1400&fit=crop` (ids are in `assets/images/CREDITS.md`, which documents the recipe).

What changed and why: shop shelves — glass jars of dried goods and a brass scale — for the opener, after a follow-up note that it should read as *groceries and a store, not fruits and vegetables* (it was chilies first, which was produce, not an épicerie; it now matches the headline "Les épiceries d'ici, enfin réunies"); low-key couscous for "commandez, suivez, recevez"; a hand choosing eggs at a market stall for the last slide. That last one was mint tea first and was changed again on the follow-up note *"make it about shopping groceries"* — so its headline moved with it, from "Vos habitudes, gardées au chaud" to "Votre panier habituel, en deux gestes": "kept warm" was a metaphor for the glass of tea and means nothing against a market stall. The scrim's top stop also dropped from 0.55 to 0.42 — it only has to carry the skip link, and at 0.55 it was dimming the produce in every slide. All four are now close, saturated and low-key, and **none carries another business's branding** — which is what ruled out most of the obvious "supermarket" candidates: a Pick n Pay aisle with rand prices and SAVE signage, a canned-goods wall of SPAM and Del Monte, a blown-out fluorescent hypermarket. The catalogue's own storefront photography fails the same test: it carries other businesses' signage (`vnd_epicerie_atlas` is a Turkish shop named Gültekin), British £ price tags (`vnd_teranga`) and an Indonesian dairy aisle (`vnd_marche_bamako`). Acceptable at thumbnail size in a vendor list; wrong as the first thing the brand says.

⚠️ **`vnd_teranga` is still the profile cover** in `components/customer/ProfileHeader.tsx` — the £-price-tag market stall. Same objection, not yet fixed.

**The splash is the client's brand film now.** Supplied as `splashLast.mov` in the repo root (it superseded an earlier `splashscreen.mov`, still sitting there unused); `app/index.tsx` used to be a Reanimated logo fade, written as a swappable slot for exactly this.

Three things about the source mattered, and all three are handled in `assets/video/splashscreen.mp4` rather than at runtime:
- **It is portrait content pillarboxed in a landscape file.** 1920×1080, but the actual animation is a 608×1080 column with black bars either side (`ffmpeg -vf cropdetect` → `crop=608:1080:656:0`). Shipping it as-is would have put black bars on screen or forced a runtime crop.
- **It had an AAC audio track.** Stripped with `-an`. A launch screen must never interrupt someone's music, and `player.muted` alone still claims the audio session — the player also sets `audioMixingMode: 'mixWithOthers'`.
- **Cropping the bars took it from 4.0 MB to 1.4 MB.**

Rendered `contentFit="cover"`, deliberately: the backdrop is a graduated studio sweep (~#B4B4B4–#D4D4D4), not a flat colour, so letterboxing would leave a visible seam where the bars meet the gradient. Cover trims ~9% off each side; the centred logo lockup clears that easily (verified by simulating the crop with ffmpeg before writing any code, and again on the simulator).

⚠️ **The film runs 8.2 seconds, on every cold start.** The redirect fires on `playToEnd`, so that is the real wait. `MAX_SPLASH_MS` (11s) is only a failsafe against a stalled decoder — **to cut the animation short, lower that constant** (≈3500) and it becomes the timing. Worth a decision before any real release.

Two loose ends: both `splashLast.mov` (4.0 MB) and the older `splashscreen.mov` (5.3 MB) are still in the repo root and neither is referenced — the bundled asset is the cropped `assets/video/splashscreen.mp4` — and the native splash behind the film is still `#FAF9F7` in `app.json` while the film's backdrop is `#D0D0D0` — a brief colour step at hand-off. Changing it needs a native rebuild, so it was left alone.

**The discount flag came off the product cards.** `components/customer/DiscountMark.tsx` is deleted — it was used only by `ProductCard`, and the user asked for it gone. Discounts are still real and still reachable: `compareAtPriceCad` drives the struck-through original on product detail, the "En promotion" search filter, and Home's habit of leading with genuine deals. Only the "-19 % RABAIS" flag over the photo is gone, so the card is now photo, heart, name, price, add.

**Signed out now means onboarding, everywhere.** Requested directly: *when disconnected the main screen is onboarding, when connected it's home.* `app/index.tsx` sends a session-less launch to `/onboarding` instead of the auth landing, and the three guards that used to bounce to `/(auth)/welcome` on `!user` — `(customer)`, `(business)` and `role-select` — now bounce to `/onboarding` too, so signing out returns to the pitch rather than a login form. Onboarding's last slide still hands off to the auth landing, so sign-in is one tap further in.

That made `hasCompletedOnboarding` dead state — nothing reads it once being signed out always means onboarding — so it is gone from `useSessionStore`, along with `completeOnboarding()`. **Persist is now `version: 2`**, and the migration strips `hasCompletedOnboarding` alongside the v0 booleans. Redirecting to `/onboarding` is safe from a group guard because it is a top-level route, not a leaf inside the group doing the guarding — the rule from bug 1 still holds.

**What was seen running, and what was not.** Verified live on the iPhone 17 Pro: Home (photographic categories, legible discount marks, cart badge showing the seeded 4 items), and all four onboarding slides including the dot progression and the "Commencer" final state. **The rest of Phase 5 is verified by `npm run verify` + `npx expo export` only** — the signed-in screens behind auth (profile, the five account sub-screens, the filter sheet) have not been seen running, because reaching them needs a typed sign-in and `keystroke` has to go one character at a time.

⚠️ **The tap harness cost the Simulator window twice.** Warm-up clicks are the hazard: the title bar's *left* end is the traffic lights, and *below the device screen* can fall outside the window onto the Dock, depending where the window sits. `scripts/tap.sh` now warms up on the title bar's horizontal centre. Recovery when it happens: `xcrun simctl shutdown all`, quit Simulator, `xcrun simctl boot <udid>`, `open -a Simulator` — that worked once, and failed the second time (device stayed booted and `simctl io … screenshot` kept working, but `System Events` reported zero windows). Also note **fast refresh preserves PagerView state**, so editing `initialPage` is not a way to drive onboarding from code when tapping is unavailable.

⚠️ **Never warm up by clicking the title bar's left end.** At the default window size that lands on the traffic lights and *closes the device window* — and it could not be reopened afterwards (`System Events` reported zero windows even after Window ▸ *device*, `open -a Simulator`, and a full relaunch). What does recover it: `xcrun simctl shutdown all`, quit Simulator, `xcrun simctl boot <udid>`, then `open -a Simulator`. Warm up inside the bezel just below the device screen instead — between the AXGroup's bottom edge and the window's. Also note that with two devices booted, `windows[0]` is not necessarily the one you mean, and the device is **402pt** wide (1206px @3x), not 393.

### Phase 6 — the commerçant side: seeded properly, and given its own face (2026-08-09)

Two separate problems, both of which made the merchant app look unfinished.

**1. The seed was dated with fixed calendar strings.** Every order was pinned to
2026-07-19 → 08-09, so the shop dashboards were only correct on the day they were
written: a week later the 7-day chart is blank, a month later the whole app reads
zero. **All seed timestamps are now relative to launch** — `data/utils/time.ts`
(`montrealIsoAt(daysAgo, h, m)`, `montrealMinutesAgo`, `montrealWeekday`) is the
one place that knows how, shared by the seed and `ordersApi`. Order specs declare
`{ daysAgo, at }` or `{ minutesAgo }`; `buildOrder` still takes a resolved ISO,
so `ensureDemoOrders` is unchanged.

⚠️ **`createPersistedTable` used to defeat exactly this.** `save()` serialised
the *whole* table, so the first write froze a copy of every seed row into
AsyncStorage — and from then on the stored copy won. It now persists **only rows
the app itself wrote** (`owned`), plus tombstones for deletions (needed because
`deleteProduct` can remove a *seed* product, which would otherwise return on the
next launch). `save()` takes the row id. A legacy bare-array snapshot is
migrated by keeping only ids the seed does not know — this was verified against a
real install that was carrying the entire old seed frozen at fixed dates.

**2. Ten shops shared 28 orders.** Each merchant had two or three to their name:
~$150 of all-time revenue, a 30-day chart with three bars, best-sellers where
everything had sold once. `data/seed/orders.ts` now keeps the hand-written orders
for narrative (the demo customer's history, one order at each pipeline stage) and
adds a **deterministic generator** — seeded per vendor with `mulberry32`, never
`Math.random`, so ids and figures are identical on every launch (the persisted
table layers over these by id; shuffling ids would accumulate duplicates).

**592 orders**, ~30–45 per shop over 45 days, weighted to Fri/Sat and to recent
weeks, clustered at lunch and after work, clamped to each shop's real opening
hours. Every shop: 20–30 orders in 30 days, sales on ~2/3 of days, 3–5 live in
the queue right now. 10 more seed customers so the queue is a list of people
rather than four names repeated. The historical rate is **tuned against the live
queue** — at the first value a shop averaged one order a day while carrying five
in its queue, so "today" towered over every bar on the revenue chart.

**3. A merchant who signed up in the app had no shop at all** — no `vendorId`, so
all five tabs rendered "Aucune boutique associée". `hooks/useBusinessDemoSeed.ts`
(mounted in `app/(business)/_layout.tsx`, mirroring `useDemoSeed`) claims one of
the seeded shops, chosen by hashing the account id so it is stable across
launches, and writes it through `authApi.mockAttachVendor` so it survives
sign-out. The `missing` state is still real and still handled.

#### The design: "le comptoir"

The customer app is daylight — ivory ground, mint gradient, photography. The
merchant app is the other side of the counter, and it was previously *less*
designed than the customer side: five screens each opening with black text on the
ivory background, no motion anywhere, and a 2×2 grid of identical KPI tiles.

- **`components/business/CounterHeader.tsx`** — a deep forest slab at the top of
  every merchant screen. Same brand ramp, opposite end of it, which is what tells
  you at a glance which of the two apps you are in. It carries the screen's only
  strong surface; everything below stays on plain background with quiet white
  cards. Its foregrounds are **fixed** (`onSlab`), because the slab is dark in
  both themes — so `scripts/verify-contrast.ts` audits them separately. That
  audit caught the day strip's progress track at 2.91:1 and it moved up a step.
- **`DayStrip.tsx` is the signature.** Today's trading drawn as the shop's own
  day: the track spans this shop's opening hours, each order is a spike at the
  time it was placed and as tall as it was large, and the marker is now. Built
  from `vendor.hours` + order timestamps via `lib/shopHours.ts`.
  ⚠️ `positionInDay` **clamps** rather than returning null for an order outside
  opening hours — dropping them let the strip show fewer orders than the queue
  beside it counted, which is how the pre-opening case was found.
- **Dashboard is ordered by urgency**, not by what is easiest to render: live
  queue → 7-day comparison with deltas vs the previous 7 days (`comparePeriods`)
  → best sellers → low stock. All-time revenue is an accountant's number, not a
  shopkeeper's, and it used to lead.
- **`OrderQueueCard` advances an order inline.** Elapsed time, customer name,
  and *what to pick off the shelves* — the old row showed the internal order id
  and an item count, and hid the contents behind a tap. Advancing is the most
  repeated action on the screen, so making it a round trip through a detail view
  is what turned a working queue into a browsing one.
- Queue sorts **oldest first** (the reverse of every other list) — the ticket
  waiting longest is the one needing a decision.
- `Reveal` throughout; Orders and Catalogue are `FlatList`s. Customer Commandes
  too, since the richer seed pushed it to ~47 rows.
- Tab icons were wrong: `Store` on Commandes and `User` on Boutique. Now
  `Gauge / Boxes / ClipboardList / ChartColumn / Store`.
- **Loading flash fixed:** `load()` returns early while the vendor is still
  resolving, and the `.finally` cleared `loading` anyway — so every merchant
  screen flashed a fully zeroed dashboard before its data arrived. Guarded on
  `vendor` in all four screens; the slab shows `—` rather than `0,00 $`.

**New/changed:** `lib/shopHours.ts`, `lib/orderRef.ts` (order ids were being
shown to users by stripping the prefix — `ord_g3_004` is not something a merchant
can read down a phone line; now a stable 4-hex reference), `lib/format.ts`
`formatElapsed`, `lib/analytics.ts` `comparePeriods`, `components/business/`
`CounterHeader` / `DayStrip` / `OrderQueueCard` / `StatColumns`.
**Deleted:** `IncomingOrderCard` and `KpiCard` (superseded).
**Moved:** `SectionHeader` from `components/customer/` to `components/ui/` — both
apps use it now — and it gained an optional `count` pill.

`scripts/verify-logic.ts`'s analytics assertions were pinned to a fixed `NOW` and
a UTC-parsed cutoff four hours before the local midnight the range starts at;
both are derived now, so they follow the relative seed.

**Seen running** on the iPhone 17 Pro: all five merchant tabs with real data.
A dev-only LogBox warning toast appears at the foot of the screen; it does not go
through `console.warn` (a temporary interceptor caught nothing) and does not
reach the unified log, and LogBox does not exist in a release build.

## Client feedback round — août 2026

Seven items off a demo, across all three roles. Two of them changed rules rather
than wording, and three of the "just rename it" items turned out to be labels
that were lying about what the code did.

**Delivery is priced by the platform now, not by the shop.** `Vendor.deliveryFeeCad`
is gone — the field, the ten seeded values, the signup input, the schema entry
and every display of it. `data/deliveryPricing.ts` (sibling of `taxes.ts` and
`courierPay.ts`, in `data/` for the same reason) holds five distance bands and
`deliveryFeeFor` / `deliveryFeeBetween`. `useCartDetails` measures shop → shopper
and prices it; `createOrder` re-derives the fee server-side the way it already
re-derived tax, so the client no longer gets to name its own delivery charge;
`buildOrder` prices seeded orders the same way and `verify-seed`'s old "fee ==
the shop's fee" invariant became "fee == the grid at this distance". Shop cards
say "dès 2,99 $" until an address is known, then the real number; the cart line
reads "Livraison (3,4 km)". `Order.deliveryFeeCad` stays — a receipt must keep
what was charged. ⚠️ **Courier pay (`data/courierPay.ts`, 3,50 $ + 0,90 $/km) now
out-earns the grid on long runs. The two barèmes need arbitrating together —
flagged to the client, not changed.**

**Cash on delivery is gone from the shopper's checkout.** It was only ever a
local radio button — `Order` has no payment field, and nothing downstream ever
saw it — so this is a UI removal, not a migration. Checkout now lists every saved
card, and with none saved it shows an "Ajouter un moyen de paiement" prompt and
the CTA routes there instead of placing the order.

**Two home sections were renamed, and both renames forced real work.**
"Populaires" sorted by whether an item carried a struck-through price; it is
"Articles les + vendus" now, over `ordersApi.getTopProductIds` (units sold across
every shop, cancelled excluded), falling back to the deals order only when the
catalogue has no sales to rank. "Commerces près de vous" listed *every* shop by
announced ETA; it is "Restaurants près de chez vous", filtered on
`vendorType === 'restaurant'` and sorted by real distance from the shopper's
address — the same measure `vertical/[type]` uses, so a restaurant does not move
between the two screens.

**City is a closed list, and the postal code has to agree with it.** Three forms
had three copies of `min(2, 'Ville requise')` and three postal-code regexes, one
of which had already drifted. `data/cities.ts` holds the served cities and their
FSAs; `lib/validation/address.ts` is the single `citySchema` + `postalCodeSchema`
+ cross-check the three now import; `data/api/geo.ts` is the async twin for
anything wanting the round trip (`CitySelect` reads its options there). The
postal code is normalised in the schema, so the hand-rolled reformat in the
address book is gone and the courier and shop forms get it too. **Note for the
client: a city cannot auto-fill a postal code — a city holds hundreds. The
guarantee is the other direction.** Montréal deliberately accepts the
Montréal-Nord FSAs: the borough is Montréal, and rejecting someone who wrote the
city they live in is a validator being wrong on principle. `verify-seed` now
fails if any seeded address would be rejected by the app's own rule.

**Nutrition is opt-in.** Four `requiredNumber` fields meant a merchant could not
save a sack of rice. `Product.nutrition` is optional, the form hides the section
behind an "Ajouter les valeurs nutritionnelles" switch (the `En vente` /
`Certifié halal` card pattern), and a `superRefine` requires all four only once
it is ticked — half a block would draw a four-column strip with holes in it.
`NutritionRow` is not rendered at all when a product declares none.

**Both signup journeys end on a confirmation screen.** They finished on a bare
`router.back()`, which drops the applicant onto the gate screen with nothing
saying the file was sent — a form that succeeded, read as one that failed.
`components/onboarding/ApplicationSubmitted.tsx` is shared by
`/(business)/signup-confirmed` and `/(courier)/signup-confirmed`; both are
reached with `replace`, so a filled-in form cannot be stepped back into and
submitted twice.

**Courier: moto, assurance, banque — and a bug that would have eaten all of it.**
`scooter` keeps its stored value (it keys `VEHICLE_SPEED_KMH` and sits in every
seeded row) and is labelled "Moto" everywhere a human reads it; the glyph is
lucide's `Motorbike`. Insurance (insurer, policy, MM/AAAA expiry, rejected if
lapsed) is required of any motorised vehicle, replacing the helper line that
promised it would be asked for "à la validation". "Institution financière" as
free text became `bankId` against `data/banks.ts` — eleven institutions with
their institution numbers, plus `other` with a manual name — through a new
`components/ui/SelectField.tsx` (the long-list counterpart to `CitySelect`).
⚠️ **`app/(courier)/signup.tsx` never forwarded `values.payout` or
`licenceNumber` to the API.** The payout step validated a bank account nothing
stored, and the new insurance fields would have vanished the same way.
`CourierApplication` and `Courier` gained `licenceNumber`, `insurance`, `payout`
and `postalCode`, and the courier profile shows them.

**Deferred:** "modifier aide et informations (ci-dessus)" — the client's message
referenced something not included with it. `app/(customer)/account/about.tsx` is
untouched pending that detail.

**New files:** `data/deliveryPricing.ts`, `data/cities.ts`, `data/banks.ts`,
`data/api/geo.ts`, `lib/deliveryAddress.ts`, `lib/validation/address.ts`,
`components/ui/CitySelect.tsx`, `components/ui/SelectField.tsx`,
`components/business/DeliveryGrid.tsx`,
`components/onboarding/ApplicationSubmitted.tsx`, and the two `signup-confirmed`
screens.

## Key user feedback / preferences to remember

1. **Wants visibly premium/rich UI by default** — but the CTA-button episode proved the ceiling is "confident + flat + one subtle depth cue," not "gradient + gloss + glow stacked." When in doubt, do less, more precisely.
2. **Gives corrections in short, low-detail bursts** ("so ugly", "so simple", "i dont like the badges") — expect to have to infer/ask, and expect rapid iterate-and-screenshot cycles rather than long specs.
3. Reference screenshots for Home and Product Detail layout were provided early in the (now-cleared) conversation and are described above — if the user has them handy, ask for them again rather than guessing the layout from scratch.
4. This doc + `/Users/snow/.claude/plans/users-snow-projects-sougouba-devis-cont-jiggly-pony.md` are your ground truth. The user's memory files (auto-loaded, `/Users/snow/.claude/projects/-Users-snow-projects-sougouba/memory/`) also carry a `feedback_premium_visual_design.md` note.

## How to verify things work (commands)

```bash
cd /Users/snow/projects/sougouba
npx tsc --noEmit                              # type-check, should be silent/clean
npx expo export --platform ios --output-dir /tmp/check   # bundle check without a simulator
npx expo run:ios --device "iPhone 17 Pro"     # full native build + install + launch (several min)
# if the dev server / port is already occupied by another project:
npx expo start --clear --port 8082
```
