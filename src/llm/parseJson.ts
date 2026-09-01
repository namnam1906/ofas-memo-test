// Both providers are prompted to return raw JSON with no commentary, but
// models occasionally wrap it in ```json fences or add a stray sentence
// anyway — this strips that defensively before parsing, matching the
// behavior the frontend prompts were already tuned against.
export function extractJson(text: string): unknown {
  let s = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(s);
  if (fence) s = fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }
  return JSON.parse(s);
}
