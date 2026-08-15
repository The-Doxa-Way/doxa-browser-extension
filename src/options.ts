/**
 * Doxa for Chrome settings page. Lets the user paste an Anthropic key for unlimited BYOL.
 */

import { getAnthropicKey, setAnthropicKey, clearAnthropicKey } from './utils/doxa.js';

const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLElement;
const tierBadge = document.getElementById('tier-badge') as HTMLElement;

async function refreshTierBadge(): Promise<void> {
  const key = await getAnthropicKey();
  if (key) {
    tierBadge.textContent = 'BYOL';
    tierBadge.className = 'doxa-tier byol';
  } else {
    tierBadge.textContent = 'Free anon';
    tierBadge.className = 'doxa-tier free';
  }
}

function setStatus(message: string, kind: 'success' | 'error' | ''): void {
  statusEl.textContent = message;
  statusEl.className = `doxa-status ${kind}`;
}

saveBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    setStatus('Paste a key first, or click CLEAR to drop back to free.', 'error');
    return;
  }
  if (!key.startsWith('sk-ant-')) {
    setStatus('That does not look like an Anthropic key. They start with sk-ant-.', 'error');
    return;
  }
  await setAnthropicKey(key);
  apiKeyInput.value = '';
  setStatus('Saved. You are on the BYOL tier now.', 'success');
  await refreshTierBadge();
});

clearBtn.addEventListener('click', async () => {
  await clearAnthropicKey();
  apiKeyInput.value = '';
  setStatus('Cleared. Back on the free anon tier.', 'success');
  await refreshTierBadge();
});

void refreshTierBadge();
