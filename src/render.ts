// Markdown -> HTML rendering with markdown-it + highlight.js, GitHub styling.
import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import { homedir } from "os";
import type { Entry } from "./store";

function htmlEscape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch {
        /* fall through */
      }
    }
    return ""; // let markdown-it escape it
  },
});

// Emit ```mermaid fences as <pre class="mermaid"> with raw content for mermaid.js.
const defaultFence = md.renderer.rules.fence!.bind(md.renderer.rules);
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  if (tokens[idx].info.trim().toLowerCase() === "mermaid") {
    return `<pre class="mermaid">${htmlEscape(tokens[idx].content)}</pre>\n`;
  }
  return defaultFence(tokens, idx, options, env, self);
};

// CSS vendored from node_modules (no CDN — tailnet host may lack outbound).
const root = new URL("../node_modules/", import.meta.url);
const ghCss = await Bun.file(new URL("github-markdown-css/github-markdown.css", root)).text();
const hlCss = await Bun.file(new URL("highlight.js/styles/github.css", root)).text();
const hlCssDark = await Bun.file(new URL("highlight.js/styles/github-dark.css", root)).text();

const BASE_CSS = `
${ghCss}
@media (prefers-color-scheme: light) { ${hlCss} }
@media (prefers-color-scheme: dark)  { ${hlCssDark} }
body { margin: 0; background: var(--mdr-bg, #fff); }
@media (prefers-color-scheme: dark) { body { background: #0d1117; } }
.markdown-body { box-sizing: border-box; min-width: 200px; max-width: 880px; margin: 0 auto; padding: 32px 24px 64px; }
.markdown-body pre.mermaid { background: transparent; text-align: center; }
.mdr-nav { max-width: 880px; margin: 0 auto; padding: 12px 24px; font: 13px ui-monospace, monospace; opacity: .7; }
.mdr-nav a { text-decoration: none; }
.mdr-readme { margin: 4px 0 16px; font-size: 14px; }
.mdr-views { margin: 0 0 8px; display: flex; gap: 8px; }
.mdr-views button { font: inherit; padding: 4px 12px; border: 1px solid var(--borderColor-default, #d0d7de); border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
.mdr-views button.active { background: var(--bgColor-emphasis, #0969da); color: #fff; border-color: transparent; }
.mdr-group { margin-top: 24px; }
.mdr-group > h2 { font-size: 16px; border: 0; padding-bottom: 4px; }
.mdr-group ul { margin-top: 4px; }
`;

function page(title: string, navHtml: string, bodyHtml: string, scripts = ""): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlEscape(title)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
<nav class="mdr-nav">${navHtml}</nav>
<article class="markdown-body">${bodyHtml}</article>
${scripts}
</body>
</html>`;
}

// Mermaid loader: served from our own /_assets so no outbound network needed.
const MERMAID_SCRIPT = `<script type="module">
import mermaid from '/_assets/mermaid/mermaid.esm.min.mjs';
const dark = matchMedia('(prefers-color-scheme: dark)').matches;
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default' });
try { await mermaid.run({ querySelector: '.mermaid' }); } catch (e) { console.error(e); }
</script>`;

export function renderDoc(title: string, markdown: string): string {
  const nav = `<a href="/">&larr; index</a>`;
  const hasMermaid = /^```mermaid\b/m.test(markdown);
  return page(title, nav, md.render(markdown), hasMermaid ? MERMAID_SCRIPT : "");
}

// ---- index page ----

const HOME = homedir();

function dirOf(srcPath: string): string {
  const dir = srcPath.slice(0, srcPath.lastIndexOf("/")) || "/";
  return dir === HOME || dir.startsWith(HOME + "/") ? "~" + dir.slice(HOME.length) : dir;
}

function itemHtml(e: Entry): string {
  return (
    `<li><a href="/${encodeURIComponent(e.slug)}">${htmlEscape(e.title)}</a> ` +
    `<small><code>/${htmlEscape(e.slug)}</code> · ${htmlEscape(e.updatedAt.slice(0, 10))}</small></li>`
  );
}

// Render grouped sections: [{ heading, entries }] -> <div.mdr-group><h2>..<ul>..
function groupsHtml(groups: { heading: string; entries: Entry[] }[]): string {
  return groups
    .map(
      (g) =>
        `<div class="mdr-group"><h2>${htmlEscape(g.heading)}</h2>\n<ul>\n${g.entries
          .map(itemHtml)
          .join("\n")}\n</ul></div>`,
    )
    .join("\n");
}

function byTimeline(entries: Entry[]): { heading: string; entries: Entry[] }[] {
  const sorted = [...entries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const map = new Map<string, Entry[]>();
  for (const e of sorted) {
    const day = e.updatedAt.slice(0, 10);
    (map.get(day) ?? map.set(day, []).get(day)!).push(e);
  }
  return [...map.entries()].map(([heading, es]) => ({ heading, entries: es }));
}

function byDirectory(entries: Entry[]): { heading: string; entries: Entry[] }[] {
  const map = new Map<string, Entry[]>();
  for (const e of entries) {
    const dir = dirOf(e.srcPath);
    (map.get(dir) ?? map.set(dir, []).get(dir)!).push(e);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([heading, es]) => ({
      heading,
      entries: es.sort((a, b) => a.title.localeCompare(b.title)),
    }));
}

const VIEW_SCRIPT = `<script>
(function () {
  const key = 'mdr-view';
  const btns = document.querySelectorAll('.mdr-views button');
  const secs = document.querySelectorAll('section[data-view]');
  function set(v) {
    btns.forEach(b => b.classList.toggle('active', b.dataset.view === v));
    secs.forEach(s => s.hidden = s.dataset.view !== v);
    try { localStorage.setItem(key, v); } catch (e) {}
  }
  btns.forEach(b => b.addEventListener('click', () => set(b.dataset.view)));
  let init = 'timeline';
  try { init = localStorage.getItem(key) || 'timeline'; } catch (e) {}
  set(document.querySelector('.mdr-views button[data-view="' + init + '"]') ? init : 'timeline');
})();
</script>`;

export function renderIndex(entries: Entry[]): string {
  if (entries.length === 0) {
    return page(
      "mdread",
      "mdread",
      `<h1>mdread</h1><p>No documents yet. Add one with <code>mdread add &lt;file.md&gt;</code>.</p>`,
    );
  }
  const readme = entries.find((e) => e.slug === "readme");
  const body =
    `<h1>mdread</h1>\n` +
    (readme ? `<p class="mdr-readme">📖 <a href="/readme">${htmlEscape(readme.title)}</a></p>\n` : "") +
    `<div class="mdr-views"><button data-view="timeline">Timeline</button>` +
    `<button data-view="dir">By directory</button></div>\n` +
    `<section data-view="timeline">${groupsHtml(byTimeline(entries))}</section>\n` +
    `<section data-view="dir" hidden>${groupsHtml(byDirectory(entries))}</section>`;
  return page("mdread", "mdread", body, VIEW_SCRIPT);
}
