/**
 * Doxa for Chrome settings page. Sign in with a Doxa account; an active
 * subscription keeps encouragement coming after the free trial.
 */

import { signIn, signOut, sessionEmail } from './utils/auth.js';
import { scripture } from './utils/doxa.js';

const signInBtn = document.getElementById('sign-in-btn') as HTMLButtonElement;
const signOutBtn = document.getElementById('sign-out-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLElement;
const accountEl = document.getElementById('account-state') as HTMLElement;
const tierBadge = document.getElementById('tier-badge') as HTMLElement;

async function refreshAccountState(): Promise<void> {
  const email = await sessionEmail();
  if (email) {
    accountEl.textContent = `Signed in as ${email}.`;
    tierBadge.textContent = 'Checking subscription...';
    tierBadge.className = 'doxa-tier free';
    signInBtn.hidden = true;
    signOutBtn.hidden = false;
    void probeSubscription();
  } else {
    accountEl.textContent = 'Signed out. The free trial applies.';
    tierBadge.textContent = 'Free trial';
    tierBadge.className = 'doxa-tier free';
    signInBtn.hidden = false;
    signOutBtn.hidden = true;
  }
}

/**
 * The server owns entitlement, so ask it: a scripture call is free and
 * uncapped, and its quota metadata says which tier this session lands on.
 */
async function probeSubscription(): Promise<void> {
  try {
    const result = await scripture('John 14:6');
    const subscribed = (result.quota.tier as string) === 'subscription';
    tierBadge.textContent = subscribed ? 'Subscription active' : 'Signed in, no active subscription';
    tierBadge.className = subscribed ? 'doxa-tier active' : 'doxa-tier free';
  } catch {
    tierBadge.textContent = 'Signed in';
    tierBadge.className = 'doxa-tier free';
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
