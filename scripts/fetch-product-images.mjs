#!/usr/bin/env node
/**
 * Bundles one photo per seeded product and vendor.
 *
 * Sources, in preference order:
 *   1. Pexels — professional food photography, and its search relevance is far
 *      better than anything keyless. Used when PEXELS_API_KEY is set.
 *   2. Openverse (`rawpixel` CC0 stock, then flickr/wikimedia) — keyless, but
 *      noisy, so candidates are scored rather than taken in rank order.
 *   3. Wikimedia Commons — decent for produce and regional dishes.
 * Unsplash is not used: its search sits behind a proof-of-work bot challenge.
 *
 * The key is read from the environment and never written to disk:
 *   PEXELS_API_KEY=… node scripts/fetch-product-images.mjs
 *
 * ⚠️ Openverse anonymous limits are 20/min and **200/day**. Every HTTP response
 * is cached under `.image-cache/`, so a re-run after tuning costs zero requests.
 * Delete that directory to force a refetch.
 *
 * Usage:
 *   node scripts/fetch-product-images.mjs             # fetch everything missing
 *   node scripts/fetch-product-images.mjs --report    # score only, download nothing
 *   node scripts/fetch-product-images.mjs --only=prd_gari,prd_jollof
 *   node scripts/fetch-product-images.mjs --force     # re-download existing files
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = `${ROOT}/assets/images/catalog`;
const CACHE_DIR = `${ROOT}/.image-cache`;
const TARGET_WIDTH = 900;
const UA = 'sougouba-prototype/1.0 (contact: develop@yipyy.com)';

const PEXELS_KEY = process.env.PEXELS_API_KEY ?? '';

const argv = process.argv.slice(2);
const REPORT_ONLY = argv.includes('--report');
const DIAGNOSE = argv.includes('--diagnose');
const FORCE = argv.includes('--force');
const ONLY = (argv.find((a) => a.startsWith('--only=')) ?? '').replace('--only=', '')
  .split(',').filter(Boolean);

/** Minimum score for a candidate to be accepted rather than falling through. */
const MIN_SCORE = 5;

// ── search terms ─────────────────────────────────────────────────────────────
/**
 * Product names are French and often untranslated loanwords ("bissap",
 * "jaxatu", "attiéké") that stock libraries do not index, so each product gets
 * an English query a photographer would plausibly have tagged.
 */
