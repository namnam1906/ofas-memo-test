import Anthropic from "@anthropic-ai/sdk";
import type { CallJsonRequest, LLMProvider } from "./types";
import { LLMError } from "./types";
import { extractJson } from "./parseJson";

export function createAnthropicProvider(apiKey: string, model: string): LLMProvider {
  const client = new Anthropic({ apiKey });

  async function callOnce(req: CallJsonRequest): Promise<Anthropic.Message> {
    const messages: Anthropic.MessageParam[] = req.turns.map((t, i) => {
      const isLast = i === req.turns.length - 1;
      if (t.role === "user" && isLast && req.images && req.images.length) {
        const content: Anthropic.ContentBlockParam[] = [
          ...req.images.map(
            (img): Anthropic.ContentBlockParam => ({
              type: "image",
              source: {
                type: "base64",
                media_type: img.mimeType as
                  | "image/png"
                  | "image/jpeg"
                  | "image/webp"
                  | "image/gif",
                data: img.base64,
              },
            }),
          ),
          { type: "text", text: t.content },
        ];
        return { role: "user", content };
      }
      return { role: t.role, content: t.content };
    });

    return client.messages.create({
      model,
      max_tokens: 4096,
      system: req.system,
      messages,
    });
  }

  async function attempt(req: CallJsonRequest): Promise<unknown> {
    let response: Anthropic.Message;
    try {
      response = await callOnce(req);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new LLMError("upstream_error", "เรียก Anthropic API ไม่สำเร็จ: " + message);
    }

    if (response.stop_reason === "refusal") {
      throw new LLMError("upstream_error", "AI ปฏิเสธคำขอนี้ ลองปรับข้อความแล้วลองใหม่");
    }

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );
    if (!textBlock || !textBlock.text.trim()) {
      throw new LLMError("upstream_error", "AI ไม่ได้ตอบข้อความกลับมา");
    }

    try {
      return extractJson(textBlock.text);
    } catch {
      throw new LLMError("upstream_error", "AI ตอบกลับไม่ถูกรูปแบบ JSON");
    }
  }

  return {
    async callJSON(req: CallJsonRequest): Promise<unknown> {
      try {
        return await attempt(req);
      } catch (err) {
        // one silent retry — mirrors the frontend's old invalid_json retry,
        // now handled server-side so the client never sees it
        if (err instanceof LLMError) return await attempt(req);
        throw err;
      }
    },
  };
}
