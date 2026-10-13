// Minimal cookie helpers so the app stays dependency-light.

export function parseCookies(header = '') {
  const cookies = {};
  for (const part of String(header).split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const name = trimmed.slice(0, index).trim();
    const raw = trimmed.slice(index + 1).trim();
    const value = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

export function serializeCookie(name, value, { maxAgeMs, path = '/', httpOnly = true, sameSite = 'Lax' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (httpOnly) parts.push('HttpOnly');
  if (typeof maxAgeMs === 'number') parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeMs / 1000))}`);
  return parts.join('; ');
}
