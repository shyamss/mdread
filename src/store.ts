// Persistent store: index.json + docs/<slug>.md under XDG data dir.
import { homedir } from "os";
import { join } from "path";
import { mkdir, rename, readdir, unlink } from "fs/promises";

export interface Entry {
  slug: string;
  title: string;
  srcPath: string; // absolute source path; re-add key
  file: string; // basename in docs/, i.e. <slug>.md
  addedAt: string;
  updatedAt: string;
  expiresAt?: string; // optional for legacy entries; derived from updatedAt if absent
  pinned?: boolean; // pinned docs never expire
}

// Time-to-live: a doc expires this long after its last add/update.
export const TTL_DAYS = Number(process.env.MDREAD_TTL_DAYS) || 90;

export function expiryFrom(iso: string): string {
  return new Date(new Date(iso).getTime() + TTL_DAYS * 86_400_000).toISOString();
}

// Effective expiry: explicit field, or derived from updatedAt for legacy entries.
export function expiryOf(e: Entry): string {
  return e.expiresAt ?? expiryFrom(e.updatedAt);
}

export function isExpired(e: Entry, now = Date.now()): boolean {
  if (e.pinned) return false; // pinned docs are permanent
  return new Date(expiryOf(e)).getTime() <= now;
}

const dataHome =
  process.env.XDG_DATA_HOME && process.env.XDG_DATA_HOME.length > 0
    ? process.env.XDG_DATA_HOME
    : join(homedir(), ".local", "share");

export const STORE_DIR = join(dataHome, "mdread");
export const DOCS_DIR = join(STORE_DIR, "docs");
export const INDEX_PATH = join(STORE_DIR, "index.json");

export async function ensureStore(): Promise<void> {
  await mkdir(DOCS_DIR, { recursive: true });
}

export async function readIndex(): Promise<Entry[]> {
  const f = Bun.file(INDEX_PATH);
  if (!(await f.exists())) return [];
  try {
    const data = JSON.parse(await f.text());
    return Array.isArray(data) ? (data as Entry[]) : [];
  } catch {
    return [];
  }
}

// Atomic write: tmp file then rename, so the server never reads a partial index.
export async function writeIndex(entries: Entry[]): Promise<void> {
  await ensureStore();
  const tmp = INDEX_PATH + ".tmp";
  await Bun.write(tmp, JSON.stringify(entries, null, 2));
  await rename(tmp, INDEX_PATH);
}

export function docPath(slug: string): string {
  return join(DOCS_DIR, `${slug}.md`);
}

export async function removeEntry(slug: string): Promise<boolean> {
  const entries = await readIndex();
  const next = entries.filter((e) => e.slug !== slug);
  if (next.length === entries.length) return false;
  await writeIndex(next);
  try {
    await unlink(docPath(slug));
  } catch {
    /* copy may already be gone */
  }
  return true;
}

// Physically delete expired entries + their copies. Returns the removed entries.
export async function pruneExpired(now = Date.now()): Promise<Entry[]> {
  const entries = await readIndex();
  const dead = entries.filter((e) => isExpired(e, now));
  if (dead.length === 0) return [];
  const live = entries.filter((e) => !isExpired(e, now));
  await writeIndex(live);
  for (const e of dead) {
    try {
      await unlink(docPath(e.slug));
    } catch {
      /* copy may already be gone */
    }
  }
  return dead;
}

export async function _docsList(): Promise<string[]> {
  try {
    return await readdir(DOCS_DIR);
  } catch {
    return [];
  }
}
