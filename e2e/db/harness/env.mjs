import { createHmac } from 'node:crypto';

/**
 * Constants shared by the local database harness, the build and the tests.
 *
 * Everything here is for a throwaway database on this machine. The secret is
 * not a secret: it signs tokens that only the local PostgREST ever sees, and
 * it is deliberately named so nobody mistakes it for a real one.
 */
export const JWT_SECRET = 'shree-local-e2e-only-not-a-real-secret-0000';
export const GATEWAY_PORT = 54321;
export const POSTGREST_PORT = 54322;
export const APP_PORT = 3401;
export const DB_NAME = 'shree_e2e';
export const PG = { host: process.env.PGHOST ?? '/tmp', port: process.env.PGPORT ?? '5433', user: process.env.PGUSER ?? 'claude' };
export const SUPABASE_URL = `http://127.0.0.1:${GATEWAY_PORT}`;
export const DIST_DIR = '.next-db';

const b64 = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

export function signJwt(claims) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(claims);
  const sig = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

export function verifyJwt(token) {
  const [head, body, sig] = String(token).split('.');
  if (!head || !body || !sig) return null;
  const expected = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  if (expected !== sig) return null;
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (claims.exp && claims.exp * 1000 < Date.now()) return null;
  return claims;
}

export const ANON_KEY = signJwt({ role: 'anon', iss: 'shree-local', iat: 1_700_000_000, exp: 2_000_000_000 });

/** The people in the seed. Passwords exist only in this file and the gateway. */
export const USERS = {
  admin: { id: 'a1000000-0000-4000-8000-000000000001', email: 'admin@shree.test', password: 'local-admin-pass', name: 'Office Admin' },
  moderator: { id: 'a2000000-0000-4000-8000-000000000002', email: 'moderator@shree.test', password: 'local-mod-pass', name: 'Office Moderator' },
  advertiser: { id: 'a3000000-0000-4000-8000-000000000003', email: 'advertiser@shree.test', password: 'local-user-pass', name: 'Test Advertiser' },
};
