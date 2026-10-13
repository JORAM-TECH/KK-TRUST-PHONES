# AGENTS.md

Notes for working in this repo inside the Base44 sandbox.

## What this project is

A plain static marketing site for KK Trust Phones. There is **no build step, no
package manager, no backend and no database** — just two hand-written HTML files:

- `html.html` — the only complete document (head + body). It is served as the site's
  entry page, i.e. at `/`.
- `html.index.html` — a partial (SEO meta tags, hero, product cards, footer) that is
  not a standalone document. It is still reachable at `/html.index.html`.
- The product images are remote Unsplash URLs, so the page needs outbound network
  access to look complete.

## Running it

```bash
docker compose -f docker-compose.base44.yml up -d --build
```

- Single service `web`: `node:22-alpine` with `live-server` (pinned, installed
  globally in the image) serving the repo bind-mounted at `/app`.
- `live-server` is used instead of any static image/nginx so that HTML edits trigger a
  browser reload; the repo is bind-mounted, so all edits are picked up with no rebuild.
- `--entry-file=html.html` makes `/` render the complete page.
- The file watcher needs polling (`CHOKIDAR_USEPOLLING=true`) because the source is a
  bind mount from the sandbox — without it live reload never fires on edits.
- Host port 3000 is the preview entry point; the server binds `0.0.0.0` and is a plain
  static server, so it needs no host/origin allowlist changes (no `BASE44_*` values are
  referenced anywhere).
- No secrets are required. There is nothing to configure; `.base44/environment.json`
  records the setup metadata for future sessions.

## Verifying it works

```bash
curl -s http://localhost:3000/ | grep '<title>'      # -> <title>KK Trust Phones</title>
docker compose -f docker-compose.base44.yml ps       # -> web (healthy)
docker compose -f docker-compose.base44.yml logs web # -> "Serving "." at http://127.0.0.1:3000", change events
```

Editing an HTML file should log a change in `docker compose logs web` and reload the
page. There is no test suite or linter to run.
