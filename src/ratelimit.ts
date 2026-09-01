import type { Env } from "./env";

// Simple sliding-window counter in D1, keyed by "<ip>:<route>". Good enough
// to blunt casual abuse of the unauthenticated /api/draft and /api/chat
// endpoints during the no-login "Prototype" stage — not a substitute for
// real per-user quotas once accounts exist.
export async function checkRateLimit(
  env: Env,
  ip: string,
  route: string,
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const max = Number(env.RATE_LIMIT_MAX_REQUESTS) || 20;
  const windowSeconds = Number(env.RATE_LIMIT_WINDOW_SECONDS) || 600;
  const bucketKey = `${ip}:${route}`;
  const now = Date.now();
  const windowStart = new Date(now - windowSeconds * 1000).toISOString();

  const { results } = await env.DB.prepare(
    "SELECT COUNT(*) as n FROM rate_limit_hits WHERE bucket_key = ? AND hit_at > ?",
  )
    .bind(bucketKey, windowStart)
    .all<{ n: number }>();

  const count = results?.[0]?.n ?? 0;
  if (count >= max) {
    return { allowed: false, retryAfterSeconds: windowSeconds };
  }

  await env.DB.prepare("INSERT INTO rate_limit_hits (bucket_key, hit_at) VALUES (?, ?)")
    .bind(bucketKey, new Date(now).toISOString())
    .run();

  // Best-effort cleanup so the table doesn't grow unbounded — cheap enough
  // to run inline at prototype traffic levels; move to a Cron Trigger if
  // this ever shows up in latency once traffic grows.
  if (Math.random() < 0.05) {
    const staleBefore = new Date(now - windowSeconds * 1000 * 4).toISOString();
    await env.DB.prepare("DELETE FROM rate_limit_hits WHERE hit_at < ?")
      .bind(staleBefore)
      .run();
  }

  return { allowed: true };
}
