// Google sign-in for shoppers plus the signed session cookie it issues.
//
// Flow: GET /auth/google -> Google consent screen -> GET /auth/google/callback.
// The callback exchanges the code (PKCE) for an access token, reads the Google
// profile from the userinfo endpoint and stores it in a stateless signed cookie,
// so a server restart does not sign anybody out.
import crypto from 'node:crypto';

import { serializeCookie } from './cookies.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

export const SESSION_COOKIE = 'kk_session';
export const STATE_COOKIE = 'kk_oauth_state';
export const VERIFIER_COOKIE = 'kk_oauth_verifier';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const OAUTH_TTL_MS = 10 * 60 * 1000;

const base64url = (input) => Buffer.from(input).toString('base64url');

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function sessionSecret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error('SESSION_SECRET is not set, so sign-in sessions cannot be signed.');
  return value;
}

function signature(payload) {
  return crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

// The browser-facing origin. APP_BASE_URL wins because behind the preview proxy the
// request host is the internal sandbox host, not the URL the browser is using.
export function redirectUri(req) {
  const base = (process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  return `${base}/auth/google/callback`;
}

export function googleAuthUrl(req) {
  const state = base64url(crypto.randomBytes(16));
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return { url: `${GOOGLE_AUTH_URL}?${params}`, state, verifier };
}

export function setSessionCookie(res, user) {
  const payload = base64url(JSON.stringify({ ...user, iat: Date.now() }));
  appendCookie(res, SESSION_COOKIE, `${payload}.${signature(payload)}`, { maxAgeMs: SESSION_TTL_MS });
}

export function clearSessionCookie(res) {
  appendCookie(res, SESSION_COOKIE, '', { maxAgeMs: 0 });
}

export function appendCookie(res, name, value, options) {
  const cookie = serializeCookie(name, value, options);
  const existing = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', existing ? [].concat(existing, cookie) : cookie);
}

export function readSession(req) {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (!raw || !process.env.SESSION_SECRET) return null;
  const split = raw.lastIndexOf('.');
  if (split === -1) return null;
  const payload = raw.slice(0, split);
  const provided = Buffer.from(raw.slice(split + 1));
  const expected = Buffer.from(signature(payload));
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data?.iat || Date.now() - data.iat > SESSION_TTL_MS) return null;
    return { sub: data.sub, email: data.email, name: data.name, picture: data.picture ?? null };
  } catch {
    return null;
  }
}

export async function exchangeCodeForProfile({ code, codeVerifier, redirectUri: callbackUrl }) {
  const body = new URLSearchParams({
    code,
    code_verifier: codeVerifier,
    redirect_uri: callbackUrl,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    grant_type: 'authorization_code',
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const tokens = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(tokens.error_description || tokens.error || `Google rejected the sign-in code (${response.status}).`);
  }
  if (!tokens.access_token) throw new Error('Google did not return an access token.');

  const profileResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = await profileResponse.json().catch(() => ({}));
  if (!profileResponse.ok || !profile.sub) throw new Error('Could not read your Google profile.');
  if (!profile.email) throw new Error('That Google account has no email address.');

  return {
    sub: profile.sub,
    email: profile.email,
    name: profile.name || profile.email,
    picture: profile.picture ?? null,
  };
}
