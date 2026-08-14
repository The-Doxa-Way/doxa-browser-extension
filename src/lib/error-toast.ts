/**
 * Maps errors from the Doxa MCP client onto toast payloads. Pure logic,
 * shared by the service worker; kept chrome-free so it is testable in node.
 */

import { DoxaError, DoxaRateLimitError } from '@thedoxaway/mcp-client';

export interface ToastScripture {
  ref: string;
  link: string;
}

export type ToastPayload =
  | { state: 'loading'; text: string }
  | {
      state: 'result';
      title?: string;
      text: string;
      link?: string;
      linkLabel?: string;
      scriptures?: ToastScripture[];
    }
  | {
      state: 'error';
      text: string;
      link?: string;
      linkLabel?: string;
    };

export function errorToToast(err: unknown): ToastPayload {
  if (err instanceof DoxaRateLimitError) {
    return {
      state: 'error',
      text: `Doxa free tier hit its daily limit (${err.quota.used}/${err.quota.limit}). Add your own Anthropic key in Settings for unlimited.`,
      link: err.byolUrl,
      linkLabel: 'How to upgrade',
    };
  }
  if (err instanceof DoxaError) {
    return { state: 'error', text: `Doxa returned an error: ${err.message}` };
  }
  return { state: 'error', text: 'Something went wrong. Please try again.' };
}
