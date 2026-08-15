/**
 * Doxa account session for the extension.
 *
 * Sign-in runs through doxa.app/app/extension/connect (all providers work
 * there); the page hands access+refresh tokens back via the
 * chrome.identity.launchWebAuthFlow redirect fragment. Tokens live in
 * chrome.storage.local; access tokens are refreshed proactively against
 * Supabase auth with the public anon key, so the server never needs an
 * auth-retry protocol (invalid bearers just degrade to anonymous).
 */

import { parseAuthFragment, jwtEmail, shouldRefresh, type SessionTokens } from '../lib/session.js';

// Public client config (baked into every Doxa client bundle; not a secret).
const SUPABASE_URL = 'https://nhkmkvwodisevtyvauvt.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oa21rdndvZGlzZXZ0eXZhdXZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyNDcxNTIsImV4cCI6MjA2NTgyMzE1Mn0.iNMMqRXwq0I0BcdRCqKqRfK6W_MTQbUfF-LQ-uVSKfs';

const CONNECT_URL = 'https://doxa.app/app/extension/connect';
const SESSION_KEY = 'doxa_session';

async function readSession(): Promise<SessionTokens | null> {
  const stored = await chrome.storage.local.get(SESSION_KEY);
  const s = stored[SESSION_KEY];
  return s && typeof s.accessToken === 'string' && typeof s.refreshToken === 'string'
    ? (s as SessionTokens)
    : null;
}

async function writeSession(tokens: SessionTokens | null): Promise<void> {
  if (tokens) await chrome.storage.local.set({ [SESSION_KEY]: tokens });
  else await chrome.storage.local.remove(SESSION_KEY);
}

/** Interactive sign-in via the connect page. Throws on user cancel/failure. */
export async function signIn(): Promise<void> {
  const redirectUri = chrome.identity.getRedirectURL();
  const url = `${CONNECT_URL}?redirect_uri=${encodeURIComponent(redirectUri)}`;
  const responseUrl = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
  const tokens = responseUrl ? parseAuthFragment(responseUrl) : null;
  if (!tokens) throw new Error('Sign-in was cancelled or returned no session.');
  await writeSession(tokens);
}

export async function signOut(): Promise<void> {
  await writeSession(null);
}

export async function isSignedIn(): Promise<boolean> {
  return (await readSession()) !== null;
}

/** Signed-in email for the settings display, or null. */
export async function sessionEmail(): Promise<string | null> {
  const session = await readSession();
  return session ? jwtEmail(session.accessToken) : null;
}

/**
 * Current access token, refreshed if it is about to expire. Returns null
 * when signed out or when the refresh fails (session is then cleared).
 */
export async function getAccessToken(): Promise<string | null> {
  const session = await readSession();
  if (!session) return null;
  if (!shouldRefresh(session.accessToken, Date.now() / 1000)) return session.accessToken;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });
    if (!res.ok) throw new Error(`refresh failed: ${res.status}`);
    const data = await res.json();
    if (typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string') {
      throw new Error('refresh returned no session');
    }
    const next: SessionTokens = { accessToken: data.access_token, refreshToken: data.refresh_token };
    await writeSession(next);
    return next.accessToken;
  } catch (err) {
    console.error('[doxa] session refresh failed; signing out', err);
    await writeSession(null);
    return null;
  }
}
