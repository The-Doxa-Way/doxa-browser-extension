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

export const SUBSCRIBE_URL =
  'https://doxa.app/pricing?utm_source=extension&utm_medium=paywall&utm_campaign=trial_exhausted';

export function errorToToast(err: unknown, opts?: { signedIn?: boolean }): ToastPayload {
  if (err instanceof DoxaRateLimitError) {
    // The server reports tier 'subscription' for signed-in subscribers who
    // hit the daily fair-use cap (the client's type union lags the server).
    if ((err.quota.tier as string) === 'subscription') {
      return {
        state: 'error',
        text: `Today's fair-use limit (${err.quota.limit} encouragements) is reached. It resets tomorrow.`,
      };
    }
    if (opts?.signedIn) {
      return {
        state: 'error',
        text: 'Your free encouragements are used. If you already subscribe, sign out and back in via Settings to reconnect; to start a subscription, see plans.',
        link: SUBSCRIBE_URL,
        linkLabel: 'See plans',
      };
    }
    return {
      state: 'error',
      text: 'Your free encouragements are used. To keep going, click the Doxa icon in your toolbar, open Settings, and sign in with your Doxa account.',
    };
  }
  if (err instanceof DoxaError) {
    return { state: 'error', text: `Doxa returned an error: ${err.message}` };
  }
  return { state: 'error', text: 'Something went wrong. Please try again.' };
}
