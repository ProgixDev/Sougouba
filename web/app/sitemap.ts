import type { MetadataRoute } from 'next';
import { site } from '@/lib/content';
import { REVIEWED, legalDocs } from '@/lib/legal';

/** One language throughout. No alternates, because there is no second language. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = `https://${site.domain}`;
  const now = new Date();

  return [
    { url: `${base}/`, lastModified: now, changeFrequency: 'monthly', priority: 1 },
    // Listed only once they are real documents. A sitemap entry for a page
    // served `noindex` is a contradiction we would rather not publish.
    ...(REVIEWED
      ? legalDocs.map((d) => ({
          url: `${base}/${d.slug}`,
          lastModified: now,
          changeFrequency: 'yearly' as const,
          priority: 0.3,
        }))
      : []),
  ];
}
