'use client';

/*
 * Plain `<a>` rather than `next/link`, on purpose.
 *
 * This boundary catches a failure in the root layout, which means the router
 * may be part of what failed. A client-side navigation would then do nothing
 * and leave somebody stuck on an error page whose buttons are ornamental. A
 * full page load always works.
 */
/* eslint-disable @next/next/no-html-link-for-pages */

/**
 * The last boundary: an error in the root layout itself.
 *
 * `error.tsx` catches a failure inside a page, and renders inside the site's
 * own chrome. This one catches a failure in the chrome — the header, the
 * footer, the fonts, the layout's own data — which means none of that is
 * available to render a recovery page with. So it brings its own `<html>` and
 * `<body>`, as Next.js requires, and its own styles inline.
 *
 * It exists because without it this case renders Next's unstyled default page,
 * which says "Application error: a client-side exception has occurred" and
 * offers nothing — no way home, no way to search, no indication that this is
 * even the right website.
 *
 * It uses no component, no stylesheet and no font from this project, on
 * purpose: whatever broke may be one of them.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en-IN">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem 1rem',
          background: '#fdfcfa',
          color: '#1d1b19',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          lineHeight: 1.55,
        }}
      >
        <main style={{ maxWidth: '34rem', textAlign: 'center' }}>
          <p
            style={{
              margin: '0 0 1.5rem',
              fontSize: '0.75rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#78716c',
            }}
          >
            Shree Classified
          </p>
          <h1 style={{ margin: '0 0 0.75rem', fontSize: '1.6rem', fontWeight: 600 }}>
            Something went wrong
          </h1>
          <p style={{ margin: '0 0 1.75rem', color: '#57534e' }}>
            The page could not be loaded. This has been recorded. Trying again usually works.
          </p>

          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: '0.7rem 1.2rem',
                font: 'inherit',
                fontWeight: 500,
                color: '#ffffff',
                background: '#b3121b',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: '0.7rem 1.2rem',
                font: 'inherit',
                fontWeight: 500,
                color: '#1d1b19',
                background: '#ffffff',
                border: '1px solid #dfdbd5',
                borderRadius: '4px',
                textDecoration: 'none',
              }}
            >
              Back to home
            </a>
            <a
              href="/classifieds"
              style={{
                padding: '0.7rem 1.2rem',
                font: 'inherit',
                fontWeight: 500,
                color: '#1d1b19',
                background: '#ffffff',
                border: '1px solid #dfdbd5',
                borderRadius: '4px',
                textDecoration: 'none',
              }}
            >
              Browse classifieds
            </a>
          </div>

          {/*
            The digest and nothing else. It is an opaque identifier Next.js
            gives the error, and it is what lets the office match a report from
            somebody to a line in the server log — without the message, the
            stack or the path reaching the browser.
          */}
          {error.digest ? (
            <p style={{ marginTop: '1.75rem', fontSize: '0.75rem', color: '#78716c' }}>
              Reference: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
