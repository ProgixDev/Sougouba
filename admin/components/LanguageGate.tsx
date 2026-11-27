'use client';
import { useEffect, useState } from 'react';

/**
 * Renders the app only in the browser.
 *
 * The language is known there and nowhere else (`lib/i18n`): the build's
 * prerender has no reader, so anything it rendered would be in French and
 * would have to be torn down for an English reader — a flash of the wrong
 * language, and a hydration mismatch on every text node. Rendering nothing
 * until the page is in a browser costs a blank frame, which every page behind
 * a sign-in already had.
 */
export function LanguageGate({ children }: { children: React.ReactNode }) {
  const [inBrowser, setInBrowser] = useState(false);
  useEffect(() => setInBrowser(true), []);
  return inBrowser ? <>{children}</> : null;
}
