<!-- This is the user-facing doc served at /readme (for readers without GitHub
     access). It intentionally overlaps with the repo README.md; keep both. -->
# mdread

**mdread** mirrors local Markdown files on a small, private web server and serves
them as good-looking HTML at short URLs.

## How it works

- `mdread add <file>` copies the file into a local store
  (`~/.local/share/mdread/`) and records it in an `index.json`.
- A **slug** (the short URL path) is generated automatically by the `claude` CLI
  from the document's title, or you can set one with `--slug`.
- A small **Bun** web server reads the store live on every request:
  - `/` lists all docs — switch between a **Timeline** view (grouped by day) and a
    **By directory** view (grouped by source folder).
  - `/<slug>` renders the Markdown with markdown-it + highlight.js and GitHub
    styling. ` ```mermaid ` blocks render as diagrams.
- Host binding is pluggable: loopback by default, your Tailscale IP with
  `--tailscale`, or any custom resolver via `MDREAD_HOST_CMD`. It typically runs as
  a systemd user service.

## Lifetime

Docs **expire 90 days** after their last update and are then deleted by a daily
cleanup. Re-add a file to reset its clock, or add it with `--pin` to keep it
permanently.

## CLI

| Command | What it does |
|---------|--------------|
| `mdread add <file.md>` | Copy + publish a Markdown file; prints its URL slug |
| `mdread add --pin <file.md>` | Publish a doc that never expires |
| `mdread add --slug <name> <file.md>` | Publish at a chosen slug (`/<name>`) |
| `mdread list` | List published docs with their expiry / pinned status |
| `mdread rm <slug>` | Remove a doc |
| `mdread prune` | Delete all expired docs now |

Re-running `add` on the **same file path** updates the existing doc in place and
keeps its slug.

## Example

```
$ mdread add notes/design.md
added  /design-overview  "Design Overview"  (expires 2026-08-25)
# → http://<tailnet-ip>:8787/design-overview
```
