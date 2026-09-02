export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

  LLM_PROVIDER: string;
  ANTHROPIC_MODEL: string;
  GEMINI_MODEL: string;
  RATE_LIMIT_MAX_REQUESTS: string;
  RATE_LIMIT_WINDOW_SECONDS: string;

  // Supabase project URL — used to fetch the project's public JWKS to
  // verify the Authorization: Bearer <token> header on every /api/* call.
  // Not a secret (it's also embedded in the frontend, alongside the anon
  // key, to talk to Supabase Auth directly) — safe as a plain var.
  SUPABASE_URL: string;

  // Secrets — set with `wrangler secret put <NAME>`, never in wrangler.toml.
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
}
