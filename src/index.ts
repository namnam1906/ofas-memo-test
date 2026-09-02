import { Hono, type Context } from "hono";
import { getLLMProvider } from "./llm/provider";
import { LLMError } from "./llm/types";
import type { ChatTurn, InlineImage } from "./llm/types";
import { buildDraftSystemPrompt, buildDraftUserPrompt, CHAT_SYSTEM_PROMPT } from "./prompts";
import { checkRateLimit } from "./ratelimit";
import { verifyAuth, type AppBindings } from "./auth";

const app = new Hono<AppBindings>();

type AppContext = Context<AppBindings>;

function clientIp(c: AppContext): string {
  return c.req.header("CF-Connecting-IP") || c.req.header("x-forwarded-for") || "unknown";
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

async function withRateLimit(
  c: AppContext,
  route: string,
  next: () => Promise<Response>,
): Promise<Response> {
  const ip = clientIp(c);
  const result = await checkRateLimit(c.env, ip, route);
  if (!result.allowed) {
    return c.json(
      errorBody("rate_limited", "เรียกใช้งานถี่เกินไป กรุณารอสักครู่แล้วลองใหม่"),
      429,
    );
  }
  return next();
}

app.get("/api/health", (c) => c.json({ ok: true }));

// Every other /api/* route requires a signed-in user (Supabase Auth —
// see src/auth.ts). Applied here rather than per-route so a new endpoint
// can't accidentally ship unauthenticated.
app.use("/api/*", async (c, next) => {
  const user = await verifyAuth(c);
  if (!user) {
    return c.json(errorBody("unauthorized", "กรุณาเข้าสู่ระบบก่อนใช้งาน"), 401);
  }
  c.set("user", user);
  await next();
});

app.post("/api/draft", async (c) => {
  return withRateLimit(c, "draft", async () => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.notes !== "string" || !body.notes.trim()) {
      return c.json(errorBody("bad_request", "กรุณาระบุ notes (ประเด็นที่ต้องการร่าง)"), 400);
    }

    const input = {
      orgName: typeof body.orgName === "string" ? body.orgName : undefined,
      subject: typeof body.subject === "string" ? body.subject : undefined,
      addressee: typeof body.addressee === "string" ? body.addressee : undefined,
      purpose: typeof body.purpose === "string" ? body.purpose : undefined,
      polite: Boolean(body.polite),
      notes: String(body.notes),
    };

    try {
      const provider = getLLMProvider(c.env);
      const result = await provider.callJSON({
        system: buildDraftSystemPrompt(input),
        turns: [{ role: "user", content: buildDraftUserPrompt(input) }],
      });
      return c.json(result as Record<string, unknown>);
    } catch (err) {
      if (err instanceof LLMError) {
        const status = err.code === "server_misconfigured" ? 500 : 502;
        return c.json(errorBody(err.code, err.message), status);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json(errorBody("upstream_error", message), 502);
    }
  });
});

app.post("/api/chat", async (c) => {
  return withRateLimit(c, "chat", async () => {
    const body = await c.req.json().catch(() => null);
    if (!body || !Array.isArray(body.turns) || body.turns.length === 0) {
      return c.json(errorBody("bad_request", "กรุณาระบุ turns (บทสนทนา)"), 400);
    }

    const turns: ChatTurn[] = [];
    for (const t of body.turns) {
      if (!t || (t.role !== "user" && t.role !== "assistant") || typeof t.content !== "string") {
        return c.json(errorBody("bad_request", "รูปแบบ turns ไม่ถูกต้อง"), 400);
      }
      turns.push({ role: t.role, content: t.content });
    }
    if (turns[0].role !== "user") {
      return c.json(errorBody("bad_request", "turns ต้องเริ่มด้วย role=user"), 400);
    }

    let images: InlineImage[] | undefined;
    if (Array.isArray(body.images) && body.images.length) {
      images = [];
      for (const img of body.images) {
        if (!img || typeof img.mimeType !== "string" || typeof img.base64 !== "string") {
          return c.json(errorBody("bad_request", "รูปแบบ images ไม่ถูกต้อง"), 400);
        }
        images.push({ mimeType: img.mimeType, base64: img.base64 });
      }
    }

    try {
      const provider = getLLMProvider(c.env);
      const result = await provider.callJSON({
        system: CHAT_SYSTEM_PROMPT,
        turns,
        images,
      });
      return c.json(result as Record<string, unknown>);
    } catch (err) {
      if (err instanceof LLMError) {
        const status = err.code === "server_misconfigured" ? 500 : 502;
        return c.json(errorBody(err.code, err.message), status);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json(errorBody("upstream_error", message), 502);
    }
  });
});

// ---------- documents (D1) ----------
// Saved drafts, private to whoever saved them (owner_id = the Supabase
// user id from the verified JWT — see the app.use("/api/*", ...) auth
// middleware above). Documents themselves still live in D1, not Supabase
// Postgres — only login moved to Supabase.

app.get("/api/documents", async (c) => {
  const user = c.get("user");
  const { results } = await c.env.DB.prepare(
    "SELECT id, created_at, updated_at, title FROM documents WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 100",
  )
    .bind(user.id)
    .all<{ id: string; created_at: string; updated_at: string; title: string | null }>();

  return c.json({
    documents: results.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      title: row.title,
    })),
  });
});

app.post("/api/documents", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.data !== "object" || body.data === null) {
    return c.json(errorBody("bad_request", "กรุณาระบุ data (สถานะเอกสาร)"), 400);
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const title = typeof body.title === "string" ? body.title : null;

  await c.env.DB.prepare(
    "INSERT INTO documents (id, created_at, updated_at, owner_id, title, data) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, now, now, user.id, title, JSON.stringify(body.data))
    .run();

  return c.json({ id, createdAt: now });
});

app.get("/api/documents/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    "SELECT id, created_at, updated_at, title, data FROM documents WHERE id = ? AND owner_id = ?",
  )
    .bind(id, user.id)
    .first<{ id: string; created_at: string; updated_at: string; title: string | null; data: string }>();

  // Same 404 whether the id doesn't exist or belongs to someone else —
  // doesn't leak which case it is.
  if (!row) {
    return c.json(errorBody("not_found", "ไม่พบเอกสารนี้"), 404);
  }

  return c.json({
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    title: row.title,
    data: JSON.parse(row.data),
  });
});

app.delete("/api/documents/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const result = await c.env.DB.prepare("DELETE FROM documents WHERE id = ? AND owner_id = ?")
    .bind(id, user.id)
    .run();

  if (!result.meta.changes) {
    return c.json(errorBody("not_found", "ไม่พบเอกสารนี้"), 404);
  }
  return c.json({ ok: true });
});

// Anything else (/, /index.html, and any other static asset) falls through
// to the bundled frontend in ./public.
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
