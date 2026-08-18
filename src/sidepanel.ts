/**
 * Doxa Engage side panel.
 *
 * Persistent chat-like interface for multi-turn Engage sessions. The panel
 * stays open alongside any page and receives text from the selection bubble,
 * context menus, or direct user input.
 *
 * Multi-turn is simulated client-side: the MCP doxa_encourage tool is single-
 * turn, so we compose a richer `situation` string with abbreviated context
 * from prior exchanges. This stays within the 2000-char limit.
 */

import { encourage, type DoxaEncourageResult } from './utils/doxa.js';
import { stripMarkdownLinks } from './lib/strip-markdown-links.js';
import { errorToToast } from './lib/error-toast.js';
import { isSignedIn } from './utils/auth.js';

// --- DOM elements ---

const messagesEl = document.getElementById('messages') as HTMLElement;
const emptyStateEl = document.getElementById('empty-state') as HTMLElement;
const form = document.getElementById('engage-form') as HTMLFormElement;
const situationInput = document.getElementById('situation') as HTMLTextAreaElement;
const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement;
const quotaEl = document.getElementById('quota') as HTMLElement;
const newSessionBtn = document.getElementById('new-session-btn') as HTMLButtonElement;
const openOptionsLink = document.getElementById('open-options') as HTMLAnchorElement;

// --- Session state ---

interface Message {
  role: 'user' | 'doxa';
  text: string;
  movement?: string;
  scriptures?: Array<{ ref: string; link: string }>;
  timestamp: number;
}

interface Session {
  id: string;
  messages: Message[];
}

const MAX_SITUATION_LENGTH = 2000;
const MAX_CONTEXT_TURNS = 3;
const SESSION_STORAGE_KEY = 'doxa_engage_session';

let currentSession: Session = createSession();

function createSession(): Session {
  return {
    id: crypto.randomUUID(),
    messages: [],
  };
}

// --- Persistence ---

async function saveSession(): Promise<void> {
  await chrome.storage.local.set({
    [SESSION_STORAGE_KEY]: currentSession,
  });
}

async function loadSession(): Promise<void> {
  const stored = await chrome.storage.local.get(SESSION_STORAGE_KEY);
  const saved = stored[SESSION_STORAGE_KEY] as Session | undefined;
  if (saved && saved.id && Array.isArray(saved.messages)) {
    currentSession = saved;
    renderAllMessages();
  }
}

// --- Multi-turn context composition ---

function composeSituation(userText: string): string {
  const priorTurns = currentSession.messages.slice(-MAX_CONTEXT_TURNS * 2);
  if (priorTurns.length === 0) {
    return userText.slice(0, MAX_SITUATION_LENGTH);
  }

  // Build a compact context summary from prior turns.
  const contextParts: string[] = [];
  for (const msg of priorTurns) {
    if (msg.role === 'user') {
      // Truncate prior user messages to save space.
      const truncated = msg.text.length > 80 ? msg.text.slice(0, 77) + '...' : msg.text;
      contextParts.push(`Me: ${truncated}`);
    } else {
      // Summarise Doxa responses briefly.
      const truncated = msg.text.length > 120 ? msg.text.slice(0, 117) + '...' : msg.text;
      contextParts.push(`Doxa: ${truncated}`);
    }
  }

  const context = contextParts.join('\n');
  const composed = `[Session context]\n${context}\n\n[Now]\n${userText}`;

  return composed.slice(0, MAX_SITUATION_LENGTH);
}

// --- Rendering ---

function renderAllMessages(): void {
  // Clear all message elements but keep the empty state.
  const children = Array.from(messagesEl.children);
  for (const child of children) {
    if (child.id !== 'empty-state') {
      child.remove();
    }
  }

  if (currentSession.messages.length === 0) {
    emptyStateEl.hidden = false;
    return;
  }

  emptyStateEl.hidden = true;
  for (const msg of currentSession.messages) {
    appendMessageEl(msg, false);
  }
  scrollToBottom();
}

