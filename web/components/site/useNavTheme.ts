'use client';
import { useEffect, useState } from 'react';

/**
 * Which palette the sticky nav should wear, based on what is actually under it.
 *
 * Two sections are dark regardless of theme — the ingredient wall always, and the
 * merchant/courier chapters of the app section while they are active — so a nav
 * styled from the theme alone goes unreadable over them: in light mode the deep
 * forest wordmark disappears into the photograph, in dark mode the ivory one
 * disappears into a pale ground.
 *
 * Rather than wiring shared state between sections, the nav reads the DOM: any
 * element carrying data-nav-theme declares what the nav should be over it, and a
 * section whose ground changes as you scroll (ThreeApps) simply updates its own
 * attribute. Cheap, and there is one source of truth per section.
 */
const NAV_H = 72;

export function useNavTheme(): 'auto' | 'dark' {
  const [mode, setMode] = useState<'auto' | 'dark'>('auto');

  useEffect(() => {
    let raf = 0;
    const check = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        let dark = false;
        for (const el of document.querySelectorAll<HTMLElement>('[data-nav-theme]')) {
          const r = el.getBoundingClientRect();
          // Does this section occupy the band the nav sits in?
          if (r.top <= NAV_H && r.bottom >= 0) {
            dark = el.dataset.navTheme === 'dark';
          }
        }
        setMode(dark ? 'dark' : 'auto');
      });
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    // ThreeApps rewrites its own attribute as chapters change.
    const mo = new MutationObserver(check);
    mo.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['data-nav-theme'] });
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return mode;
}
