/**
 * The HTTP security headers, and the reasoning for each.
 *
 * Applied in `next.config.ts` to every route, so a page added later gets them
 * without anybody remembering to.
 */

/**
 * Where the browser may load things from.
 *
 * One honest caveat, stated here rather than buried: `script-src` includes
 * `'unsafe-inline'`. A nonce-based policy is stricter and is what Next.js
 * documents — but a nonce can only be injected during server rendering, so
 * every statically rendered page (the home page, /about, /advertise,
 * /categories, /contact) would receive a policy naming a nonce that its
 * already-built HTML does not carry, and every script on it would be blocked.
 * The alternative is forcing the whole site to render dynamically, which costs
 * real speed on exactly the pages search engines fetch most.
 *
 * So this policy is defence in depth rather than the last line. The last line
 * is that this application renders no user-supplied HTML anywhere: every
 * advertisement title and description is rendered as text by React, and the
 * only `dangerouslySetInnerHTML` in the codebase is the JSON-LD serialiser,
 * which escapes `<`, `>` and `&` — see `lib/seo/jsonld.tsx`. That escaping is
 * the control that matters, and it has its own tests.
 *
 * Everything else is as tight as the integrations permit.
 */
export function contentSecurityPolicy(supabaseHost: string | undefined): string {
  const supabase = supabaseHost ? [`https://${supabaseHost}`, `wss://${supabaseHost}`] : [];

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],

    // Razorpay's checkout is a script served from their domain; it is the
    // whole of the payment interface and cannot be self-hosted.
    'script-src': ["'self'", "'unsafe-inline'", 'https://checkout.razorpay.com'],

    // Tailwind ships as a stylesheet, but Next.js inlines critical CSS and
    // React sets style attributes, both of which count as inline styles.
    'style-src': ["'self'", "'unsafe-inline'"],

    // `data:` for inlined placeholder graphics, `blob:` for the preview an
    // advertiser sees of their own photograph before it is uploaded.
    'img-src': ["'self'", 'data:', 'blob:', ...(supabaseHost ? [`https://${supabaseHost}`] : [])],

    'font-src': ["'self'", 'data:'],

    // Supabase for data and realtime, Razorpay for the order and for the
    // telemetry its checkout sends.
    'connect-src': [
      "'self'",
      ...supabase,
      'https://api.razorpay.com',
      'https://lumberjack.razorpay.com',
    ],

    // The checkout opens in an iframe.
    'frame-src': ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],

    // Nothing on this site is a plugin, and nothing should be.
    'object-src': ["'none'"],
    // A `<base>` tag injected into the page cannot repoint every relative URL.
    'base-uri': ["'self'"],
    // A form on this site cannot be made to post somewhere else.
    'form-action': ["'self'"],
    // Nobody may frame this site. Clickjacking an "approve advertisement"
    // button is the attack this prevents.
    'frame-ancestors': ["'none'"],
    // Any http:// subresource that slipped in is fetched over https instead.
    'upgrade-insecure-requests': [],
  };

  return Object.entries(directives)
    .map(([name, values]) => (values.length ? `${name} ${values.join(' ')}` : name))
    .join('; ');
}

export interface HttpHeader {
  key: string;
  value: string;
}

export function securityHeaders(supabaseHost: string | undefined): HttpHeader[] {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(supabaseHost) },
    {
      // Stops a browser guessing that an uploaded file is something more
      // interesting than the type it was served as.
      key: 'X-Content-Type-Options',
      value: 'nosniff',
    },
    {
      // The full URL goes to this site; another site is told only the origin.
      // An advertisement URL is not secret, but a `?next=` on a sign-in page
      // says where somebody was trying to go.
      key: 'Referrer-Policy',
      value: 'strict-origin-when-cross-origin',
    },
    {
      // This site asks for none of these, so none is granted — including to
      // anything it embeds.
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    },
    {
      // `frame-ancestors` above is the modern control and is what browsers
      // honour; this is for the older ones that do not read CSP.
      key: 'X-Frame-Options',
      value: 'DENY',
    },
    {
      // Two years, subdomains included. Browsers ignore it over plain http,
      // so it cannot lock out a local development server.
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    },
  ];
}
