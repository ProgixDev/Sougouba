#!/usr/bin/env node
/**
 * Builds the landing page's responsive imagery into web/public/img/.
 *
 * Why it re-fetches rather than reusing assets/images/onboarding/: those four are
 * 1400x2800 portrait crops cut for a phone screen (see lib/onboardingImages.ts).
 * The web page uses two of them full-bleed and landscape, where a 1400px-wide
 * source upscales about 1.8x on a 2560px display — exactly the softness a brand
 * section cannot afford. So the masters are re-cut from the same Pexels
 * originals, at the aspect each section actually needs, using the recipe
 * documented in assets/images/CREDITS.md. Same photographs, same licence, same
 * credits — different crop.
 *
 * Masters are cached in web/public/img/_master/ and only fetched when missing,
 * so re-running to change sizes or quality costs no requests.
 *
 * Run: node scripts/build-web-images.mjs [--force]
 * Needs: ffmpeg (AVIF via libsvtav1, JPEG) and cwebp (`brew install webp`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, statSync, copyFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'web/public/img');
const MASTERS = join(OUT, '_master');
const FORCE = process.argv.includes('--force');

/**
 * Pexels ids come from the credit rows in assets/images/CREDITS.md. `aspect` is
 * the crop the page needs, which is not the crop the app needed.
 */
const SOURCES = [
  { name: 'spices',   pexels: 35185310, master: [2560, 1440], widths: [768, 1280, 1920, 2560],
    alt: 'Étals d’épices au souk : piment moulu, safran et pigments en coupes ouvertes' },
  { name: 'market',   pexels: 5490824,  master: [2560, 1440], widths: [768, 1280, 1920, 2560],
    alt: 'Rayons d’épicerie : bocaux en verre, conserves et une balance en laiton' },
  { name: 'shopping', pexels: 32162465, master: [1600, 2000], widths: [480, 800, 1200, 1600],
    alt: 'Étal de marché : cageots de légumes et une main choisissant des œufs fermiers' },
  { name: 'table',    pexels: 21531369, master: [1600, 2000], widths: [480, 800, 1200, 1600],
    alt: 'Plat de couscous servi, photographié de près en lumière basse' },
];

/** Vendor covers ship as they are — 900x900, already cut square for cards. */
const VENDOR_WIDTHS = [320, 640];

const AVIF_CRF = 34;   // libsvtav1, 0-63. 34 holds detail in the spice pyramids.
const WEBP_Q = 76;
const JPEG_Q = 4;      // ffmpeg -q:v, 2 (best) - 31

function sh(cmd, args) {
  execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
}

function fetchMaster({ name, pexels, master }) {
  const dest = join(MASTERS, `${name}.jpg`);
  if (existsSync(dest) && !FORCE) return dest;
  const [w, h] = master;
  const url = `https://images.pexels.com/photos/${pexels}/pexels-photo-${pexels}.jpeg`
    + `?auto=compress&cs=tinysrgb&w=${w}&h=${h}&fit=crop`;
  sh('curl', ['-sS', '--fail', '-o', dest, url]);
  console.log(`  fetched ${name}.jpg  ${w}x${h}`);
  return dest;
}

function derive(src, base, widths) {
  const made = [];
  for (const w of widths) {
    const scale = `scale=${w}:-2:flags=lanczos`;
    const avif = join(OUT, `${base}-${w}.avif`);
    const webp = join(OUT, `${base}-${w}.webp`);
    const jpg = join(OUT, `${base}-${w}.jpg`);
    if (FORCE || !existsSync(avif)) sh('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vf', scale, '-c:v', 'libsvtav1', '-crf', String(AVIF_CRF), '-f', 'avif', avif]);
    if (FORCE || !existsSync(jpg)) sh('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vf', scale, '-q:v', String(JPEG_Q), jpg]);
    if (FORCE || !existsSync(webp)) sh('cwebp', ['-quiet', '-q', String(WEBP_Q), '-resize', String(w), '0', src, '-o', webp]);
    made.push({ w, avif: statSync(avif).size, webp: statSync(webp).size, jpg: statSync(jpg).size });
  }
  return made;
}

mkdirSync(MASTERS, { recursive: true });
const manifest = { photos: {}, vendors: {} };

console.log('Masters:');
for (const s of SOURCES) {
  const src = fetchMaster(s);
  const sizes = derive(src, s.name, s.widths);
  manifest.photos[s.name] = {
    alt: s.alt,
    aspect: `${s.master[0]}/${s.master[1]}`,
    intrinsic: s.master,
    credit: `Pexels — https://www.pexels.com/photo/${s.pexels}/`,
    widths: s.widths,
  };
  const t = sizes.at(-1);
  console.log(`  ${s.name.padEnd(9)} ${s.widths.join(',')}  largest: avif ${(t.avif / 1024 | 0)}k · webp ${(t.webp / 1024 | 0)}k · jpg ${(t.jpg / 1024 | 0)}k`);
}

console.log('\nVendor covers:');
const catalog = join(ROOT, 'assets/images/catalog');
for (const f of readdirSync(catalog).filter((f) => f.startsWith('vnd_') && f.endsWith('.jpg'))) {
  const id = f.replace(/\.jpg$/, '');
  const src = join(catalog, f);
  derive(src, `vendors/${id}`, VENDOR_WIDTHS);
  manifest.vendors[id] = { aspect: '1/1', widths: VENDOR_WIDTHS };
}
console.log(`  ${Object.keys(manifest.vendors).length} covers at ${VENDOR_WIDTHS.join(',')}`);

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('\nWrote web/public/img/manifest.json');