function appendMessageEl(msg: Message, animate: boolean): void {
  emptyStateEl.hidden = true;

  const wrapper = document.createElement('div');
  wrapper.className = `sp-msg sp-msg-${msg.role}`;
  if (!animate) wrapper.style.animation = 'none';

  const bubble = document.createElement('div');
  bubble.className = 'sp-msg-bubble';

  if (msg.role === 'doxa') {
    if (msg.movement) {
      const badge = document.createElement('div');
      badge.className = 'sp-movement';
      badge.textContent = msg.movement;
      bubble.appendChild(badge);
    }

    const text = document.createElement('div');
    text.className = 'sp-msg-text';
    text.textContent = msg.text;
    bubble.appendChild(text);

    if (msg.scriptures && msg.scriptures.length > 0) {
      const refs = document.createElement('div');
      refs.className = 'sp-scriptures';
      for (const s of msg.scriptures) {
        const a = document.createElement('a');
        a.href = s.link;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = s.ref;
        refs.appendChild(a);
      }
      bubble.appendChild(refs);
    }
  } else {
    const text = document.createElement('div');
    text.className = 'sp-msg-text';
    text.textContent = msg.text;
    bubble.appendChild(text);
  }

  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
}

function appendLoadingEl(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'sp-msg sp-msg-doxa';
  wrapper.id = 'loading-msg';

  const bubble = document.createElement('div');
  bubble.className = 'sp-msg-bubble sp-loading';
  bubble.textContent = 'Asking Doxa';

  const dots = document.createElement('span');
  dots.className = 'sp-loading-dots';
  bubble.appendChild(dots);

  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
  scrollToBottom();
  return wrapper;
}

function removeLoadingEl(): void {
  document.getElementById('loading-msg')?.remove();
}

function scrollToBottom(): void {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderQuota(tier: string, used: number, limit: number): void {
  if (tier === 'subscription') {
    quotaEl.textContent = `${used} / ${limit} today`;
  } else if (limit > 0) {
    quotaEl.textContent = `${used} / ${limit} used`;
  } else {
    quotaEl.textContent = '';
    quotaEl.hidden = true;
    return;
  }
  quotaEl.hidden = false;
}

// --- Engage flow ---

async function handleEngage(userText: string): Promise<void> {
  const trimmed = userText.trim();
  if (!trimmed) return;

  // Add user message.
  const userMsg: Message = { role: 'user', text: trimmed, timestamp: Date.now() };
  currentSession.messages.push(userMsg);
  appendMessageEl(userMsg, true);
  scrollToBottom();

  situationInput.value = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'ASKING...';

  appendLoadingEl();

  try {
    const situation = composeSituation(trimmed);
    const result: DoxaEncourageResult = await encourage(situation);

    removeLoadingEl();

    const doxaMsg: Message = {
      role: 'doxa',
      text: stripMarkdownLinks(result.text),
      movement: result.movement || undefined,
      scriptures: result.scriptures,
      timestamp: Date.now(),
    };
    currentSession.messages.push(doxaMsg);
    appendMessageEl(doxaMsg, true);
    scrollToBottom();

    renderQuota(result.quota.tier, result.quota.used, result.quota.limit);

    await saveSession();
  } catch (err) {
    removeLoadingEl();

    const toast = errorToToast(err, { signedIn: await isSignedIn() });
    const errorMsg: Message = {
      role: 'doxa',
      text: toast.text,
      timestamp: Date.now(),
    };
    currentSession.messages.push(errorMsg);
    appendMessageEl(errorMsg, true);
    scrollToBottom();

    await saveSession();
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'ENGAGE';
  }
}

// --- Event listeners ---

form.addEventListener('submit', (e) => {
  e.preventDefault();
  void handleEngage(situationInput.value);
});

// Ctrl/Cmd+Enter to submit.
situationInput.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    void handleEngage(situationInput.value);
  }
});

newSessionBtn.addEventListener('click', async () => {
  currentSession = createSession();
  renderAllMessages();
  situationInput.value = '';
  quotaEl.hidden = true;
  await saveSession();
  situationInput.focus();
});

openOptionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// Listen for messages from the background (selection bubble / context menu).
chrome.runtime.onMessage.addListener((msg: { action: string; text?: string }) => {
  if (msg.action === 'encourage-in-panel' && msg.text) {
    // Auto-fill and auto-submit.
    void handleEngage(msg.text);
  }
});

// --- Init ---

void loadSession();
situationInput.focus();
