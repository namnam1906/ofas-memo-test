// Both providers are prompted to return raw JSON with no commentary, but
// models occasionally wrap it in ```json fences or add a stray sentence
// before/after anyway — this strips that defensively before parsing,
// matching the behavior the frontend prompts were already tuned against.
export function extractJson(text: string): unknown {
  let s = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(s);
  if (fence) s = fence[1].trim();

  const first = s.indexOf("{");
  if (first !== -1) {
    // Scan for the matching close brace by tracking nesting depth (rather
    // than just lastIndexOf("}")) so a stray "}" in trailing commentary
    // after the real JSON object doesn't get swept into the slice — that
    // previously produced a strictly worse error (invalid JSON instead of
    // valid JSON plus ignored trailing text). Strings are tracked so a "{"
    // or "}" inside a quoted value (e.g. Thai text mentioning a brace)
    // doesn't throw off the depth count.
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = first; i < s.length; i++) {
      const ch = s[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          s = s.slice(first, i + 1);
          break;
        }
      }
    }
  }

  return JSON.parse(s);
}
