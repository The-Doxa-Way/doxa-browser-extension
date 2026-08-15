/**
 * Tests for the chrome-free extension logic in src/lib/. Runs against the
 * built output (dist/), so `npm test` builds first — this also exercises the
 * copy-static import rewrite that the shipped extension relies on.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { looksLikeBibleRef, extractBibleRef } from '../dist/lib/bible-ref.js';
import { callerIdFromUuid, isValidCallerId, CALLER_SURFACE } from '../dist/lib/caller.js';
import { errorToToast, SUBSCRIBE_URL } from '../dist/lib/error-toast.js';
import { stripMarkdownLinks } from '../dist/lib/strip-markdown-links.js';
import { DoxaError, DoxaRateLimitError } from '../dist/vendor/mcp-client/index.js';

test('looksLikeBibleRef accepts common reference shapes', () => {
  for (const ref of [
    'John 14:6',
    '1 John 4:8',
    'Psalm 23',
    'Psalm 23:1-3',
    'Song of Solomon 2:10',
    'Revelation 21:4',
    'He quoted John 3:16 to me',
  ]) {
    assert.equal(looksLikeBibleRef(ref), true, `should match: ${ref}`);
  }
});

test('looksLikeBibleRef rejects non-references', () => {
  for (const text of ['', 'hi', 'John', '42', 'a 1']) {
    assert.equal(looksLikeBibleRef(text), false, `should not match: ${text}`);
  }
});

test('extractBibleRef pulls the reference out of surrounding prose', () => {
  assert.equal(extractBibleRef('He quoted John 3:16 to me yesterday'), 'John 3:16');
  assert.equal(extractBibleRef('see 1 John 4:8 for this'), '1 John 4:8');
  assert.equal(extractBibleRef('Song of Solomon 2:10'), 'Song of Solomon 2:10');
  assert.equal(extractBibleRef('Psalm 23:1-3 stayed with her'), 'Psalm 23:1-3');
  assert.equal(extractBibleRef('psalm 23'), 'psalm 23');
});

test('extractBibleRef prefers the anchored book over preceding words', () => {
  assert.equal(extractBibleRef('Read John 3:16 tonight'), 'John 3:16');
});

test('extractBibleRef falls back to a short ref-shaped selection', () => {
  // Unknown book word, but short and ref-shaped: let the server decide.
  assert.equal(extractBibleRef('Canticles 2:10'), 'Canticles 2:10');
});

test('extractBibleRef returns undefined when nothing usable exists', () => {
  assert.equal(extractBibleRef('no reference here'), undefined);
  assert.equal(extractBibleRef(''), undefined);
  const long = 'Boeing 747 stories. '.repeat(10);
  assert.equal(extractBibleRef(long), undefined);
});

test('callerIdFromUuid strips dashes and prefixes the surface', () => {
  const id = callerIdFromUuid('123e4567-e89b-12d3-a456-426614174000');
  assert.equal(id, `${CALLER_SURFACE}:123e4567e89b12d3a456426614174000`);
  assert.equal(isValidCallerId(id), true);
});

test('callerIdFromUuid throws on input with no alphanumeric id', () => {
  assert.throws(() => callerIdFromUuid('---'));
  assert.throws(() => callerIdFromUuid(''));
});

test('isValidCallerId enforces surface:alnum shape', () => {
  assert.equal(isValidCallerId('ext:abc123'), true);
  assert.equal(isValidCallerId('ext:'), false);
  assert.equal(isValidCallerId('EXT:abc'), false);
  assert.equal(isValidCallerId('ext:abc def'), false);
  assert.equal(isValidCallerId(undefined), false);
  assert.equal(isValidCallerId(42), false);
});

test('stripMarkdownLinks collapses inline links to their text', () => {
  assert.equal(
    stripMarkdownLinks('See [Joshua 4:6-7](https://doxa.app/bible/JOS/4/6?utm_source=mcp) today.'),
    'See Joshua 4:6-7 today.',
  );
  assert.equal(
    stripMarkdownLinks('[A](https://x.example/a) and [B](https://x.example/b)'),
    'A and B',
  );
});

test('stripMarkdownLinks leaves plain text and bare brackets alone', () => {
  assert.equal(stripMarkdownLinks('no links here'), 'no links here');
  assert.equal(stripMarkdownLinks('array[0] notation (kept)'), 'array[0] notation (kept)');
});

test('errorToToast: signed-out trial exhaustion points at Settings sign-in', () => {
  const err = new DoxaRateLimitError('limit', 'https://doxa.app/mcp#byol', {
    tier: 'free',
    used: 10,
    limit: 10,
  });
  const toast = errorToToast(err);
  assert.equal(toast.state, 'error');
  assert.match(toast.text, /sign in with your Doxa account/i);
  assert.equal(toast.link, undefined);
});

test('errorToToast: signed-in trial exhaustion links to plans', () => {
  const err = new DoxaRateLimitError('limit', 'https://doxa.app/mcp#byol', {
    tier: 'free',
    used: 10,
    limit: 10,
  });
  const toast = errorToToast(err, { signedIn: true });
  assert.equal(toast.state, 'error');
  assert.match(toast.text, /already subscribe/);
  assert.equal(toast.link, SUBSCRIBE_URL);
});

test('errorToToast: subscriber daily cap explains the reset, no upsell', () => {
  const err = new DoxaRateLimitError('limit', 'https://doxa.app/pricing', {
    tier: 'subscription',
    used: 100,
    limit: 100,
  });
  const toast = errorToToast(err, { signedIn: true });
  assert.equal(toast.state, 'error');
  assert.match(toast.text, /resets tomorrow/);
  assert.equal(toast.link, undefined);
});

test('errorToToast maps a DoxaError to its message', () => {
  const toast = errorToToast(new DoxaError('bad reference', 400));
  assert.equal(toast.state, 'error');
  assert.match(toast.text, /bad reference/);
});

test('errorToToast maps unknown errors to a generic message', () => {
  const toast = errorToToast(new TypeError('fetch failed'));
  assert.equal(toast.state, 'error');
  assert.match(toast.text, /Something went wrong/);
});

// --- session logic ---

import { parseAuthFragment, jwtExpiry, jwtEmail, shouldRefresh } from '../dist/lib/session.js';

function fakeJwt(payload) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;
}

test('parseAuthFragment extracts both tokens from the redirect URL', () => {
  const url = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/#access_token=aaa&refresh_token=bbb';
  assert.deepEqual(parseAuthFragment(url), { accessToken: 'aaa', refreshToken: 'bbb' });
});

test('parseAuthFragment rejects missing fragments or tokens', () => {
  assert.equal(parseAuthFragment('https://x.chromiumapp.org/'), null);
  assert.equal(parseAuthFragment('https://x.chromiumapp.org/#access_token=aaa'), null);
  assert.equal(parseAuthFragment('https://x.chromiumapp.org/#refresh_token=bbb'), null);
});

test('jwtExpiry and jwtEmail read claims without verification', () => {
  const token = fakeJwt({ exp: 1234567890, email: 'g@doxa.app' });
  assert.equal(jwtExpiry(token), 1234567890);
  assert.equal(jwtEmail(token), 'g@doxa.app');
  assert.equal(jwtExpiry('not-a-jwt'), null);
  assert.equal(jwtEmail('a.b'), null);
});

test('shouldRefresh: fresh tokens hold, near-expiry and garbage refresh', () => {
  const now = 1_000_000;
  assert.equal(shouldRefresh(fakeJwt({ exp: now + 3600 }), now), false);
  assert.equal(shouldRefresh(fakeJwt({ exp: now + 30 }), now), true);
  assert.equal(shouldRefresh(fakeJwt({ exp: now - 10 }), now), true);
  assert.equal(shouldRefresh('garbage', now), true);
});
