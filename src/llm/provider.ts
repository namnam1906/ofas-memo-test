import type { Env } from "../env";
import type { LLMProvider } from "./types";
import { LLMError } from "./types";
import { createAnthropicProvider } from "./anthropic";
import { createGeminiProvider } from "./gemini";

export function getLLMProvider(env: Env): LLMProvider {
  const which = (env.LLM_PROVIDER || "anthropic").toLowerCase();

  if (which === "gemini") {
    if (!env.GEMINI_API_KEY) {
      throw new LLMError(
        "server_misconfigured",
        "LLM_PROVIDER=gemini แต่ยังไม่ได้ตั้งค่า secret GEMINI_API_KEY (ดู README)",
      );
    }
    return createGeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL || "gemini-2.5-flash");
  }

  if (which === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) {
      throw new LLMError(
        "server_misconfigured",
        "LLM_PROVIDER=anthropic แต่ยังไม่ได้ตั้งค่า secret ANTHROPIC_API_KEY (ดู README)",
      );
    }
    return createAnthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL || "claude-opus-5");
  }

  throw new LLMError(
    "server_misconfigured",
    `LLM_PROVIDER="${which}" ไม่รู้จัก ใช้ได้แค่ "anthropic" หรือ "gemini"`,
  );
}
