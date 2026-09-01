export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

  LLM_PROVIDER: string;
  ANTHROPIC_MODEL: string;
  GEMINI_MODEL: string;
  RATE_LIMIT_MAX_REQUESTS: string;
  RATE_LIMIT_WINDOW_SECONDS: string;

  // Secrets — set with `wrangler secret put <NAME>`, never in wrangler.toml.
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
}
