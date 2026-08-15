# Subscription gate — trial, then Doxa sign-in + subscription

CEO direction (Garth, 2026-08-15): the extension works like Claude in Chrome.
People try it free, then they must sign in with a Doxa account that has an
active subscription. BYOL (user-pasted Anthropic key) leaves this surface.
Approved values: trial = the existing 10 lifetime free calls; name = Doxa for
Chrome.

## Current server reality (verified 2026-08-15 against doxa-app)

- `supabase/functions/mcp-server/index.ts` serves `doxa.app/mcp/v1`
  (Vercel rewrite, `verify_jwt = false`). It reads `x-anthropic-key`,
  `x-doxa-caller-id`, `x-doxa-api-key`; it never reads `Authorization`
  (already CORS-allowed).
- Free quota: `FREE_LIFETIME_ENCOURAGE_LIMIT = 10`, counted in
  `mcp_free_usage` **per source IP** (IPv6 /64), only for `doxa_encourage`.
  `doxa_scripture` is uncapped. `_quota.window: 'lifetime'`.
- Entitlements: `public.subscriptions` (one row per user; tier
  `grace|strength|courage|comfort`, `grace` = free) + SQL helper
  `public.effective_tier(p_tier, p_user_id)` which degrades lapsed paid
  tiers to `grace` after a 72h grace window.
- Auth: standard Supabase (email/password, magic link, Google, Apple).
  ~29 edge functions validate user JWTs manually via an anon-key client and
  `auth.getUser()` (canonical: `search-grace-record/index.ts:197`).
  Supabase URL + anon key are public client config.

## Design

### 1. doxa-app: mcp-server accepts a Doxa user session

In `checkCaller`/dispatch:

1. Read `Authorization: Bearer <jwt>`. When present, validate with the
   existing manual `auth.getUser()` idiom. Invalid/expired → structured
   error `auth_invalid` (extension then silently refreshes and retries once).
2. Valid user → service client reads `subscriptions` for `user_id`, applies
   the same lapse rule as `effective_tier` (reuse the RPC). Entitled =
   effective tier ≠ `grace`.
3. Entitled subscriber: bypass the free-IP quota, `PAID_MAX_TOKENS` (1500),
   server's own Anthropic key, `_quota = { tier: 'subscription', used: n,
   limit: <fair-use>, window: 'day' }`. Fair-use daily cap per user (cost
   guard, CTO-set, adjustable constant): 100 encourage calls/day, counted in
   a new `mcp_user_usage` table (user_id, day, encourage_count).
4. Signed-in but tier = `grace`: structured error `subscription_required`
   with `upgradeUrl: https://doxa.app/pricing`. Do NOT fall back to the IP
   trial silently once the user has signed in — the UI must show the
   subscribe CTA instead of confusing partial service. Exception: if the IP
   trial still has calls left, serve them and include the remaining count so
   the extension can show "N free calls left".
5. No Authorization header: unchanged anonymous trial behaviour.

### 2. doxa-app web (web-invitations): `/app/extension/connect`

A small page that hands the signed-in session to the extension:

1. Query param `redirect_uri`, validated against
   `^https://[a-p]{32}\.chromiumapp\.org/$` AND pinned to the official
   extension id `ldgpoiafelhpjlddkapbbidgkklpojma` (fixed by the manifest
   `key` field; private key held offline in Garth's local secrets dir) —
   nothing else, ever.
2. Not signed in → the normal login flow (all providers work), then back here.
3. Signed in → consent screen: "Connect your Doxa account to the browser
   extension?" with the extension id shown, one button. On click, redirect to
   `redirect_uri` + `#access_token=...&refresh_token=...` (URL fragment, so
   tokens never hit server logs).
4. Consent is mandatory every time (no auto-redirect) — the click is the
   defence against a hostile extension driving this flow invisibly.

### 3. Extension

1. `chrome.identity.launchWebAuthFlow` → the connect page; parse the
   fragment; store both tokens in `chrome.storage.local` (`identity`
   permission added to the manifest).
2. Session client (hand-rolled, no deps): refresh via Supabase REST
   `POST /auth/v1/token?grant_type=refresh_token` with the public anon key;
   refresh on 401/`auth_invalid`, sign out on refresh failure.
3. `DoxaClient` gets the header via its `fetch` option: a wrapper fetch that
   injects `Authorization: Bearer <access_token>` when signed in.
4. UI: options page BYOL section replaced by an Account section
   (signed-out: "Sign in with Doxa" button; signed-in: email + tier badge +
   sign-out). Popup shows trial-remaining when anonymous; on
   `free_trial_exhausted` / `subscription_required`, popup and toast show
   sign-in or subscribe CTA (doxa.app/pricing).
5. BYOL removal: `x-anthropic-key` path, key storage, options field, and
   related copy all deleted from this surface (the raw MCP endpoint keeps
   BYOL for developers).

## Slices

1. **Server gate** (doxa-app): mcp-server Authorization path + entitlement +
   fair-use counter + structured errors. Deployable alone (no caller sends
   the header yet). Verify: curl with a real JWT for a grace user and a
   subscribed user.
2. **Connect page** (doxa-app web-invitations): standalone page, testable in
   a browser with a hand-built redirect_uri.
3. **Extension auth + UI + BYOL removal** (this repo): lands last, after 1+2
   are deployed.

## Open items

- The trial is per **IP**, not per install (server fact). Copy must say
  "free trial", never "10 per device".
- `@thedoxaway/mcp-client` needs no change if its `fetch` option composes
  with `callerId` (verify; otherwise bump the client).
- Store privacy answers change once shipped: auth info = Doxa session
  (already staged in `store/listing.md`, submission blocked until then).
