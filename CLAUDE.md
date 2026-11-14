# CLAUDE.md — doxa-browser-extension

This codebase is yours: what it's for and how it's built are your call, and you'll keep building on it.

## What this is

Doxa for Chrome and Edge, a Manifest V3 browser extension of the Doxa business (doxa.app). It
calls the Doxa MCP endpoint `https://doxa.app/mcp/v1` through `@thedoxaway/mcp-client`, and
Supabase auth for sign-in. It has no backend of its own. `README.md` has the features and the
file layout.

The brand and voice rules live in doxa-brand (The-Doxa-Way/doxa-brand). Apply them; do not copy
them here. `test/brand.test.mjs` checks some of them in the extension text.

## How to verify

- `npm ci`, then `npm run typecheck` (`tsc --noEmit`).
- `npm test` builds into `dist/`, then runs `node --test` on `test/*.test.mjs` and
  `scripts/*.test.cjs`.
- There is no lint script.
- CI (`.github/workflows/ci.yml`) runs the same typecheck and tests on every PR, on Node 20.

## Gotchas

- `static/manifest.json` `key` is a copy of the Chrome Web Store item's public key, so an
  unpacked build gets the store item id (`store/listing.md`). The doxa.app extension connect
  page pins the same id. Never change one of them alone: store sign-in breaks with no dev symptom.
- The store reads the summary and the version from `static/manifest.json`. Keep `package.json`
  `version` at the same number.
- A store upload is a zip of the contents of `dist/`, not of the folder. `dist/` and `*.zip` are
  gitignored.

## Landing

The production branch is `main`. Every change lands by branch, PR, independent review, merge.
Self-review never counts.

- Review: one `/code-review max` pass on the final diff on claude-opus-5-5, at most one fix
  round, then `ATTEST_REVIEW_LEVEL=max scripts/attest-review.sh "<verdict>"` before you push.
- Hooks in `.claude/hooks/` enforce this: `push-review-gate.sh` (max review before `git push`),
  `review-gate.sh` (attestation before merge), `test-gate.sh` (a code change needs a test change,
  or `scripts/attest-review.sh "waived-tests: <reason>"`) and `kg-save-gate.sh`.
- kg-save: KG Guard CI fails a PR with no `.knowledge-graph/` change. Record it with
  `node scripts/knowledge-graph-merkle.cjs add "<Entity>" "<what and why>" <source-file> --type <Type>`
  and commit it in the same PR. Use `[skip-kg]` in the PR title only for a knowledge-free change.
- The org ruleset requires `gitleaks` (secret-scan). `kg-save-gate.sh` refuses `gh pr merge`
  while KG Guard is red or pending. Never merge over a red or pending check, `ci` included.
- An attestation is merge authority: the fleet auto-lander (openclaw `land-prs.mjs`) merges an
  attested, green PR.
- The gate hooks and `scripts/attest-review.sh` are rendered from The-Doxa-Way-CNS
  `fleet/gates/`. Fix the template there, never the copy here.

## Standing orders

Cross-repo rules, the standing orders and the fleet map live in The-Doxa-Way-CNS: its
`CLAUDE.md` and `docs/org-map.md`. The CNS CLAUDE.md is the authority. If this file and the CNS
disagree, the CNS wins.
