import { NextResponse, type NextRequest } from 'next/server';

import { isSupabaseConfigured } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Signing out.
 *
 * POST only. A GET would mean a link, an image or a prefetch could sign
 * somebody out, and the header's sign-out control is a form button for exactly
 * that reason.
 */
export async function POST(request: NextRequest) {
  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL('/', request.url), { status: 303 });
}
