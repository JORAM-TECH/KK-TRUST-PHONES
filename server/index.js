import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import {
  OAUTH_TTL_MS,
  SESSION_COOKIE,
  STATE_COOKIE,
  VERIFIER_COOKIE,
  appendCookie,
  clearSessionCookie,
  exchangeCodeForProfile,
  googleAuthUrl,
  googleConfigured,
  readSession,
  redirectUri,
  setSessionCookie,
} from './auth.js';
import { parseCookies } from './cookies.js';
import * as listings from './listings.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 3000);

// Only these pages are served; server code and stored data stay private.
const PAGES = {
  '/': 'html.html',
  '/html.html': 'html.html',
  '/html.index.html': 'html.index.html',
  '/login': 'login.html',
  '/manage': 'manage.html',
};

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  req.cookies = parseCookies(req.headers.cookie);
  req.user = readSession(req);
  res.setHeader('Cache-Control', 'no-store');
  next();
});

function sendPage(res, file) {
  res.sendFile(path.join(ROOT, file));
}

function requireSession(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to manage phone listings.' });
  return next();
}

function requireJson(req, res, next) {
  if (!req.is('application/json')) return res.status(415).json({ error: 'Send this request as JSON.' });
  return next();
}

function handle(fn) {
  return (req, res) => {
    try {
      fn(req, res);
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  };
}

// --- favicon --------------------------------------------------------------
// Browsers ask for /favicon.ico on every fresh page load; the site shipped without one.
app.get(['/favicon.ico', '/favicon.svg'], (req, res) => res.sendFile(path.join(ROOT, 'favicon.svg')));

// --- pages ----------------------------------------------------------------
app.get('/', (req, res) => sendPage(res, PAGES['/']));
app.get('/html.html', (req, res) => sendPage(res, PAGES['/html.html']));
app.get('/html.index.html', (req, res) => sendPage(res, PAGES['/html.index.html']));
app.get('/login', (req, res) => (req.user ? res.redirect('/manage') : sendPage(res, PAGES['/login'])));
app.get('/manage', (req, res) => (req.user ? sendPage(res, PAGES['/manage']) : res.redirect('/login?next=%2Fmanage')));

// --- sign-in --------------------------------------------------------------
app.get('/auth/google', (req, res) => {
  if (!googleConfigured()) {
    return res.redirect(`/login?error=${encodeURIComponent('Google sign-in is not set up yet.')}`);
  }
  const { url, state, verifier } = googleAuthUrl(req);
  appendCookie(res, STATE_COOKIE, state, { maxAgeMs: OAUTH_TTL_MS });
  appendCookie(res, VERIFIER_COOKIE, verifier, { maxAgeMs: OAUTH_TTL_MS });
  return res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  const fail = (message) => res.redirect(`/login?error=${encodeURIComponent(message)}`);

  if (!googleConfigured()) return fail('Google sign-in is not set up yet.');

  const { code, state } = req.query;
  if (!code || !state) return fail('Google did not return a sign-in code.');
  if (state !== req.cookies[STATE_COOKIE]) return fail('That sign-in attempt expired. Please try again.');
  const verifier = req.cookies[VERIFIER_COOKIE];
  if (!verifier) return fail('That sign-in attempt expired. Please try again.');

  try {
    const user = await exchangeCodeForProfile({ code, codeVerifier: verifier, redirectUri: redirectUri(req) });
    appendCookie(res, STATE_COOKIE, '', { maxAgeMs: 0 });
    appendCookie(res, VERIFIER_COOKIE, '', { maxAgeMs: 0 });
    setSessionCookie(res, user);
    return res.redirect('/manage');
  } catch (error) {
    return fail(error.message || 'Sign-in failed. Please try again.');
  }
});

app.post('/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// --- API ------------------------------------------------------------------
app.get('/api/me', (req, res) => res.json({ user: req.user, googleConfigured: googleConfigured() }));

app.get('/api/listings', (req, res) => res.json({ listings: listings.list() }));

app.post(
  '/api/listings',
  requireSession,
  requireJson,
  handle((req, res) => res.status(201).json({ listing: listings.create(req.body) })),
);

app.put(
  '/api/listings/:id',
  requireSession,
  requireJson,
  handle((req, res) => res.json({ listing: listings.update(req.params.id, req.body) })),
);

app.delete(
  '/api/listings/:id',
  requireSession,
  handle((req, res) => res.json({ removed: listings.remove(req.params.id) })),
);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found.' });
  return res.status(404).sendFile(path.join(ROOT, 'html.html'), (error) => {
    if (error) res.status(404).type('text/plain').send('Not found');
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`KK Trust Phones listening on http://0.0.0.0:${PORT}`);
  console.log(`Google sign-in ${googleConfigured() ? 'is configured' : 'needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET'}`);
});

export { app, SESSION_COOKIE };
