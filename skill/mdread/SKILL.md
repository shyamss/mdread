---
name: mdread
description: Use when the user wants to publish, share, mirror, view, or serve a Markdown file on their mdread web server — phrases like "mdread that file", "mdread this", "publish this markdown", "put this doc on the server", "share this .md", or asks for the link/slug to a markdown doc.
---

# mdread

## Overview

`mdread` is a local utility that mirrors a Markdown file onto a small private web
server. It copies the file into a store, generates a short slug, and serves a
syntax-highlighted HTML render at `http://<host>:8787/<slug>`.

The host depends on how the server is bound (loopback by default; a Tailscale IP
or a custom resolver if configured). The server is usually already running (often
as a systemd user service) — you just invoke the CLI.

## When to use

- "mdread that file" / "mdread this doc" / "mdread <path>"
- User wants a shareable link to a Markdown file
- User wants to view/publish/mirror a `.md` on the web server
- User asks to list, update, or remove published docs

## Commands

| Goal | Command |
|------|---------|
| Publish / update a file | `mdread add <path-to.md>` |
| Publish so it never expires | `mdread add --pin <path-to.md>` |
| Publish at a fixed slug | `mdread add --slug <name> <path-to.md>` |
| List published docs | `mdread list` |
| Remove a doc | `mdread rm <slug>` |

`add` prints the slug. Re-running `add` on the **same path** updates the existing
entry and keeps its slug (it does not create a duplicate).

## Workflow for "mdread that file"

1. Resolve which file — the path the user named, or the file just discussed.
2. Run `mdread add <path>`.
3. Read the slug from the output (`added /<slug>` or `updated /<slug>`) — never
   invent it.
4. Determine the server host and build the URL:
   - If bound to Tailscale: `tailscale ip -4` (first line).
   - Otherwise the default loopback: `127.0.0.1`.
   - URL = `http://<host>:8787/<slug>`.
5. Give the user the full URL.

Example:

```
$ mdread add docs/architecture/error-analysis.md
added  /chunking-error-analysis  "Chunking Error Analysis"  (expires 2026-08-25)
# → http://<host>:8787/chunking-error-analysis
```

## Good to know

- **Docs expire after ~90 days** (since last add/update). Re-running `add` on the
  same path resets the clock. Use `--pin` to keep a doc permanently.
- **Mermaid** ` ```mermaid ` blocks render as diagrams automatically.
- The index page has a Timeline / By-directory view switcher.

## Common mistakes

- **Don't run `mdread serve`** if a server is already running (e.g. a systemd user
  service owns it). Check `systemctl --user status mdread` instead of starting a
  second copy.
- **Don't invent the slug** — always read it from the `add` output; it's generated.
- **Multiple files** — run `add` once per file; report a URL for each.
- If `mdread` is not found, it isn't installed/linked — see the project README.
