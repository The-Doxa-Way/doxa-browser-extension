/**
 * Content script — floating selection bubble.
 *
 * When the user selects text on any page, a small Doxa flame button appears
 * near the selection. Clicking it sends the selected text to the background
 * service worker for encouragement. This is the Mac-smooth alternative to
 * right-click context menus.
 *
 * Uses shadow DOM to isolate styles from the host page.
 * Does NOT appear in textareas, inputs, or contenteditable elements.
 */

const BUBBLE_HOST_ID = 'doxa-bubble-host';
const MIN_SELECTION_LENGTH = 3;
const AUTO_DISMISS_MS = 8000;

// Doxa Mountains logo as an inline SVG data URI (white on transparent).
const DOXA_FLAME_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="18" height="18">
  <g transform="translate(56, 158) scale(0.406)">
    <path fill="#FFFFFF" d="M580.19,483.47c-50.89-53.63-100.7-106.11-150.84-158.95c21.25-21.83,41.84-42.97,63.09-64.8
      c-31.23-32.43-61.99-64.36-93.17-96.75c31.07-32.46,61.72-64.48,92.7-96.86c31.41,32.66,62.34,64.83,93.53,97.27
      c-26.53,27.58-52.64,54.72-78.95,82.08c11.63,10.76,21.08,22.43,32.27,32.28c48.72-50.41,97.01-100.36,145.79-150.83
      c63.02,65.53,126.38,129.88,189.65,196.71c-136.79,0-271.98,0-409.07,0c15.98,16.84,30.63,32.28,44.71,47.12
      c158.6,0,316.28,0,475.53,0C884.38,266.48,784.5,163.39,684.73,60.43c-22.49,23.32-44.63,46.28-67,69.48
      C575.76,86.16,534.54,42.92,491.7,0c-41.64,43.35-83.13,86.54-124.97,130.1c-22.63-23.55-44.75-46.57-67.28-70.02
      C200.51,164.31,99.16,265.77,0,370.92c17.55,1.64,355.69,0.68,363.29-1.09c-14.86-15.65-29.35-30.92-44.24-46.6
      c-69.39,0-138.75,0-209.74,0c64.03-66.11,126.85-130.99,190.19-196.38c42.96,44.48,85.32,88.33,128.22,132.75
      c-21.11,21.9-41.61,43.16-62.64,64.97c50.58,53.09,101.06,106.08,151.38,158.9C537.53,483.47,558.13,483.47,580.19,483.47z"/>
  </g>
</svg>`;

let dismissTimer: ReturnType<typeof setTimeout> | undefined;

function isEditableTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea' || tag === 'input') return true;
  if (el.getAttribute('contenteditable') === 'true') return true;
  if (el.closest('[contenteditable="true"]')) return true;
  return false;
}

function removeBubble(): void {
  document.getElementById(BUBBLE_HOST_ID)?.remove();
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = undefined;
  }
}

function getSelectionRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(sel.rangeCount - 1);
  const rects = range.getClientRects();
  if (rects.length === 0) return null;
  // Use the last rect (end of selection) for positioning.
  return rects[rects.length - 1]!;
}

function showBubble(selectionText: string): void {
  removeBubble();

  const rect = getSelectionRect();
  if (!rect) return;

  const host = document.createElement('div');
  host.id = BUBBLE_HOST_ID;
  host.style.cssText = [
    'position: fixed',
    'z-index: 2147483646',
    'pointer-events: none',
  ].join(';');
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    .doxa-bubble {
      pointer-events: auto;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #1A1A1A;
      border: 1px solid #3C3C3C;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      animation: doxa-bubble-in 0.15s ease-out;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .doxa-bubble:hover {
      border-color: #FF4500;
      box-shadow: 0 4px 16px rgba(255,69,0,0.25);
    }
    @keyframes doxa-bubble-in {
      from { transform: scale(0.6); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
  `;
  shadow.appendChild(style);

  const btn = document.createElement('button');
  btn.className = 'doxa-bubble';
  btn.setAttribute('aria-label', 'Engage Scripture with Doxa');
  btn.innerHTML = DOXA_FLAME_SVG;

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Re-read selection at click time (it may have changed).
    const currentSel = window.getSelection()?.toString().trim() || selectionText;
    chrome.runtime.sendMessage({
      action: 'encourage-selection',
      text: currentSel,
    });
    removeBubble();
  });

  shadow.appendChild(btn);

  // Position: 8px above the end of the selection, or below if near top.
  const bubbleSize = 32;
  const gap = 8;
  let top = rect.top - bubbleSize - gap;
  if (top < 8) {
    top = rect.bottom + gap;
  }
  let left = rect.right - bubbleSize / 2;
  // Clamp to viewport.
  left = Math.max(8, Math.min(left, window.innerWidth - bubbleSize - 8));

  host.style.top = `${top}px`;
  host.style.left = `${left}px`;

  // Auto-dismiss after timeout.
  dismissTimer = setTimeout(removeBubble, AUTO_DISMISS_MS);
}

// --- Event listeners ---

document.addEventListener('mouseup', (e: MouseEvent) => {
  // Small delay so the selection is finalized.
  setTimeout(() => {
    const target = e.target as Element | null;
    if (isEditableTarget(target)) return;

    const sel = window.getSelection();
    const text = sel?.toString().trim() || '';
    if (text.length < MIN_SELECTION_LENGTH) {
      removeBubble();
      return;
    }

    showBubble(text);
  }, 10);
});

document.addEventListener('mousedown', (e: MouseEvent) => {
  // If clicking on the bubble itself, let the bubble's click handler fire.
  const host = document.getElementById(BUBBLE_HOST_ID);
  if (host && e.composedPath().includes(host)) return;
  removeBubble();
});

// Dismiss on scroll.
window.addEventListener('scroll', removeBubble, { passive: true, capture: true });

// Dismiss when selection is cleared programmatically.
document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  const text = sel?.toString().trim() || '';
  if (text.length < MIN_SELECTION_LENGTH) {
    removeBubble();
  }
});
