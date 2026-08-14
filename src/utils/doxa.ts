/**
 * Doxa MCP wrapper for the browser extension.
 *
 * Reads the BYOL Anthropic key from chrome.storage.local when present,
 * otherwise calls the free anon tier (10 calls/day per caller). All requests
 * go directly to doxa.app/mcp/v1 via native fetch from the extension origin.
 */

import {
  DoxaClient,
  DoxaError,
  DoxaRateLimitError,
  type DoxaEncourageResult,
  type DoxaScriptureResult,
} from '@thedoxaway/mcp-client';
import { callerIdFromUuid, isValidCallerId } from '../lib/caller.js';

const STORAGE_KEY = 'doxa_anthropic_key';
const CALLER_KEY = 'doxa_caller_id';

export { DoxaError, DoxaRateLimitError };
export type { DoxaEncourageResult, DoxaScriptureResult };

export async function getAnthropicKey(): Promise<string | undefined> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const key = stored[STORAGE_KEY];
  return typeof key === 'string' && key.length > 0 ? key : undefined;
}

export async function setAnthropicKey(key: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: key });
}

export async function clearAnthropicKey(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}

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
  const [anthropicKey, callerId] = await Promise.all([
    getAnthropicKey(),
    getOrCreateCallerId(),
  ]);
  return new DoxaClient({
    anthropicKey,
    callerId,
    userAgent: `doxa-browser-extension/${chrome.runtime.getManifest().version}`,
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