const QUERY = {
  prd_mangue_kent: 'ripe mango fruit',
  prd_banane_plantain: 'plantain bananas',
  prd_gombo_frais: 'fresh okra pods',
  prd_riz_brise: 'white rice grains bowl',
  prd_piment_frais: 'red chili peppers',
  prd_igname: 'yam root vegetable',
  prd_manioc: 'cassava root',
  prd_farine_fonio: 'millet grain bowl',
  prd_couscous_moyen: 'couscous grains bowl',
  prd_ras_el_hanout: 'ras el hanout spice blend',
  prd_harissa_artisanale: 'red chili paste bowl',
  prd_huile_argan: 'oil bottle glass',
  prd_pain_khobz: 'round flatbread loaf',
  prd_olives_beldi: 'black olives bowl',
  prd_semoule_fine: 'semolina flour bowl',
  prd_the_menthe: 'mint tea glass',
  prd_agneau_hache: 'raw minced lamb',
  prd_poulet_fermier: 'raw whole chicken',
  prd_merguez_maison: 'raw sausages',
  prd_boeuf_hache: 'raw ground beef',
  prd_gigot_agneau: 'raw lamb leg',
  prd_brochettes_poulet: 'raw chicken skewers',
  prd_foie_veau: 'raw liver slices',
  prd_thieboudienne: 'thieboudienne senegalese rice fish',
  prd_mafe_boeuf: 'mafe peanut stew beef',
  prd_yassa_poulet: 'yassa chicken onion',
  prd_pastels: 'fried fish pastel empanada',
  prd_accara: 'akara bean fritters',
  prd_jus_bissap: 'bissap hibiscus drink',
  prd_jus_gingembre: 'ginger drink glass',
  prd_jus_bouye: 'baobab juice glass',
  prd_cornes_gazelle: 'gazelle horns almond pastry',
  prd_baklava_assortiment: 'baklava pastry',
  prd_makroudh: 'makroud date pastry',
  prd_lben: 'buttermilk glass',
  prd_chebakia: 'honey sesame pastry',
  prd_zlabia: 'zlabia jalebi syrup pastry',
  prd_raib: 'yogurt dessert bowl',
  prd_riz_parfume: 'jasmine rice bowl',
  prd_niebe: 'dried black eyed peas',
  prd_patate_douce: 'sweet potatoes',
  prd_aubergine_africaine: 'small green eggplants',
  prd_huile_palme: 'red palm oil',
  prd_poudre_baobab: 'baobab fruit powder',
  prd_bissap_sec: 'dried hibiscus flowers',
  prd_lait_caille: 'yogurt bowl',
  prd_safran: 'saffron threads',
  prd_cumin_moulu: 'cumin spice powder',
  prd_citron_confit: 'preserved lemons jar',
  prd_smen: 'clarified butter ghee',
  prd_tajine_agneau: 'lamb tagine moroccan',
  prd_briouates: 'samosa pastry triangles fried',
  prd_couscous_fin: 'couscous grains',
  prd_dattes_deglet: 'medjool dates bowl',
  prd_sukuma_wiki: 'sukuma wiki collard greens',
  prd_farine_ugali: 'ugali maize flour',
  prd_chevre_morceaux: 'raw goat meat',
  prd_tilapia_entier: 'whole raw fish tilapia',
  prd_arachides_grillees: 'roasted peanuts bowl',
  prd_pate_arachide: 'peanut butter jar',
  prd_pilipili: 'piri piri chili sauce',
  prd_chapati: 'chapati flatbread',
  prd_pain_tabouna: 'rustic round bread loaf',
  prd_msemen: 'msemen square folded flatbread',
  prd_baghrir: 'baghrir semolina pancake',
  prd_kaak_warka: 'almond filled pastry ring dessert',
  prd_ghriba: 'ghriba almond cookies',
  prd_jben: 'fresh white cheese',
  prd_yaourt_maison: 'plain yogurt jar',
  prd_cafe_turc: 'ground coffee powder',
  prd_jollof: 'jollof rice plate',
  prd_kelewele: 'kelewele fried plantain',
  prd_sauce_graine: 'thick red palm stew',
  prd_attieke_poisson: 'attieke grilled fish',
  prd_soupe_arachide: 'creamy groundnut peanut soup',
  prd_puff_puff: 'puff puff fried dough',
  prd_sobolo: 'sobolo hibiscus drink',
  prd_gari: 'gari cassava granules',

  vnd_marche_bamako: 'grocery store shelves',
  vnd_epicerie_atlas: 'spice shop market stall',
  vnd_boucherie_sahel: 'butcher shop counter',
  vnd_saveurs_dakar: 'african restaurant interior table',
  vnd_douceurs_maghreb: 'pastry shop display',
  vnd_teranga: 'market vegetable stall',
  vnd_souk_medina: 'moroccan souk spices',
  vnd_kilimandjaro: 'african market produce',
  vnd_boulangerie_tanit: 'bakery bread display',
  vnd_mama_adjoa: 'home cooking pot stew',
};

const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'with', 'and', 'in', 'on', 'for']);

/**
 * Titles containing these usually mean a composed dish, a plant in the ground,
 * or a shop scene — wrong when the catalogue wants the item itself.
 */
const NOISE = [
  'recipe', 'restaurant', 'menu', 'cafe', 'tree', 'plant', 'farm', 'field',
  'garden', 'seedling', 'flower show', 'logo', 'poster', 'illustration',
  'drawing', 'painting', 'engraving', 'map', 'coin', 'stamp', 'portrait',
  'woman', 'man', 'child', 'people', 'hand', 'selfie', 'wedding', 'birthday',
  'dog', 'cat', 'sign', 'label', 'packaging', 'box of', 'supermarket aisle',
];

/** These read as “clean catalogue shot”. */
const GOOD = ['white background', 'isolated', 'closeup', 'close-up', 'close up', 'fresh', 'bowl', 'studio'];

function tokens(text) {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
    .map(stem);
}

/**
 * Crude singular/plural fold. Without it "mango" misses "mangoes" and "pod"
 * misses "pods", which silently sank correct candidates.
 */
