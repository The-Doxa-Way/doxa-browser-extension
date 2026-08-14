/**
 * Tests for the chrome-free extension logic in src/lib/. Runs against the
 * built output (dist/), so `npm test` builds first — this also exercises the
 * copy-static import rewrite that the shipped extension relies on.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { looksLikeBibleRef } from '../dist/lib/bible-ref.js';
import { callerIdFromUuid, isValidCallerId, CALLER_SURFACE } from '../dist/lib/caller.js';
import { errorToToast } from '../dist/lib/error-toast.js';
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

test('errorToToast maps a rate-limit error to the BYOL upgrade toast', () => {
  const err = new DoxaRateLimitError('limit', 'https://doxa.app/mcp#byol', {
    tier: 'free',
    used: 10,
    limit: 10,
  });
  const toast = errorToToast(err);
  assert.equal(toast.state, 'error');
  assert.match(toast.text, /10\/10/);
  assert.equal(toast.link, 'https://doxa.app/mcp#byol');
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
