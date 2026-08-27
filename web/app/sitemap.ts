import type { MetadataRoute } from 'next';
import { site } from '@/lib/content';

/** One page, one language. No alternates, because there is no second language. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `https://${site.domain}/`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
    },
  ];
}