function stem(token) {
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

/** Whole-word for single terms, substring for multi-word phrases. */
function hasPhrase(titleTokens, title, needle) {
  return needle.includes(' ') ? title.includes(needle) : titleTokens.has(needle);
}

function scoreCandidate(candidate, queryTokens) {
  const title = (candidate.title ?? '').toLowerCase();
  const titleTokens = new Set(tokens(title));

  const matched = queryTokens.filter((t) => titleTokens.has(t));
  // Nothing in common with the query is an automatic reject: Openverse
  // relevance is loose enough to return bananas for "ripe mango fruit".
  if (matched.length === 0) return -Infinity;

  let score = matched.length * 3;
  if (matched.length === queryTokens.length) score += 3;

  if (candidate.provider === 'rawpixel') score += 6;
  else if (candidate.provider === 'wikimedia') score += 2;

  if (GOOD.some((g) => title.includes(g))) score += 2;
  // Whole-word only. Substring matching made 'man' fire on "mangoes", 'cat' on
  // "delicate" and 'sign' on "design", which buried perfectly good candidates.
  score -= NOISE.filter((n) => hasPhrase(titleTokens, title, n)).length * 4;

  // Long titles usually mean a plated composition listing several dishes — but
  // only for providers whose title is a real caption. The Pexels title is
  // deliberately caption + URL slug, so its length carries no such signal and
  // penalising it buried good matches.
  if (candidate.provider !== 'pexels') {
    const wordCount = title.split(/\s+/).filter(Boolean).length;
    if (wordCount > 5) score -= (wordCount - 5) * 0.4;
  }

  const w = candidate.width ?? 0;
  const h = candidate.height ?? 0;
  if (Math.min(w, h) >= 800) score += 1.5;
  else if (Math.min(w, h) < 400) score -= 3;
  if (w && h) {
    const aspect = Math.max(w, h) / Math.min(w, h);
    if (aspect > 2.2) score -= 3; // panoramas crop badly into a square tile
  }

  return score;
}

// ── cached HTTP ──────────────────────────────────────────────────────────────
let liveRequests = 0;

async function getJson(url, extraHeaders = {}) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const key = createHash('sha1').update(url).digest('hex');
  const file = `${CACHE_DIR}/${key}.json`;
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));

  liveRequests++;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json', ...extraHeaders },
  });
  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  writeFileSync(file, JSON.stringify(json));
  // Openverse allows 20/min; Pexels 200/hour. Pace to the stricter one only
  // when we actually hit Openverse.
  await new Promise((r) => setTimeout(r, url.includes('openverse') ? 3200 : 250));
  return json;
}

// ── providers ────────────────────────────────────────────────────────────────
async function openverse(query) {
  const url =
    'https://api.openverse.org/v1/images/?' +
    new URLSearchParams({
      q: query,
      source: 'rawpixel,flickr,wikimedia',
      license_type: 'commercial',
      mature: 'false',
      page_size: '20',
    });
  const data = await getJson(url);
  return (data.results ?? []).map((r) => ({
    url: r.url,
    width: r.width,
    height: r.height,
    title: r.title,
    provider: r.source,
    credit: `${r.creator ?? 'Inconnu'} — ${r.source}`,
    licence: (r.license ?? '').toUpperCase(),
    sourceUrl: r.foreign_landing_url ?? r.url,
  }));
}

/** `…/photo/close-up-of-fresh-okra-1234567/` → `close up of fresh okra`. */
function slugWords(url) {
  const slug = (url ?? '').replace(/\/$/, '').split('/').pop() ?? '';
  return slug.replace(/-\d+$/, '').replace(/-/g, ' ');
}

async function pexels(query) {
  if (!PEXELS_KEY) return [];
  const url =
    'https://api.pexels.com/v1/search?' +
    // No orientation/size filter: those cut the pool down so far that Pexels
    // starts returning marginal matches (a lotus seed pod for "fresh okra
    // pods"). The square crop is applied by URL below, so square originals
    // are not needed.
    new URLSearchParams({ query, per_page: '15' });
  const data = await getJson(url, { Authorization: PEXELS_KEY });
  return (data.photos ?? []).map((p, index) => ({
    // Server-side square crop, so the tile is filled without letterboxing.
    url: `${p.src.original}?auto=compress&cs=tinysrgb&fit=crop&w=${TARGET_WIDTH}&h=${TARGET_WIDTH}`,
    width: TARGET_WIDTH,
    height: TARGET_WIDTH,
    // Score against the caption *and* the URL slug — the slug is usually the
    // more literal description ("close-up-of-okra-on-a-wooden-table").
    title: `${p.alt ?? ''} ${slugWords(p.url)}`.trim() || query,
    rank: index,
    provider: 'pexels',
    credit: `${p.photographer} — Pexels`,
    licence: 'Pexels Licence',
    sourceUrl: p.url,
  }));
}

