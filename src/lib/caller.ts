/**
 * Per-install caller id for the MCP free tier.
 *
 * The server counts free-tier quota per individual caller (format
 * `<surface>:<id>`, lowercase surface, alphanumeric id). One random id is
 * generated at install time and reused for the life of the install. It is
 * random — not derived from the user, the browser, or any page — and is only
 * ever sent to doxa.app.
 */

export const CALLER_SURFACE = 'ext';

const CALLER_ID = /^[a-z]+:[A-Za-z0-9]+$/;

/** Build a caller id from a UUID (dashes stripped to satisfy the alnum rule). */
export function callerIdFromUuid(uuid: string): string {
  const id = uuid.replace(/-/g, '');
  if (!/^[A-Za-z0-9]+$/.test(id) || id.length === 0) {
    throw new Error(`cannot build caller id from "${uuid}"`);
  }
  return `${CALLER_SURFACE}:${id}`;
}

export function isValidCallerId(value: unknown): value is string {
  return typeof value === 'string' && CALLER_ID.test(value);
}
