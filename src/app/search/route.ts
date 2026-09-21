import { NextResponse, type NextRequest } from 'next/server';

/**
 * `/search` predates the browsing pages and is superseded by `/classifieds`.
 * Kept as a redirect so any link already shared keeps working, carrying the
 * query term across.
 */
export function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q');
  const target = new URL('/classifieds', request.nextUrl.origin);
  if (q) target.searchParams.set('q', q);
  return NextResponse.redirect(target, 308);
}
