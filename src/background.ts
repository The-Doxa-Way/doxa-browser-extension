/**
 * Doxa for Chrome service worker.
 *
 * Routes encouragement requests from three sources:
 *
 *   1. Right-click context menu ("Encourage me with this" / "Look up in Doxa")
 *   2. Selection bubble (content script click → chrome.runtime.sendMessage)
 *   3. Side panel (calls encourage() directly, no routing needed)
 *
 * Results route to the side panel if it is open, otherwise to an injected
 * toast on the active tab.
 */

import { encourage, scripture } from './utils/doxa.js';
import { isSignedIn } from './utils/auth.js';
import { extractBibleRef } from './lib/bible-ref.js';
import { stripMarkdownLinks } from './lib/strip-markdown-links.js';
import { errorToToast, type ToastPayload } from './lib/error-toast.js';

const MENU_ENCOURAGE = 'doxa-encourage';
const MENU_SCRIPTURE = 'doxa-scripture';

// The situation cap documented by the doxa_encourage tool schema. The popup
// enforces the same limit via textarea maxlength.
const MAX_SITUATION_LENGTH = 2000;

// --- Side panel liveness tracking ---
// chrome.extension.getViews() is foreground-only and unavailable in an MV3
// service worker. Instead, the side panel opens a long-lived port on load;
// we track connect/disconnect to know whether it is open.

let sidePanelPort: chrome.runtime.Port | null = null;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'doxa-sidepanel') {
    sidePanelPort = port;
    port.onDisconnect.addListener(() => {
      if (sidePanelPort === port) sidePanelPort = null;
    });
  }
});

function isSidePanelOpen(): boolean {
  return sidePanelPort !== null;
}

// --- Setup ---

chrome.runtime.onInstalled.addListener(() => {
  // onInstalled also fires on updates and dev reloads, when the menu items
  // from the previous version still exist — clear them or create() fails
  // with a duplicate-id error.
  // v0.2 stored a user-supplied Anthropic key (BYOL, removed surface).
  // Purge it on upgrade so no secret lingers with no UI left to clear it.
  void chrome.storage.local.remove('doxa_anthropic_key');
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ENCOURAGE,
      title: 'Encourage me with this',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: MENU_SCRIPTURE,
      title: 'Look up in Doxa',
      contexts: ['selection'],
    });
  });

  // Make the toolbar icon open the side panel instead of the popup.
  // Runs in onInstalled (not top-level) to avoid re-running on every SW wake.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(console.error);
});

// --- Context menu handler ---

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void handleMenuClick(info, tab);
});

async function handleMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab: chrome.tabs.Tab | undefined,
): Promise<void> {
  if (!tab?.id || !info.selectionText) return;
  const text = info.selectionText.trim();
  if (!text) return;

  // Check if it is a scripture lookup.
  const ref = info.menuItemId === MENU_SCRIPTURE ? extractBibleRef(text) : undefined;
  if (ref) {
    await showToast(tab.id, { state: 'loading', text: 'Looking up...' });
    try {
      const result = await scripture(ref);
      await showToast(tab.id, {
        state: 'result',
        title: result.reference,
        text: stripMarkdownLinks(result.text),
        link: result.link,
        linkLabel: 'Open in Doxa',
      });
    } catch (err) {
      await showToast(tab.id, errorToToast(err, { signedIn: await isSignedIn() }));
    }
    return;
  }

  // Encourage flow — route to side panel or toast.
  await encourageAndRoute(text, tab);
}

// --- Selection bubble handler ---

chrome.runtime.onMessage.addListener((msg, sender, _sendResponse) => {
  // Validate: only accept messages from our own content scripts (sender.tab
  // is set for content-script origins) with the expected shape.
  if (
    msg?.action === 'encourage-selection' &&
    typeof msg.text === 'string' &&
    sender.tab
  ) {
    void handleBubbleClick(msg.text);
  }
});

async function handleBubbleClick(text: string): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  await encourageAndRoute(text, tab);
}

// --- Shared encourage + route logic ---