async function wikimedia(query) {
  const url =
    'https://commons.wikimedia.org/w/api.php?' +
    new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: query,
      gsrnamespace: '6',
      gsrlimit: '15',
      prop: 'imageinfo',
      iiprop: 'url|size|extmetadata',
      iiurlwidth: String(TARGET_WIDTH),
      format: 'json',
    });
  const data = await getJson(url);
  const pages = data?.query?.pages ?? {};
  return Object.values(pages)
    .map((p) => {
      const info = p.imageinfo?.[0];
      if (!info?.thumburl) return null;
      const meta = info.extmetadata ?? {};
      return {
        url: info.thumburl,
        width: info.width,
        height: info.height,
        title: (p.title ?? '').replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/_/g, ' '),
        provider: 'wikimedia',
        credit: stripTags(meta.Artist?.value) || 'Wikimedia Commons',
        licence: meta.LicenseShortName?.value ?? 'CC',
        sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
      };
    })
    .filter(Boolean)
    // Commons is full of diagrams, maps and scans; keep photographs.
    .filter((c) => /\.(jpe?g)$/i.test(c.url.split('?')[0]) || c.url.includes('/thumb/'));
}

function stripTags(html) {
  return (html ?? '').replace(/<[^>]*>/g, '').trim().slice(0, 60);
}

const PROVIDERS = PEXELS_KEY ? [pexels, openverse, wikimedia] : [openverse, wikimedia];

/**
 * Photos already claimed, so no two catalogue entries show the same picture —
 * the first full run gave baghrir and msemen an identical image, and handed the
 * Saveurs de Dakar storefront the same plate as the jollof product.
 * Seeded from CREDITS.md so re-runs respect earlier picks.
 */
const usedPhotos = new Set();

function seedUsedPhotos() {
  const file = `${ROOT}/assets/images/CREDITS.md`;
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const source = line.match(/\| (https?:\/\/\S+) \|\s*$/)?.[1];
    if (source) usedPhotos.add(source);
  }
}

async function bestFor(id) {
  const query = QUERY[id];
  if (!query) return { error: 'no query defined' };
  const queryTokens = tokens(query);

  let best = null;
  for (const provider of PROVIDERS) {
    let candidates = [];
    try {
      candidates = await provider(query);
    } catch (e) {
      if (e.message === 'RATE_LIMITED') throw e;
      continue;
    }
    candidates = candidates.filter((c) => !usedPhotos.has(c.sourceUrl));
    if (candidates.length === 0) continue;

    // Every provider is scored, including Pexels. Taking Pexels' top hit
    // blindly gave a Vietnamese street scene for "ripe mango fruit"; scoring
    // only by title handed okra to a Wikimedia taxonomy photo of Proboscidea
    // parviflora. Both need the same test: does the description actually
    // mention what we asked for?
    let providerBest = null;
    for (const candidate of candidates) {
      const score = scoreCandidate(candidate, queryTokens);
      if (!providerBest || score > providerBest.score) providerBest = { ...candidate, score };
    }
    if (DIAGNOSE && providerBest) {
      console.log(`      ${provider.name.padEnd(10)} ${providerBest.score.toFixed(1).padStart(6)}  ${(providerBest.title ?? '').slice(0, 58)}`);
    }
    if (providerBest && (!best || providerBest.score > best.score)) best = providerBest;

    // Once Pexels clears the bar, stop. Its photography is categorically better
    // than Commons', and Commons kept winning on score alone purely because its
    // long taxonomic titles match more query tokens — a scoring artefact, not a
    // better picture. Stopping here also spares the Openverse daily budget.
    if (providerBest?.provider === 'pexels' && providerBest.score >= MIN_SCORE) break;
    if (best && best.score >= MIN_SCORE + 4) break;
  }
  if (!best || best.score < MIN_SCORE) return { error: 'no candidate above threshold', best };
  return { pick: best };
}

