import type { Metadata } from 'next';

/** Internal. Never indexed, never linked from the site. */
export const metadata: Metadata = {
  title: 'Système de design — Sougouba',
  robots: { index: false, follow: false },
};

export default function StyleguideLayout({ children }: { children: React.ReactNode }) {
  return children;
}
