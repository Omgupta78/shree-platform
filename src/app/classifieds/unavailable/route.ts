import { CATEGORIES } from '@/config/categories';
import { SITE } from '@/config/site';

/**
 * The page a genuinely missing advertisement gets, with a genuine 404.
 *
 * A Route Handler rather than a page, and that is the whole reason it exists.
 * A page in this application cannot answer 404: the shell reads the session,
 * so the response has begun streaming as 200 before any page discovers its
 * advertisement is gone. A route handler writes its own status. The proxy
 * rewrites here when it has established, before rendering, that there is
 * nothing at the address — see `lib/seo/missing.ts`.
 *
 * It is a self-contained document rather than the application's own 404 page.
 * That is a trade made with open eyes: this page cannot use the site's React
 * layout, so it restates the masthead and the type in about thirty lines of
 * inline CSS. In exchange it is impossible for it to fail — no data, no
 * session, no fonts to fetch — which is a quality worth having in the one page
 * whose job is to be correct when something else has already gone wrong.
 *
 * It gives a visitor the three things a 404 should: a way to search, a way to
 * browse, and a way home.
 */
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return new Response(page(), {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Never cached. An advertisement that is 404 today may be a live
      // advertisement tomorrow, under the same slug, if it is renewed.
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, follow',
    },
  });
}

function page(): string {
  const categories = CATEGORIES.map(
    (category) =>
      `<li><a href="/classifieds/${escapeHtml(category.slug)}">${escapeHtml(category.name)}</a></li>`,
  ).join('');

  return `<!DOCTYPE html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, follow">
<title>Advertisement not found | ${escapeHtml(SITE.name)}</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #fdfcfa; --surface: #ffffff; --fg: #1d1b19;
    --muted: #57534e; --subtle: #78716c; --line: #dfdbd5; --primary: #b3121b;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #141312; --surface: #1d1b19; --fg: #f5f3f0;
      --muted: #b8b2ab; --subtle: #8c857d; --line: #302c28; --primary: #d4565e;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font-family: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
    line-height: 1.55; -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 42rem; margin: 0 auto; padding: 4rem 1rem 5rem; }
  .rule { height: 4px; background: var(--primary); }
  .brand {
    font-size: .75rem; letter-spacing: .14em; text-transform: uppercase;
    color: var(--subtle); margin: 0 0 1.5rem;
  }
  h1 {
    font-family: "Source Serif 4", Georgia, "Times New Roman", serif;
    font-size: clamp(1.75rem, 5vw, 2.25rem); font-weight: 600;
    margin: 0 0 .75rem; line-height: 1.2;
  }
  p { color: var(--muted); margin: 0 0 1rem; }
  form { display: flex; gap: .5rem; margin: 2rem 0 2.5rem; flex-wrap: wrap; }
  input[type=search] {
    flex: 1 1 14rem; min-width: 0; padding: .7rem .85rem; font: inherit;
    color: var(--fg); background: var(--surface);
    border: 1px solid var(--line); border-radius: 4px;
  }
  button, .btn {
    display: inline-block; padding: .7rem 1.15rem; font: inherit; font-weight: 500;
    border-radius: 4px; border: 1px solid transparent; cursor: pointer;
    background: var(--primary); color: #fff; text-decoration: none;
  }
  .btn.secondary {
    background: var(--surface); color: var(--fg); border-color: var(--line);
  }
  h2 { font-size: .8125rem; letter-spacing: .1em; text-transform: uppercase;
       color: var(--subtle); margin: 2.5rem 0 .75rem; font-weight: 600; }
  ul { list-style: none; padding: 0; margin: 0;
       display: flex; flex-wrap: wrap; gap: .5rem; }
  li a {
    display: inline-block; padding: .4rem .8rem; font-size: .9rem;
    border: 1px solid var(--line); border-radius: 999px;
    color: var(--fg); text-decoration: none; background: var(--surface);
  }
  li a:hover, .btn:hover { border-color: var(--primary); color: var(--primary); }
  .btn:hover { background: var(--surface); }
  .home { margin-top: 2.5rem; }
  .home a { color: var(--primary); }
</style>
</head>
<body>
<div class="rule"></div>
<div class="wrap">
  <p class="brand">${escapeHtml(SITE.name)}</p>
  <h1>We could not find that advertisement</h1>
  <p>
    It may have been withdrawn, or the address may have been mistyped. Nothing
    is published at this link.
  </p>

  <form action="/classifieds" method="get" role="search">
    <input type="search" name="q" placeholder="Search advertisements" aria-label="Search advertisements">
    <button type="submit">Search</button>
    <a class="btn secondary" href="/classifieds">Browse everything</a>
  </form>

  <h2>Sections</h2>
  <ul>${categories}</ul>

  <p class="home"><a href="/">Back to ${escapeHtml(SITE.name)}</a></p>
</div>
</body>
</html>`;
}

/** Category names come from configuration, but escaping is not optional. */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
