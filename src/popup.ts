/**
 * Doxa for Chrome popup. Free-form encourage prompt; mirrors what the right-click
 * "Encourage me with this" menu does, but with a typed input.
 */

import { encourage } from './utils/doxa.js';
import { stripMarkdownLinks } from './lib/strip-markdown-links.js';
import { errorToToast } from './lib/error-toast.js';

const form = document.getElementById('encourage-form') as HTMLFormElement;
const situationInput = document.getElementById('situation') as HTMLTextAreaElement;
const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement;
const resultEl = document.getElementById('result') as HTMLElement;
const movementEl = document.getElementById('movement-badge') as HTMLElement;
const textEl = document.getElementById('result-text') as HTMLElement;
const scripturesEl = document.getElementById('scriptures') as HTMLElement;
const errorEl = document.getElementById('error') as HTMLElement;
const errorTextEl = document.getElementById('error-text') as HTMLElement;
const errorLinkEl = document.getElementById('error-link') as HTMLAnchorElement;
const quotaEl = document.getElementById('quota') as HTMLElement;
const quotaTextEl = document.getElementById('quota-text') as HTMLElement;
const openOptionsLink = document.getElementById('open-options') as HTMLAnchorElement;

openOptionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const situation = situationInput.value.trim();
  if (!situation) return;

  resetUI();
  submitBtn.disabled = true;
  submitBtn.textContent = 'ASKING DOXA...';

  try {
    const result = await encourage(situation);

    movementEl.textContent = result.movement || '';
    textEl.textContent = stripMarkdownLinks(result.text);
    scripturesEl.replaceChildren();
    for (const s of result.scriptures) {
      const a = document.createElement('a');
      a.href = s.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = s.ref;
      scripturesEl.appendChild(a);
    }
    resultEl.hidden = false;

    renderQuota(result.quota.tier, result.quota.used, result.quota.limit);
  } catch (err) {
    showError(err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'ENCOURAGE ME';
  }
});

function resetUI(): void {
  resultEl.hidden = true;
  errorEl.hidden = true;
  errorLinkEl.hidden = true;
  quotaEl.hidden = true;
  movementEl.textContent = '';
  textEl.textContent = '';
  scripturesEl.replaceChildren();
}

function showError(err: unknown): void {
  const toast = errorToToast(err);
  errorTextEl.textContent = toast.text;
  if (toast.state === 'error' && toast.link) {
    errorLinkEl.href = toast.link;
    errorLinkEl.textContent = toast.linkLabel || 'Open';
    errorLinkEl.hidden = false;
  }
  errorEl.hidden = false;
}

function renderQuota(tier: string, used: number, limit: number): void {
  if (tier === 'byol') {
    quotaTextEl.textContent = 'BYOL tier: unlimited';
  } else if (limit > 0) {
    quotaTextEl.textContent = `Free tier: ${used} / ${limit} used`;
  } else {
    quotaTextEl.textContent = 'Free tier';
  }
  quotaEl.hidden = false;
}
