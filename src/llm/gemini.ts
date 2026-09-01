import type { CallJsonRequest, LLMProvider } from "./types";
import { LLMError } from "./types";
import { extractJson } from "./parseJson";

// Raw REST call (no bundled Google SDK dependency) against the Gemini
// "generateContent" endpoint. Model id is passed in from wrangler.toml
// (GEMINI_MODEL) — verify it's still current before relying on this in
// production, Gemini model names roll over faster than this file does.
export function createGeminiProvider(apiKey: string, model: string): LLMProvider {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  async function attempt(req: CallJsonRequest): Promise<unknown> {
    const contents = req.turns.map((t, i) => {
      const isLast = i === req.turns.length - 1;
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      if (t.role === "user" && isLast && req.images && req.images.length) {
        for (const img of req.images) {
          parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
        }
      }
      parts.push({ text: t.content });
      return { role: t.role === "assistant" ? "model" : "user", parts };
    });

    let res: Response;
    try {
      res = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: req.system }] },
          contents,
          generationConfig: { responseMimeType: "application/json" },
        }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new LLMError("upstream_error", "เรียก Gemini API ไม่สำเร็จ: " + message);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new LLMError(
        "upstream_error",
        `Gemini API ตอบกลับผิดพลาด (${res.status}): ${body.slice(0, 300)}`,
      );
    }

    const json = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
    };

    const candidate = json.candidates?.[0];
    if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT") {
      throw new LLMError("upstream_error", "AI ปฏิเสธคำขอนี้ ลองปรับข้อความแล้วลองใหม่");
    }

    const text = candidate?.content?.parts?.map((p) => p.text || "").join("") ?? "";
    if (!text.trim()) {
      throw new LLMError("upstream_error", "AI ไม่ได้ตอบข้อความกลับมา");
    }

    try {
      return extractJson(text);
    } catch {
      throw new LLMError("upstream_error", "AI ตอบกลับไม่ถูกรูปแบบ JSON");
    }
  }

  return {
    async callJSON(req: CallJsonRequest): Promise<unknown> {
      try {
        return await attempt(req);
      } catch (err) {
        if (err instanceof LLMError) return await attempt(req);
        throw err;
      }
    },
  };
}
