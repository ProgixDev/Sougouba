import type { MetadataRoute } from 'next';
import { site } from '@/lib/content';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // A design-system route is not a page; it should never appear in results.
      disallow: ['/styleguide'],
    },
    sitemap: `https://${site.domain}/sitemap.xml`,
  };
}
