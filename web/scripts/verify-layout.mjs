#!/usr/bin/env node
/**
 * Horizontal-overflow audit at every breakpoint, in both themes.
 *
 * "No horizontal scroll" is a HIGH-severity rule and the easiest thing to break
 * without noticing: an unbreakable word or an oversized headline overflows its
 * block box WITHOUT widening it, so nothing reports a wide rect and the page just
 * scrolls sideways. The only reliable signal is documentElement.scrollWidth vs
 * clientWidth, measured after a real layout.
 *
 * Run at the end of every phase.
 * Usage: node scripts/verify-layout.mjs [baseUrl] [path ...]
 */
import { launch } from './cdp.mjs';

const [, , baseArg, ...pathArgs] = process.argv;
const BASE = baseArg ?? 'http://localhost:4319';
const PATHS = pathArgs.length ? pathArgs : ['/', '/styleguide'];
const WIDTHS = [375, 768, 1024, 1440];

const PROBE = `(() => {
  const d = document.documentElement;
  const over = [];
  if (d.scrollWidth > d.clientWidth) {
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.right > d.clientWidth + 1) {
        const c = typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '';
        over.push(el.tagName + '[' + c.slice(0, 46) + ']@' + Math.round(r.right));
      }
    }
  }
  return { scroll: d.scrollWidth, client: d.clientWidth, over: over.slice(0, 3) };
})()`;

const browser = await launch();
let failures = 0;
try {
  for (const scheme of ['light', 'dark']) {
    console.log(`\n=== ${scheme.toUpperCase()} ===`);
    for (const path of PATHS) {
      console.log(`  ${path}`);
      for (const width of WIDTHS) {
        const page = await browser.newPage();
        try {
          await page.setColorScheme(scheme);
          await page.setViewport(width, 900, width < 768);
          await page.goto(`${BASE}${path}`, 1100);
          const r = await page.evaluate(PROBE);
          const ok = r.scroll <= r.client;
          if (!ok) failures++;
          console.log(
            `    ${ok ? '.' : 'X'} ${String(width).padStart(4)}px  ${r.scroll}/${r.client}` +
              (r.over.length ? `  <- ${r.over.join(', ')}` : '')
          );
        } finally {
          await page.close();
        }
      }
    }
  }
} finally {
  browser.close();
}
console.log(failures ? `\n${failures} case(s) overflow horizontally.` : '\nNo horizontal overflow at any breakpoint, in either theme.');
process.exit(failures ? 1 : 0);
