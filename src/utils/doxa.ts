/**
 * Doxa MCP wrapper for the browser extension.
 *
 * Anonymous installs get the server-enforced free trial. Signed-in users
 * (Doxa account + active subscription) get ongoing use: every request
 * carries `Authorization: Bearer <access token>` via a wrapping fetch, and
 * the server decides entitlement. All requests go directly to
 * doxa.app/mcp/v1 from the extension origin.
 */

import {
  DoxaClient,
  DoxaError,
  DoxaRateLimitError,
  type DoxaEncourageResult,
  type DoxaScriptureResult,
} from '@thedoxaway/mcp-client';
import { callerIdFromUuid, isValidCallerId } from '../lib/caller.js';
import { getAccessToken } from './auth.js';

const CALLER_KEY = 'doxa_caller_id';

export { DoxaError, DoxaRateLimitError };
export type { DoxaEncourageResult, DoxaScriptureResult };

/**
 * Stable per-install caller id so the free tier counts this install as one
 * caller. Generated once, kept in chrome.storage.local. Two contexts (popup
 * and service worker) can race to create it; the id is only a quota bucket,
 * so last-write-wins is acceptable.
 */
export async function getOrCreateCallerId(): Promise<string> {
  const stored = await chrome.storage.local.get(CALLER_KEY);
  const existing = stored[CALLER_KEY];
  if (isValidCallerId(existing)) return existing;
  const fresh = callerIdFromUuid(crypto.randomUUID());
  await chrome.storage.local.set({ [CALLER_KEY]: fresh });
  return fresh;
}

async function buildClient(): Promise<DoxaClient> {
  const [callerId, accessToken] = await Promise.all([
    getOrCreateCallerId(),
    getAccessToken(),
  ]);
  const authFetch: typeof fetch = (input, init) => {
    if (!accessToken) return fetch(input, init);
    const headers = new Headers(init?.headers);
    headers.set('authorization', `Bearer ${accessToken}`);
    return fetch(input, { ...init, headers });
  };
  return new DoxaClient({
    callerId,
    userAgent: `doxa-browser-extension/${chrome.runtime.getManifest().version}`,
    fetch: authFetch,
  });
}

export async function encourage(situation: string): Promise<DoxaEncourageResult> {
  const client = await buildClient();
  return client.encourage(situation);
}

export async function scripture(reference: string): Promise<DoxaScriptureResult> {
  const client = await buildClient();
  return client.scripture(reference);
}
