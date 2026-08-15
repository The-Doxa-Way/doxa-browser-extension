/**
 * Chrome-free session logic for the Doxa sign-in. Token transport and
 * storage live in utils/auth.ts; everything here is pure and tested.
 */

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Parse the tokens out of the redirect URL the connect page produced:
 * https://<id>.chromiumapp.org/#access_token=...&refresh_token=...
 */
export function parseAuthFragment(url: string): SessionTokens | null {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return null;
  const params = new URLSearchParams(url.slice(hashIndex + 1));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

/** Decode a JWT's payload without verifying it (display + expiry only). */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

/** Unix-seconds expiry of a JWT, or null when unreadable. */
export function jwtExpiry(token: string): number | null {
  const payload = decodeJwtPayload(token);
  return payload && typeof payload.exp === 'number' ? payload.exp : null;
}

/** The email claim, for the signed-in settings display. */
export function jwtEmail(token: string): string | null {
  const payload = decodeJwtPayload(token);
  return payload && typeof payload.email === 'string' ? payload.email : null;
}

/**
 * Refresh when the token is unreadable or expires within the next minute —
 * proactive refresh is what lets the server treat invalid bearers as
 * anonymous instead of needing an auth-retry protocol.
 */
export function shouldRefresh(token: string, nowSeconds: number): boolean {
  const exp = jwtExpiry(token);
  return exp === null || exp - nowSeconds < 60;
}
