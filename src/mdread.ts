#!/usr/bin/env bun
// mdread CLI: add / serve / list / rm
import { resolve, basename } from "path";
import {
  readIndex,
  writeIndex,
  docPath,
  removeEntry,
  pruneExpired,
  expiryFrom,
  expiryOf,
  isExpired,
  TTL_DAYS,
  type Entry,
} from "./store";
import { generateSlug } from "./slug";
import { serve } from "./server";

function extractTitle(markdown: string, fallback: string): string {
  for (const line of markdown.split("\n")) {
    const m = line.match(/^#\s+(.+?)\s*#*\s*$/);
    if (m) return m[1].trim();
  }
  return fallback;
}

async function cmdAdd(args: string[]): Promise<void> {
  let file: string | undefined;
  let slugOverride: string | undefined;
  let pin = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--pin") pin = true;
    else if (args[i] === "--slug") slugOverride = args[++i]?.replace(/^\//, "");
    else if (!file) file = args[i];
  }
  if (!file) die("usage: mdread add [--pin] [--slug <slug>] <file.md>");
  if (slugOverride !== undefined && !/^[a-z0-9-]{1,30}$/.test(slugOverride))
    die(`invalid --slug (use a-z, 0-9, -, max 30): ${slugOverride}`);

  const srcPath = resolve(file);
  const src = Bun.file(srcPath);
  if (!(await src.exists())) die(`no such file: ${srcPath}`);
  const content = await src.text();
  const title = extractTitle(content, basename(srcPath).replace(/\.[^.]+$/, ""));
  const now = new Date().toISOString();

  const index = await readIndex();
  const existing = index.find((e) => e.srcPath === srcPath);
  if (slugOverride && index.some((e) => e.slug === slugOverride && e.srcPath !== srcPath))
    die(`slug already in use: /${slugOverride}`);

  let entry: Entry;
  if (existing) {
    existing.title = title;
    existing.updatedAt = now;
    existing.expiresAt = expiryFrom(now); // re-add refreshes the expiry clock
    if (pin) existing.pinned = true;
    entry = existing;
  } else {
    const slug = slugOverride ?? (await generateSlug(title, content, index));
    entry = {
      slug,
      title,
      srcPath,
      file: `${slug}.md`,
      addedAt: now,
      updatedAt: now,
      expiresAt: expiryFrom(now),
      ...(pin ? { pinned: true } : {}),
    };
    index.push(entry);
  }

  await Bun.write(docPath(entry.slug), content); // snapshot copy
  await writeIndex(index);
  const life = entry.pinned ? "pinned" : `expires ${entry.expiresAt!.slice(0, 10)}`;
  console.log(`${existing ? "updated" : "added"}  /${entry.slug}  "${title}"  (${life})`);
}

async function cmdList(): Promise<void> {
  const index = await readIndex();
  if (index.length === 0) return void console.log("(empty)");
  const w = Math.max(...index.map((e) => e.slug.length), 4);
  for (const e of [...index].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const tag = e.pinned ? " (pinned)" : isExpired(e) ? " [EXPIRED]" : ` (expires ${expiryOf(e).slice(0, 10)})`;
    console.log(`/${e.slug.padEnd(w)}  ${e.title}${tag}\n${" ".repeat(w + 3)}${e.srcPath}`);
  }
}

async function cmdPrune(): Promise<void> {
  const dead = await pruneExpired();
  if (dead.length === 0) return void console.log("nothing expired");
  for (const e of dead) console.log(`pruned  /${e.slug}  "${e.title}"`);
  console.log(`removed ${dead.length} expired doc(s)`);
}

async function cmdRm(slug: string): Promise<void> {
  if (!slug) die("usage: mdread rm <slug>");
  console.log((await removeEntry(slug.replace(/^\//, ""))) ? `removed /${slug}` : `no such slug: ${slug}`);
}

async function cmdServe(args: string[]): Promise<void> {
  let port = Number(process.env.MDREAD_PORT) || 8787;
  let host: string | undefined; // undefined => resolveHost() uses env / default
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port") port = Number(args[++i]);
    else if (args[i] === "--host") host = args[++i];
    else if (args[i] === "--tailscale") host = "tailscale";
  }
  await serve({ port, host });
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case "add":
    await cmdAdd(rest);
    break;
  case "serve":
    await cmdServe(rest);
    break;
  case "list":
    await cmdList();
    break;
  case "rm":
    await cmdRm(rest[0]);
    break;
  case "prune":
    await cmdPrune();
    break;
  default:
    console.log(
      `mdread <command>\n  add [--pin] [--slug <s>] <file.md>   copy + index a markdown file\n  serve [--port N] [--host IP|tailscale] [--tailscale]\n  list            show indexed docs\n  rm <slug>       remove a doc\n  prune           delete docs past their ${TTL_DAYS}-day expiry`,
    );
    if (cmd && cmd !== "help" && cmd !== "--help" && cmd !== "-h") process.exit(1);
}
