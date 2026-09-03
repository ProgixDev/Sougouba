import type { Metadata } from 'next';
import { LegalDocument } from '@/components/legal/LegalDocument';
import { REVIEWED, privacy } from '@/lib/legal';

export const metadata: Metadata = {
  title: privacy.metaTitle,
  description: privacy.metaDescription,
  alternates: { canonical: `/${privacy.slug}` },
  openGraph: { title: privacy.metaTitle, description: privacy.metaDescription, url: `/${privacy.slug}` },
  // A page still carrying "à compléter" has no business in a search result.
  robots: REVIEWED ? { index: true, follow: true } : { index: false, follow: true },
};

export default function ConfidentialitePage() {
  return <LegalDocument doc={privacy} />;
}
