// Slug generation. Primary: claude CLI headless. Fallback: random base62.
import type { Entry } from "./store";

const SLUG_RE = /^[a-z0-9-]{1,30}$/;
const B62 = "abcdefghijklmnopqrstuvwxyz0123456789";

export function randomSlug(len = 6): string {
  let s = "";
  for (let i = 0; i < len; i++) s += B62[Math.floor(Math.random() * B62.length)];
  return s;
}

// Normalize arbitrary claude output to a valid slug, or return null.
function sanitize(raw: string): string | null {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30)
    .replace(/-$/, "");
  return SLUG_RE.test(s) ? s : null;
}

const PROMPT =
  "Generate a URL slug for this document: 2-4 lowercase words, hyphen-separated, max 30 chars, letters/digits/hyphens only. Output ONLY the slug.";

// Ask claude headless. Input = title + first 2KB of content. Null on any failure.
async function claudeSlug(title: string, content: string): Promise<string | null> {
  const input = `${title}\n\n${content}`.slice(0, 2048);
  try {
    const proc = Bun.spawn(["claude", "-p", PROMPT], {
      stdin: new TextEncoder().encode(input),
      stdout: "pipe",
      stderr: "ignore",
    });
    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;
    if (code !== 0) return null;
    return sanitize(out);
  } catch {
    return null; // claude missing / spawn failed
  }
}

// Produce a unique slug. base = claude slug or random; collisions get a -<base62> suffix.
export async function generateSlug(
  title: string,
  content: string,
  existing: Entry[],
): Promise<string> {
  const taken = new Set(existing.map((e) => e.slug));
  let base = (await claudeSlug(title, content)) ?? randomSlug();
  if (!taken.has(base)) return base;
  for (let i = 0; i < 5; i++) {
    const cand = `${base}-${randomSlug(4)}`.slice(0, 30).replace(/-$/, "");
    if (!taken.has(cand)) return cand;
  }
  // give up on readable form; pure random
  let r = randomSlug();
  while (taken.has(r)) r = randomSlug();
  return r;
}