async function encourageAndRoute(
  text: string,
  tab: chrome.tabs.Tab,
): Promise<void> {
  const tabId = tab.id!;
  const trimmed = text.trim().slice(0, MAX_SITUATION_LENGTH);
  if (!trimmed) return;

  // Try to route to the side panel first.
  if (isSidePanelOpen()) {
    // Send the text to the side panel for the Engage session flow.
    try {
      await chrome.runtime.sendMessage({
        action: 'encourage-in-panel',
        text: trimmed,
      });
      return;
    } catch {
      // Side panel might have closed between check and send. Fall through to toast.
    }
  }

  // Fall back to toast on the active tab.
  await showToast(tabId, { state: 'loading', text: 'Asking Doxa...' });
  try {
    const result = await encourage(trimmed);
    await showToast(tabId, {
      state: 'result',
      title: result.movement || 'Encouragement',
      text: stripMarkdownLinks(result.text),
      scriptures: result.scriptures,
    });
  } catch (err) {
    await showToast(tabId, errorToToast(err, { signedIn: await isSignedIn() }));
  }
}

// --- Toast injection ---

async function showToast(tabId: number, payload: ToastPayload): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: renderToast,
      args: [payload],
    });
  } catch (err) {
    // Some pages (chrome://, the Web Store, internal PDF viewers) refuse
    // script injection. There is no recovery — just log.
    console.error('[doxa] could not inject toast', err);
  }
}

/**
 * Injected into the active tab to render the toast. Self-contained: no closures,
 * no external symbols. The bundler must not transform this.
 */
function renderToast(payload: ToastPayload): void {
  const HOST_ID = 'doxa-toast-host';
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = [
    'position: fixed',
    'top: 16px',
    'right: 16px',
    'z-index: 2147483647',
    'pointer-events: none',
  ].join(';');
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    .toast {
      pointer-events: auto;
      width: 360px;
      max-width: calc(100vw - 32px);
      background: #1A1A1A;
      color: #FFFFFF;
      border: 1px solid #3C3C3C;
      border-radius: 16px;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      animation: doxa-slide 0.2s ease-out;
    }
    @keyframes doxa-slide {
      from { transform: translateX(20px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .badge {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.1em; color: #FF9500;
    }
    .close {
      background: transparent; border: 0; color: #707070; cursor: pointer;
      font-size: 18px; line-height: 1; padding: 0; width: 24px; height: 24px;
    }
    .close:hover { color: #FFFFFF; }
    .body { white-space: pre-wrap; color: #FFFFFF; }
    .body.loading { color: #707070; }
    .scriptures { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 6px; }
    .scriptures a, .link {
      display: inline-block; padding: 6px 12px; font-size: 12px;
      color: #FF9500; background: rgba(255,149,0,0.08);
      border: 1px solid rgba(255,149,0,0.3); border-radius: 999px;
      text-decoration: none;
    }
    .scriptures a:hover, .link:hover { background: rgba(255,149,0,0.16); }
    .footer-link { margin-top: 12px; }
  `;
  shadow.appendChild(style);

  const toast = document.createElement('div');
  toast.className = 'toast';

  const header = document.createElement('div');
  header.className = 'header';

  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = (payload.state === 'result' && payload.title) || 'Doxa';

  const close = document.createElement('button');
  close.className = 'close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', () => host.remove());

  header.appendChild(badge);
  header.appendChild(close);
  toast.appendChild(header);

  const body = document.createElement('div');
  body.className = 'body ' + payload.state;
  body.textContent = payload.text;
  toast.appendChild(body);

  if (payload.state === 'result' && payload.scriptures && payload.scriptures.length > 0) {
    const refs = document.createElement('div');
    refs.className = 'scriptures';
    for (const s of payload.scriptures) {
      const a = document.createElement('a');
      a.href = s.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = s.ref;
      refs.appendChild(a);
    }
    toast.appendChild(refs);
  }

  if ((payload.state === 'result' || payload.state === 'error') && payload.link) {
    const footer = document.createElement('div');
    footer.className = 'footer-link';
    const a = document.createElement('a');
    a.className = 'link';
    a.href = payload.link;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = payload.linkLabel || 'Open';
    footer.appendChild(a);
    toast.appendChild(footer);
  }

  shadow.appendChild(toast);

  // Auto-dismiss non-loading toasts after a while.
  if (payload.state !== 'loading') {
    setTimeout(() => {
      if (document.getElementById(HOST_ID) === host) host.remove();
    }, 18000);
  }
}
