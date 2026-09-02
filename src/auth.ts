import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Context } from "hono";
import type { Env } from "./env";

export interface AuthUser {
  id: string;
  email?: string;
}

// Shared Hono generic (Bindings + the "user" Variable the auth middleware
// sets) — defined once here so index.ts's app and this file's Context type
// can't drift apart.
export type AppBindings = { Bindings: Env; Variables: { user: AuthUser } };

// createRemoteJWKSet caches the key set (and handles refetch/rotation)
// internally, so keeping one instance per isolate — rather than building it
// on every request — avoids an extra fetch to Supabase per API call.
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedForUrl: string | null = null;

function getJwks(supabaseUrl: string) {
  if (!cachedJwks || cachedForUrl !== supabaseUrl) {
    cachedJwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
    cachedForUrl = supabaseUrl;
  }
  return cachedJwks;
}

// Verifies the `Authorization: Bearer <token>` header against the
// project's Supabase Auth JWKS (asymmetric signing keys — no shared secret
// needed on the Worker side). Returns null for a missing/invalid/expired
// token; callers decide whether that means 401 or "anonymous is fine".
export async function verifyAuth(c: Context<AppBindings>): Promise<AuthUser | null> {
  if (!c.env.SUPABASE_URL) return null;

  const header = c.req.header("Authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;

  try {
    const { payload } = await jwtVerify(match[1], getJwks(c.env.SUPABASE_URL), {
      issuer: `${c.env.SUPABASE_URL}/auth/v1`,
    });
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    return {
      id: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
    };
  } catch {
    return null;
  }
}
