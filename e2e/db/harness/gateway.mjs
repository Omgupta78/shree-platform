/**
 * A stand-in for the parts of Supabase the application talks to, for local
 * end-to-end tests only.
 *
 * - `/auth/v1/*`  — password sign-in, refresh, current user, sign-out. Users
 *                   and passwords come from env.mjs; ids match the seed.
 * - `/rest/v1/*`  — forwarded to a real PostgREST running against the local
 *                   Postgres, so every row the app reads or writes goes through
 *                   the same roles, grants, RLS policies and functions as it
 *                   would on Supabase.
 * - `/storage/v1` — answers enough for signed artwork links; the seed has no
 *                   files.
 *
 * It starts PostgREST itself and stops it on exit.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DB_NAME, GATEWAY_PORT, JWT_SECRET, PG, POSTGREST_PORT, USERS, signJwt, verifyJwt,
} from './env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const postgrestBin = process.env.POSTGREST_BIN ?? 'postgrest';

const postgrest = spawn(postgrestBin, [], {
  env: {
    ...process.env,
    PGRST_DB_URI: `postgres://authenticator@/${DB_NAME}?host=${encodeURIComponent(PG.host)}&port=${PG.port}`,
    PGRST_DB_SCHEMAS: 'public',
    PGRST_DB_ANON_ROLE: 'anon',
    PGRST_JWT_SECRET: JWT_SECRET,
    PGRST_SERVER_PORT: String(POSTGREST_PORT),
    PGRST_SERVER_HOST: '127.0.0.1',
    PGRST_DB_POOL: '5',
    PGRST_LOG_LEVEL: 'warn',
  },
  stdio: ['ignore', 'inherit', 'inherit'],
  cwd: here,
});
const stop = () => { postgrest.kill('SIGTERM'); process.exit(0); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
postgrest.on('exit', (code) => { console.error(`postgrest exited (${code})`); process.exit(1); });

const byEmail = new Map(Object.values(USERS).map((u) => [u.email, u]));
const byId = new Map(Object.values(USERS).map((u) => [u.id, u]));
const refreshTokens = new Map();

function userObject(u) {
  return {
    id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
    email_confirmed_at: '2026-01-01T00:00:00Z', confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { full_name: u.name }, identities: [],
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  };
}

function session(u) {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 3600;
  const access = signJwt({
    sub: u.id, role: 'authenticated', aud: 'authenticated', email: u.email,
    iat: now, exp: now + expiresIn, session_id: randomUUID(), aal: 'aal1',
  });
  const refresh = randomUUID();
  refreshTokens.set(refresh, u.id);
  return {
    access_token: access, token_type: 'bearer', expires_in: expiresIn,
    expires_at: now + expiresIn, refresh_token: refresh, user: userObject(u),
  };
}

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function bearer(req) {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

async function auth(req, res, url) {
  const route = url.pathname.slice('/auth/v1'.length);

  if (route === '/token' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      const u = byEmail.get(String(body.email ?? '').toLowerCase());
      if (!u || u.password !== body.password) {
        return send(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials', error: 'invalid_grant', error_description: 'Invalid login credentials' });
      }
      return send(res, 200, session(u));
    }
    if (grant === 'refresh_token') {
      const id = refreshTokens.get(body.refresh_token);
      if (!id) return send(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
      refreshTokens.delete(body.refresh_token);
      return send(res, 200, session(byId.get(id)));
    }
    return send(res, 400, { code: 400, msg: 'unsupported grant' });
  }

  if (route === '/user' && req.method === 'GET') {
    const claims = verifyJwt(bearer(req));
    const u = claims?.sub ? byId.get(claims.sub) : null;
    if (!u) return send(res, 401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' });
    return send(res, 200, userObject(u));
  }

  if (route === '/logout') {
    res.writeHead(204);
    return res.end();
  }

  return send(res, 404, { code: 404, msg: `auth route ${route} is not part of the local harness` });
}

const FORWARD = ['authorization', 'content-type', 'accept', 'prefer', 'range', 'range-unit', 'accept-profile', 'content-profile'];

async function rest(req, res, url) {
  const target = `http://127.0.0.1:${POSTGREST_PORT}${url.pathname.slice('/rest/v1'.length) || '/'}${url.search}`;
  const headers = {};
  for (const name of FORWARD) if (req.headers[name]) headers[name] = req.headers[name];
  // supabase-js sends the anon key as the bearer when nobody is signed in.
  if (!headers.authorization && req.headers.apikey) headers.authorization = `Bearer ${req.headers.apikey}`;
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
  const upstream = await fetch(target, { method: req.method, headers, body });
  const out = {};
  for (const name of ['content-type', 'content-range', 'content-location', 'preference-applied']) {
    const value = upstream.headers.get(name);
    if (value) out[name] = value;
  }
  res.writeHead(upstream.status, out);
  res.end(Buffer.from(await upstream.arrayBuffer()));
}

async function storage(req, res, url) {
  const match = url.pathname.match(/^\/storage\/v1\/object\/sign\/([^/]+)$/);
  if (match && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    const paths = body.paths ?? [];
    return send(res, 200, paths.map((p) => ({ path: p, signedURL: `/object/sign/${match[1]}/${p}?token=local`, error: null })));
  }
  return send(res, 404, { statusCode: '404', error: 'not_found', message: 'The local harness stores no files' });
}

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${GATEWAY_PORT}`);
      if (url.pathname === '/health') {
        const ok = await fetch(`http://127.0.0.1:${POSTGREST_PORT}/`).then((r) => r.ok).catch(() => false);
        return send(res, ok ? 200 : 503, { ok });
      }
      if (url.pathname.startsWith('/auth/v1')) return await auth(req, res, url);
      if (url.pathname.startsWith('/rest/v1')) return await rest(req, res, url);
      if (url.pathname.startsWith('/storage/v1')) return await storage(req, res, url);
      return send(res, 404, { msg: 'not found' });
    } catch (error) {
      console.error(error);
      send(res, 500, { msg: String(error) });
    }
  })
  .listen(GATEWAY_PORT, '127.0.0.1', () => console.log(`local supabase gateway on ${GATEWAY_PORT}`));
