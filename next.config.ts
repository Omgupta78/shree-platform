import type { NextConfig } from 'next';

import { securityHeaders } from './src/lib/security/headers';

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  // A second build output for the local database-backed end-to-end suite,
  // which bakes different public environment values into its bundle.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  /*
   * The advertiser's dashboard lives at /my-ads — it was built there first, and
   * there is one dashboard, not two. These are the addresses the lifecycle
   * brief uses, kept working as aliases.
   */
  async redirects() {
    return [
      { source: '/dashboard', destination: '/my-ads', permanent: false },
      { source: '/dashboard/expired', destination: '/my-ads/expired', permanent: false },
      { source: '/dashboard/advertisements/:id', destination: '/my-ads/:id', permanent: false },
      { source: '/dashboard/advertisements/:id/renew', destination: '/my-ads/:id/renew', permanent: false },
      { source: '/dashboard/payments', destination: '/my-ads/payments', permanent: false },
      { source: '/dashboard/payments/:id', destination: '/my-ads/payments/:id', permanent: false },
      { source: '/dashboard/notifications', destination: '/my-ads/notifications', permanent: false },
      {
        source: '/dashboard/settings/notifications',
        destination: '/my-ads/settings/notifications',
        permanent: false,
      },
    ];
  },
  poweredByHeader: false,

  /*
   * Security headers on every route, so a page added later gets them without
   * anybody remembering to. What each one is for is in
   * `src/lib/security/headers.ts`, including an honest note about the one
   * compromise in the content policy.
   */
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders(supabaseHost) }];
  },
  images: {
    // Ad images are served from Supabase Storage; the host is derived from env
    // so nothing environment-specific is hardcoded here.
    remotePatterns: supabaseHost
      ? [{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }]
      : [],
  },
};

export default nextConfig;
