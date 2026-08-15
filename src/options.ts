/**
 * Doxa for Chrome settings page. Sign in with a Doxa account; an active
 * subscription keeps encouragement coming after the free trial.
 */

import { signIn, signOut, sessionEmail } from './utils/auth.js';

const signInBtn = document.getElementById('sign-in-btn') as HTMLButtonElement;
const signOutBtn = document.getElementById('sign-out-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLElement;
const accountEl = document.getElementById('account-state') as HTMLElement;
const tierBadge = document.getElementById('tier-badge') as HTMLElement;

async function refreshAccountState(): Promise<void> {
  const email = await sessionEmail();
  if (email) {
    accountEl.textContent = `Signed in as ${email}.`;
    tierBadge.textContent = 'Signed in';
    tierBadge.className = 'doxa-tier byol';
    signInBtn.hidden = true;
    signOutBtn.hidden = false;
  } else {
    accountEl.textContent = 'Signed out. The free trial applies.';
    tierBadge.textContent = 'Free trial';
    tierBadge.className = 'doxa-tier free';
    signInBtn.hidden = false;
    signOutBtn.hidden = true;
  }
}

function setStatus(message: string, kind: 'success' | 'error' | ''): void {
  statusEl.textContent = message;
  statusEl.className = `doxa-status ${kind}`;
}

signInBtn.addEventListener('click', async () => {
  setStatus('', '');
  signInBtn.disabled = true;
  try {
    await signIn();
    setStatus('Connected. Your Doxa account is signed in.', 'success');
  } catch {
    setStatus('Sign-in was cancelled or failed. Please try again.', 'error');
  } finally {
    signInBtn.disabled = false;
    await refreshAccountState();
  }
});

signOutBtn.addEventListener('click', async () => {
  await signOut();
  setStatus('Signed out.', 'success');
  await refreshAccountState();
});

void refreshAccountState();