// ── main ─────────────────────────────────────────────────────────────────────
function parseEntities(file, prefix) {
  const src = readFileSync(`${ROOT}/data/seed/${file}`, 'utf8');
  return src
    .split(/\n  \{\n/)
    .slice(1)
    .map((block) => {
      const id = block.match(new RegExp(`id: '(${prefix}_[a-z_0-9]+)'`))?.[1];
      const name = block.match(/name: '([^']*)'/)?.[1];
      return id ? { id, name } : null;
    })
    .filter(Boolean);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  seedUsedPhotos();

  const products = parseEntities('products.ts', 'prd');
  const vendors = parseEntities('vendors.ts', 'vnd');
  let entities = [...products, ...vendors];
  if (ONLY.length) entities = entities.filter((e) => ONLY.includes(e.id));

  console.log(`${entities.length} entities · cache ${existsSync(CACHE_DIR) ? readdirSync(CACHE_DIR).length : 0} entries\n`);

  const credits = [];
  const missing = [];
  let rateLimited = false;

  for (const entity of entities) {
    const dest = `${OUT_DIR}/${entity.id}.jpg`;
    if (existsSync(dest) && !FORCE && !REPORT_ONLY) {
      console.log(`  have   ${entity.id}`);
      continue;
    }

    let result;
    try {
      result = await bestFor(entity.id);
    } catch (e) {
      if (e.message === 'RATE_LIMITED') {
        console.log('\n⚠️  Openverse daily/burst limit reached — stopping. Re-run later; cached work is kept.');
        rateLimited = true;
        break;
      }
      result = { error: e.message };
    }

    if (!result.pick) {
      console.log(`  MISS   ${entity.id}  (${result.error}${result.best ? `, best ${result.best.score.toFixed(1)}: ${result.best.title}` : ''})`);
      missing.push(entity.id);
      continue;
    }

    const { pick } = result;
    usedPhotos.add(pick.sourceUrl);
    console.log(`  pick   ${entity.id}  [${pick.score.toFixed(1)} ${pick.provider}] ${(pick.title ?? '').slice(0, 46)}`);
    if (REPORT_ONLY) continue;

    try {
      const img = await fetch(pick.url, { headers: { 'User-Agent': UA } });
      if (!img.ok) throw new Error(`download ${img.status}`);
      writeFileSync(dest, Buffer.from(await img.arrayBuffer()));
      // Square-crop then resize: cards and the hero both render square tiles.
      execFileSync('sips', ['-Z', String(TARGET_WIDTH), dest], { stdio: 'ignore' });
      credits.push({ id: entity.id, name: entity.name, ...pick });
    } catch (e) {
      console.log(`  FAIL   ${entity.id}  ${e.message}`);
      missing.push(entity.id);
    }
  }

  if (!REPORT_ONLY) {
    writeGeneratedMap(products, vendors);
    writeCredits(credits);
  }

  console.log(`\nlive requests this run: ${liveRequests}`);
  console.log(`downloaded: ${credits.length} · missing: ${missing.length}`);
  if (missing.length) console.log(`still placeholder: ${missing.join(', ')}`);
  if (rateLimited) process.exitCode = 2;
}

function writeGeneratedMap(products, vendors) {
  const line = (e) =>
    existsSync(`${OUT_DIR}/${e.id}.jpg`)
      ? `  ${e.id}: require('@/assets/images/catalog/${e.id}.jpg'),`
      : null;
  const body = (list) => list.map(line).filter(Boolean).join('\n');

  writeFileSync(
    `${ROOT}/data/images.generated.ts`,
    `// GENERATED by scripts/fetch-product-images.mjs — do not edit by hand.\n` +
      `// Metro cannot resolve require() with a computed path, so every entry is literal.\n` +
      `// Anything absent renders the branded placeholder in components/ui/CatalogImage.tsx.\n` +
      `import type { ImageSourcePropType } from 'react-native';\n\n` +
      `export const productImages: Record<string, ImageSourcePropType> = {\n${body(products)}\n};\n\n` +
      `export const vendorImages: Record<string, ImageSourcePropType> = {\n${body(vendors)}\n};\n`
  );
}

function writeCredits(credits) {
  if (credits.length === 0) return;
  const existing = existsSync(`${ROOT}/assets/images/CREDITS.md`)
    ? readFileSync(`${ROOT}/assets/images/CREDITS.md`, 'utf8')
    : '';
  const rows = new Map();
  for (const line of existing.split('\n')) {
    const id = line.match(/^\| `([a-z_0-9]+)` \|/)?.[1];
    if (id) rows.set(id, line);
  }
  for (const c of credits) {
    rows.set(
      c.id,
      `| \`${c.id}\` | ${c.name ?? ''} | ${c.credit} | ${c.licence} | ${c.sourceUrl} |`
    );
  }
  writeFileSync(
    `${ROOT}/assets/images/CREDITS.md`,
    `# Image credits\n\n` +
      `Every photo below is free for commercial use under the stated licence.\n` +
      `CC-BY and CC-BY-SA require attribution — keep this file shipped with the app,\n` +
      `or surface it on a credits screen before any public release.\n\n` +
      `Regenerate with \`node scripts/fetch-product-images.mjs\`.\n\n` +
      `| Asset | Subject | Author | Licence | Source |\n|---|---|---|---|---|\n` +
      [...rows.values()].join('\n') +
      '\n'
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
