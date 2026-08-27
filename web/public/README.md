# web/public — Phase 0 asset kit

Everything here is generated. Do not hand-edit; re-run the script.

| Folder | Built by | Notes |
|---|---|---|
| `brand/` | `node scripts/extract-brand-kit.mjs` | Vector, from `docs/logo.pdf` |
| `img/` | `node scripts/build-web-images.mjs` | Responsive AVIF + WebP + JPEG |
| `video/` | see below | Re-encoded brand film |

## brand/

`docs/logo.pdf` is pure Illustrator vector — no embedded rasters, no live fonts —
so it decomposes into **270 discrete paths**. Every triangle, arc and letterform is
separately addressable, which is what lets the page animate the ornament rather
than fade in a PNG of it.

| File | Contents |
|---|---|
| `wordmark.svg` | 13 paths — "Sougouba", the leaf, the gold dot, the two rules |
| `mark.svg` | Basket, contents and signal arcs |
| `basket.svg` | Basket and contents, arcs removed — the hero's fill target |
| `arcs.svg` | 3 arcs + dot, ids `arc-1`..`arc-3`, `arc-dot` |
| `logo-full.svg` | Everything, for OG images and print |
| `band.svg` | The woven band, **authored** — see below |
| `band-dark.svg` | The same weave, retoned for the forest and graphite slabs |

**Never re-set the wordmark in a font, recolour it, or redraw the leaf.** Clear
space equals the height of the lowercase *o*.

### The band is authored, not extracted

In the logo the band wraps a three-dimensional basket, so its triangles are
perspective-warped and its baseline curves. Lifted straight out it cannot tile and
cannot sit flat between two sections. What carries the brand is the *motif* —
interlocking triangles, point-down forest with an inset dot alternating with
point-up terracotta, an occasional mustard — so the motif is rebuilt flat and
seamlessly tileable, in the app's token palette rather than the logo's literal
olive and orange.

**Usage:** the tile is exactly **192 × 24 (8:1)**, on purpose. Browsers tile a CSS
background at subpixel widths when the ratio is awkward and the rounding shows as
a hairline seam at every repeat; at 8:1, `background-size: auto Npx` always lands
on whole pixels for integer `N`.

```css
background: url(/brand/band.svg) repeat-x;
background-size: auto 24px;   /* or 32, 48 — any integer */
```

For the **weave-in animation**, render it as inline SVG instead and stagger on the
`data-i` attribute each triangle carries (24 ms apart, capped at 400 ms). Triangles
`-1` and `12` are deliberate overdraw at the tile edges — the down-triangle that
straddles the join gets its left half from one tile and its right half from the
next, and the dot colours are cycled so the two halves match.

Use `band-dark.svg` on any ground darker than `neutral-300`. On the forest slab the
light band's forest triangles sink into the background and leave the dots floating.

## img/

`_master/` holds the fetched originals and is cached — re-running to change sizes
or quality costs no network requests. `manifest.json` carries intrinsic dimensions,
aspect ratios, French alt text and the Pexels credit for every photo.

The four photographs are **re-cut from the same Pexels originals** the app uses, at
the aspect the web needs. The app's copies are 1400×2800 portrait crops made for a
phone screen; a 1400px-wide source upscales about 1.8× on a 2560px display, which
is exactly the softness a brand section cannot afford.

### ⚠ Two photographs are used twice in the asset set

`assets/images/CREDITS.md` records the same Pexels id against two entries, twice:

| Pexels id | Used by | Risk |
|---|---|---|
| **35185310** | `onboarding/spices` **and** `vnd_souk_medina` | **High** — §05's full-bleed ingredient wall is this photo. If a vendor cover for Souk El Medina appears anywhere on the same page, the same photograph runs twice. |
| **21531369** | `onboarding/table` **and** `prd_couscous_fin` | Lower — a product photo, less likely to appear on the landing page. |

`scripts/fetch-product-images.mjs` dedupes picked photos across the catalogue, but
the onboarding four were hand-picked outside that script, so the dedupe never saw
them. **This is an app-side bug as much as a web one.**

Until it is fixed at the source: do not place `vnd_souk_medina`'s cover on the same
page as the spices wall.

## video/

```
ffmpeg -i assets/video/splashscreen.mp4 -an -c:v libx264 -profile:v high -crf 24 \
  -preset slow -pix_fmt yuv420p -movflags +faststart web/public/video/brand-film.mp4
ffmpeg -i assets/video/splashscreen.mp4 -an -c:v libsvtav1 -crf 38 -preset 6 \
  -pix_fmt yuv420p web/public/video/brand-film.webm
```

1.4 MB → 749 KB (H.264) / 315 KB (AV1). Silent, so `muted playsinline
preload="metadata"` with `brand-film-poster.jpg`.

**This asset may not be needed.** The hero re-tells the film's narrative in SVG and
the master prompt is explicit that the film is not the hero background. It is
prepared in case the final CTA or an OG video wants it; if nothing uses it by the
end of Phase 6, delete it rather than shipping 1 MB nobody requests.
