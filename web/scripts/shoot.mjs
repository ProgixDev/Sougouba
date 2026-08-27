#!/usr/bin/env node
/**
 * Phase review-gate screenshots.
 *
 * Shoots with reduced motion emulated on purpose: scroll reveals are hidden until
 * observed, and a full-page capture never scrolls, so without it everything below
 * the fold photographs as blank. Reduced motion is also the state the page must
 * look finished in.
 *
 * Usage: node scripts/shoot.mjs <outDir> [baseUrl] [path ...]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './cdp.mjs';

const [, , outDir = '/tmp/shots', base = 'http://localhost:4319', ...paths] = process.argv;
const PATHS = paths.length ? paths : ['/', '/styleguide'];
const SHOTS = [
  { w: 1280, scheme: 'light' },
  { w: 1280, scheme: 'dark' },
  { w: 375, scheme: 'light' },
];

mkdirSync(outDir, { recursive: true });
const b = await launch();
try {
  for (const path of PATHS) {
    for (const { w, scheme } of SHOTS) {
      const p = await b.newPage();
      await p.setColorScheme(scheme);
      await p.setReducedMotion(true);
      await p.setViewport(w, 1000, w < 768);
      await p.goto(`${base}${path}`, 1600);
      /*
       * Do NOT resize the viewport to the page height to "fit" the page. Any
       * section sized in vh then grows with it — the tracking section is 240vh,
       * so one resize took the document from 12k to 40k pixels. captureBeyondViewport
       * already grabs the whole page at the real viewport size.
       */
      const h = await p.evaluate('document.documentElement.scrollHeight');
      const png = await p.screenshot();
      const name = `${path.replace(/\//g, '_') || '_home'}-${w}-${scheme}.png`;
      writeFileSync(join(outDir, name), png);
      console.log(`${name}  ${(png.length / 1024) | 0}k  (${w}x${h})`);
      await p.close();
    }
  }
} finally {
  b.close();
}
