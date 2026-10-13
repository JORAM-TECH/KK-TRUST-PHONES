# AGENTS.md

Notes for working in this repo inside the Base44 sandbox.

## What this project is

The KK Trust Phones storefront: the original hand-written pages plus a small
Express server that adds Google sign-in and a phone-listings manager.

- `html.html` — the shop's homepage (complete document), served at `/`.
- `html.index.html` — a partial (SEO meta, hero, product cards, footer); reachable at
  `/html.index.html`, not included by any page.
- `login.html` — the sign-in page at `/login`.
- `manage.html` — the listings manager at `/manage` (sign-in required).
- `server/index.js` — Express app: page routes, auth routes, JSON API.
- `server/auth.js` — Google OAuth (PKCE, no OAuth library) plus the signed session cookie.
- `server/cookies.js` — tiny cookie parse/serialize helpers (keeps deps to `express`).
- `server/listings.js` — phone listings store.
- Phone listings live in `data/listings.json`, created and seeded with the four homepage
  phones on first use. `data/` and `node_modules/` are git-ignored. A JSON file (rather
  than a database service) is deliberate: the site is a single-writer storefront, and it
  keeps the sandbox to one container. Writes are atomic (temp file + rename).

## Running it

```bash
docker compose -f docker-compose.base44.yml up -d --build
```

- Single service `web`: plain `node:22-alpine` with the repo bind-mounted at `/app`,
  dependencies installed from `package-lock.json` on startup into a named
  `node_modules` volume, then `node --watch server/index.js` (live reload for server
  code). No image rebuild is needed after an edit; HTML pages are read from disk per
  request, so a page refresh shows page edits immediately.
- Host port 3000 is the preview entry point; the server binds `0.0.0.0`.
- `APP_BASE_URL=https://3000-${BASE44_PUBLIC_HOST_SUFFIX}` is passed in as a variable
  reference (never hardcoded) because behind the preview proxy `req.get('host')` is the
  internal sandbox host, while Google needs the browser-facing redirect URI
  `<APP_BASE_URL>/auth/google/callback`. With the variable unset the server falls back to
  the request host, so a normal deployment needs no change.
- No host/origin allowlists are involved (Express does not reject unknown Host headers and
  everything is same-origin), so nothing is gated on `BASE44_PREVIEW_MODE`.

## Configuration and secrets

Delivered by the platform to `/run/base44/app.env` (wired in as the last `env_file:`
entry, so dashboard values always win):

| Name | Purpose | Notes |
| --- | --- | --- |
| `SESSION_SECRET` | Signs the session cookie | Required. Without it everyone is signed out and sign-in fails. |
| `GOOGLE_CLIENT_ID` | Google OAuth client id | From Google Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Same OAuth client. |

The app **boots without the Google values**: `/api/me` reports `googleConfigured: false`
and `/login` shows a "not set up yet" notice instead of the sign-in button. Sign-in also
needs the callback URL registered as an authorised redirect URI on that OAuth client:

```
https://3000-<BASE44_PUBLIC_HOST_SUFFIX>/auth/google/callback
```

## Routes and API

- Pages: `/` (shop), `/login`, `/manage` (requires a session, otherwise redirects to
  `/login?next=%2Fmanage`), `/html.index.html`.
- `/favicon.ico` and `/favicon.svg` both serve `favicon.svg` — browsers request the icon on
  every fresh load, so without this route the preview logs a 404.
- `GET /auth/google` → Google consent; `GET /auth/google/callback` → sets the session
  cookie and redirects to `/manage`; `POST /auth/logout` clears it.
- `GET /api/me` — `{ user, googleConfigured }`.
- `GET /api/listings` — public read.
- `POST /api/listings`, `PUT /api/listings/:id`, `DELETE /api/listings/:id` — require a
  signed-in session (401 otherwise) and `Content-Type: application/json` (415 otherwise).
  The session cookie is `SameSite=Lax`, which keeps cross-site POSTs cookieless.
- Only the four HTML files are served; `server/`, `data/`, `AGENTS.md` and the compose
  file are not reachable over HTTP (the page routes are an explicit allowlist).

## Verifying it works

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/          # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/manage     # 302 -> /login
curl -s http://localhost:3000/api/listings                                # seeded listings
curl -s -X POST http://localhost:3000/api/listings -H 'Content-Type: application/json' -d '{"name":"x"}'  # 401 signed out
curl -s http://localhost:3000/api/me                                      # {"user":null,"googleConfigured":...}
```

There is no test suite or linter. Anything behind sign-in can only be verified by hand
after Google credentials are configured — the app has no password or dev-login bypass.
