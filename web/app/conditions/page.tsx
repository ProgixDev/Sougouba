import type { Metadata } from 'next';
import { LegalDocument } from '@/components/legal/LegalDocument';
import { REVIEWED, terms } from '@/lib/legal';

export const metadata: Metadata = {
  title: terms.metaTitle,
  description: terms.metaDescription,
  alternates: { canonical: `/${terms.slug}` },
  openGraph: { title: terms.metaTitle, description: terms.metaDescription, url: `/${terms.slug}` },
  // A page still carrying "à compléter" has no business in a search result.
  robots: REVIEWED ? { index: true, follow: true } : { index: false, follow: true },
};

export default function ConditionsPage() {
  return <LegalDocument doc={terms} />;
}
