// HTTP server: / -> index, /<slug> -> rendered markdown. Reads store live per request.
import { readIndex, docPath, isExpired } from "./store";
import { renderDoc, renderIndex } from "./render";
import { resolveHost } from "./host";

const HTML = { "content-type": "text/html; charset=utf-8" };

// Mermaid runtime is vendored; served from node_modules/mermaid/dist so the
// lazily-imported diagram chunks resolve as siblings under /_assets/mermaid/.
const MERMAID_DIST = new URL("../node_modules/mermaid/dist/", import.meta.url);

async function serveMermaidAsset(pathname: string): Promise<Response> {
  const name = pathname.slice("/_assets/mermaid/".length);
  // Allow nested chunk paths (chunks/.../x.mjs) but block traversal / encoded slashes.
  if (name.includes("..") || name.startsWith("/") || !/^[\w./-]+$/.test(name))
    return new Response("bad asset", { status: 400 });
  const target = new URL(name, MERMAID_DIST);
  if (!target.pathname.startsWith(MERMAID_DIST.pathname))
    return new Response("bad asset", { status: 400 });
  const f = Bun.file(target);
  if (!(await f.exists())) return new Response("not found", { status: 404 });
  const type = name.endsWith(".mjs") || name.endsWith(".js")
    ? "text/javascript; charset=utf-8"
    : name.endsWith(".map")
      ? "application/json"
      : "application/octet-stream";
  return new Response(f, { headers: { "content-type": type, "cache-control": "max-age=86400" } });
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname.startsWith("/_assets/mermaid/")) return serveMermaidAsset(url.pathname);

  const slug = decodeURIComponent(url.pathname.slice(1));
  const index = (await readIndex()).filter((e) => !isExpired(e)); // expired docs are invisible

  if (slug === "") {
    return new Response(renderIndex(index), { headers: HTML });
  }

  const entry = index.find((e) => e.slug === slug);
  if (!entry)
    return new Response(`<!doctype html><meta charset=utf-8><title>404</title><h1>404</h1><p><a href="/">&larr; index</a></p>`, { status: 404, headers: HTML });

  const f = Bun.file(docPath(slug));
  if (!(await f.exists())) return new Response("Document file missing", { status: 410 });
  return new Response(renderDoc(entry.title, await f.text()), { headers: HTML });
}

export async function serve(opts: { port: number; host?: string }): Promise<void> {
  const host = await resolveHost(opts.host);
  const server = Bun.serve({ hostname: host, port: opts.port, fetch: handle });
  console.log(`mdread serving on http://${server.hostname}:${server.port}`);
}
