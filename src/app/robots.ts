import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Search result pages produce near-duplicate content and account
        // pages are private; neither belongs in an index.
        disallow: ['/account/', '/admin/', '/api/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
