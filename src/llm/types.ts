// Shared contract both provider backends (Anthropic, Gemini) implement, so
// src/index.ts never branches on which provider is active — it just calls
// whatever getLLMProvider(env) hands back.

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface InlineImage {
  /** e.g. "image/png", "image/jpeg", "image/webp", "image/gif" */
  mimeType: string;
  /** raw base64, no "data:...;base64," prefix */
  base64: string;
}

export interface CallJsonRequest {
  /** Standing instructions — kept out of `turns` so callers can't override it. */
  system: string;
  /** Full conversation so far, oldest first. Must start with a "user" turn. */
  turns: ChatTurn[];
  /** Attached to the LAST user turn only. */
  images?: InlineImage[];
}

export class LLMError extends Error {
  code: "upstream_error" | "server_misconfigured";
  constructor(code: "upstream_error" | "server_misconfigured", message: string) {
    super(message);
    this.code = code;
    this.name = "LLMError";
  }
}

export interface LLMProvider {
  /**
   * Calls the model and returns already-parsed JSON. Implementations own
   * their own "the model wrapped it in ```json fences" cleanup and a single
   * internal retry on malformed JSON — callers always get either a parsed
   * object or a thrown LLMError, never a raw string to re-parse.
   */
  callJSON(req: CallJsonRequest): Promise<unknown>;
}
