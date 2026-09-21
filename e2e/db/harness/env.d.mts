export declare const JWT_SECRET: string;
export declare const GATEWAY_PORT: number;
export declare const POSTGREST_PORT: number;
export declare const APP_PORT: number;
export declare const DB_NAME: string;
export declare const PG: { host: string; port: string; user: string };
export declare const SUPABASE_URL: string;
export declare const DIST_DIR: string;
export declare const ANON_KEY: string;
export declare function signJwt(claims: Record<string, unknown>): string;
export declare function verifyJwt(token: string | null): Record<string, unknown> | null;
export declare const USERS: Record<
  'admin' | 'moderator' | 'advertiser',
  { id: string; email: string; password: string; name: string }
>;
