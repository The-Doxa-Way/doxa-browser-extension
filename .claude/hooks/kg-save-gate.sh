#!/usr/bin/env bash
#
# kg-save-gate.sh — PreToolUse(Bash) hook for doxa-browser-extension.
#
# Garth's standing rule (2026-05-31): "kg-save on every chunk." This hook is the
# ENFORCEMENT for that rule so it never depends on the model remembering — it
# survives fresh resume-cron sessions.
#
# It gates the chunk-LANDING commands (git push / gh pr create / gh pr merge):
# if the work about to land on main (origin/main..HEAD) contains no change to
# .knowledge-graph/, the landing is blocked with guidance to run kg-save first.
#
# Design choices:
#   * Gates at landing, not per micro-commit — recursive-review fix commits would
#     otherwise spam reminders. The real failure is a chunk hitting main with no
#     meta-KG record.
#   * FAIL-OPEN. Any uncertainty (no payload, no jq, no origin/main, not a git
#     repo, detached weirdness) -> exit 0 (allow). A buggy hook must never wedge
#     an autonomous build. Only a *confirmed* "landing command + zero KG change
#     in range" blocks.
#   * Escape hatch: put the literal token [skip-kg] anywhere in the command to
#     bypass (for the rare push that is genuinely not a chunk landing).
#
# Exit codes (Claude Code hook contract): 0 = allow, 2 = block (stderr shown to
# the model), anything else = non-blocking error (tool still proceeds).

payload="$(cat 2>/dev/null)" || exit 0
[ -n "$payload" ] || exit 0

command -v jq >/dev/null 2>&1 || exit 0

# ---------------------------------------------------------------------------
# kg_guard_verdict — the shared KG Guard CI oracle (2026-08-11 rule: a merge
# with a red or pending KG Guard never lands, in ANY repo). Prints one of:
#   GREEN  — check concluded SUCCESS/NEUTRAL/SKIPPED
#   RED    — check concluded FAILURE/ERROR/TIMED_OUT/CANCELLED/ACTION_REQUIRED
#   WAIT   — check exists but has not concluded (IN_PROGRESS/QUEUED/…)
#   ABSENT — no KG Guard entry on the rollup (workflow missing, or the race
#            right after a push before Actions schedules the run), or the
#            lookup itself failed. Callers decide the fail direction; for
#            doxa-browser-extension they FALL THROUGH to the local-range gate rather than
#            allowing (the pre-2026-08-11 behavior stays the floor).
# gh serializes a Go zero-value conclusion as "" (not null) while a run is in
# flight — jq's // treats "" as truthy, so the empty string must be tested
# explicitly or every pending run reads as concluded (review 2026-08-11).
# $1 = PR ref ("" = the current branch's PR, resolved by gh from the CWD —
# never pass --repo with an empty ref, gh errors out and the check silently
# vanishes); $2 = owner/name (used only when $1 is non-empty).
kg_guard_verdict() {
  command -v gh >/dev/null 2>&1 || { printf 'ABSENT'; return; }
  local rollup=""
  if [ -n "$1" ]; then
    rollup="$(gh pr view "$1" ${2:+--repo "$2"} --json statusCheckRollup 2>/dev/null)" || rollup=""
  else
    rollup="$(gh pr view --json statusCheckRollup 2>/dev/null)" || rollup=""
  fi
  [ -n "$rollup" ] || { printf 'ABSENT'; return; }
  local state
  state="$(printf '%s' "$rollup" | jq -r '
    [.statusCheckRollup[]? | select((.workflowName // "") == "KG Guard")][0]
    | if . == null then "ABSENT"
      elif (.conclusion // "") == "" then ("RAW_" + (.status // "PENDING"))
      else ("RAW_" + .conclusion) end' 2>/dev/null)"
  case "$state" in
    RAW_SUCCESS|RAW_NEUTRAL|RAW_SKIPPED) printf 'GREEN' ;;
    RAW_FAILURE|RAW_ERROR|RAW_TIMED_OUT|RAW_CANCELLED|RAW_ACTION_REQUIRED|RAW_STARTUP_FAILURE) printf 'RED' ;;
    ABSENT|'') printf 'ABSENT' ;;
    *) printf 'WAIT' ;;   # IN_PROGRESS / QUEUED / PENDING / WAITING / EXPECTED / REQUESTED
  esac
}

block_red() {   # $1 = repo label, $2 = pr label
  {
    echo "⛔ kg-save gate — KG Guard is RED on this PR ($1 $2)."
    echo "The work being merged carries no .knowledge-graph/ change for its repo."
    echo "Bank the learning INTO the PR branch, push, wait for KG Guard, then merge:"
    echo "  node scripts/knowledge-graph-merkle.cjs add \"<Entity>\" \"<observation>\" \"<file>\" <line> --type <Type>"
    echo "  git add .knowledge-graph/ .knowledge-graph-merkle.cjson && git commit && git push"
    echo "Genuinely knowledge-free? Use the VISIBLE CI exemptions ([skip-kg] in the PR"
    echo "title, or the skip-kg label) — never merge over a red check."
  } >&2
}
block_wait() {  # $1 = repo label, $2 = pr label
  {
    echo "⛔ kg-save gate — KG Guard has not finished on this PR ($1 $2)."
    echo "Wait for the verdict (gh pr checks --watch), then merge. Merging ahead of"
    echo "the check is the exact hole this gate closes (2026-08-11)."
  } >&2
}

# ---------------------------------------------------------------------------
# GitHub MCP merge path.
#
# THE HOLE THIS CLOSES (2026-08-01). This gate was registered for PreToolUse
# matcher "Bash" only, so a PR merged through mcp__github__merge_pull_request
# never reached it — the payload has no .tool_input.command, so the extraction
# below found nothing and the hook exited 0 (allow). review-gate.sh and
# test-gate.sh were both registered for that matcher; kg-save-gate.sh was not.
#
# That is not theoretical: doxa-app landed 61 commits between 2026-07-18 and
# 08-01 with its .knowledge-graph/ frozen since 07-25, and openclaw 7 since its
# last KG write. Real work reached main with no KG record, so the federation had
# no idea it happened. Garth 2026-08-01: work done ANYWHERE is kg-saved when it
# is committed and merged to main, through the recursive quality gate.
#
# Escape hatch: there is no [skip-kg] token to attach to an MCP call, so a
# genuinely KG-less merge is done through Bash instead
# (`gh pr merge N --squash  # [skip-kg]`), which stays visible in the transcript.
# ---------------------------------------------------------------------------
tool_name="$(printf '%s' "$payload" | jq -r '.tool_name // empty' 2>/dev/null)"
if [ "$tool_name" = "mcp__github__merge_pull_request" ]; then
  mcp_repo="$(printf '%s' "$payload" | jq -r '.tool_input.repo // empty' 2>/dev/null)"
  # `| floor` normalises the number BEFORE it reaches the shell: jq preserves a
  # JSON literal verbatim, so a payload carrying `278.0` (or 2.78e2) would print
  # "278.0", the digits-only guard below would reject the dot, and the gate would
  # silently no-op on a real merge. Fails open on a non-number, as everything
  # here does. Extracted ONCE, up front — both the sibling and doxa-browser-extension-own
  # branches below need {mcp_owner, pr_number}; this used to be duplicated as
  # s_owner/s_num in the sibling branch and mcp_owner/pr_number further down.
  mcp_owner="$(printf '%s' "$payload" | jq -r '.tool_input.owner // empty' 2>/dev/null)"
  pr_number="$(printf '%s' "$payload" | jq -r '(.tool_input.pullNumber // empty) | if type == "number" then floor else . end' 2>/dev/null)"
  case "$pr_number" in ''|*[!0-9]*) exit 0 ;; esac   # no usable PR number -> allow
  [ -n "$mcp_owner" ] && [ -n "$mcp_repo" ] || exit 0

  # ---------------------------------------------------------------------------
  # Merge-integrity check, REMOTE variant (2026-08-13, review finding: the
  # LOCAL merge-integrity block further down this file never runs for an MCP
  # merge — this whole tool_name branch always exits before reaching it,
  # since an MCP merge targets a PR by number with no necessary relationship
  # to whatever is locally checked out here (same reasoning the "ask GitHub
  # what this PR contains" file-list check below already uses: local
  # heuristics are worthless with N linked worktrees). Ask GitHub directly
  # instead: walk the PR's own commits for a 2-parent merge, and diff each
  # merge's .knowledge-graph-merkle.cjson against its parents' via the
  # Contents API — no local checkout of the PR's branch required. Runs for
  # EVERY MCP merge (sibling or doxa-browser-extension itself), before either branch below.
  # Fail-open on any lookup trouble, exactly like check-kg-merge-integrity.cjs
  # itself.
  if command -v node >/dev/null 2>&1 && [ -f "${CLAUDE_PROJECT_DIR:-$PWD}/scripts/check-kg-merge-integrity.cjs" ]; then
    integrity_output="$(node "${CLAUDE_PROJECT_DIR:-$PWD}/scripts/check-kg-merge-integrity.cjs" --remote-pr "$mcp_owner/$mcp_repo" "$pr_number" 2>&1)"
    integrity_status=$?
    if [ "$integrity_status" -eq 1 ]; then
      printf '%s\n' "$integrity_output" >&2
      exit 2
    fi
  fi
  # ---------------------------------------------------------------------------

  if [ "$mcp_repo" != "doxa-browser-extension" ]; then
    # Sibling MCP merge (2026-08-11 rule): same KG Guard verdict check as the
    # Bash merge path — a red/pending check blocks in ANY repo. ABSENT fails
    # open here (no local range exists to fall back to for a sibling).
    case "$(kg_guard_verdict "$pr_number" "$mcp_owner/$mcp_repo")" in
      RED)  block_red "$mcp_owner/$mcp_repo" "#$pr_number"; exit 2 ;;
      WAIT) block_wait "$mcp_owner/$mcp_repo" "#$pr_number"; exit 2 ;;
      *) exit 0 ;;
    esac
  fi

  # Ask GitHub what this PR actually contains, rather than inferring it from
  # local state. The obvious local approach — "does any checked-out branch or
  # worktree carry a .knowledge-graph/ change" — is worthless here: this repo
  # routinely has ~10 linked worktrees, and a single stale unrelated one with a
  # KG commit in it would satisfy the gate for EVERY merge. Measured 2026-08-01:
  # two such worktrees were present, so the heuristic allowed a deliberately
  # KG-less test chunk straight through. The PR's own file list is the only
  # answer that is about the thing being merged.
  command -v gh >/dev/null 2>&1 || exit 0

  # Fail-open on any lookup trouble (offline, auth expired, API hiccup): a gate
  # that cannot see must not block. Only a CONFIRMED KG-less PR blocks.
  pr_files="$(gh pr diff "$pr_number" --repo "$mcp_owner/$mcp_repo" --name-only 2>/dev/null)" || exit 0
  [ -n "$pr_files" ] || exit 0

  printf '%s\n' "$pr_files" | grep -q '^\.knowledge-graph/' && exit 0

  # A PR of nothing but generated sync state is not a chunk.
  #
  # vault/ is NOT wholly generated: CLAUDE.md guardrail #2 makes vault/00-MOCs/
  # hand-written INPUT (Brand.md, CNS Operator Guide.md, …). Treating it as
  # generated would let real authored work merge with no kg-save. grep -E has no
  # lookahead, so 00-MOCs is re-included by a second pass rather than by trying
  # to write one clever pattern.
  authored="$(printf '%s\n' "$pr_files" \
    | grep -vE '^(sources/|index/|vault/|events/|conflicts/|goals/_ledger/|goals/_state/)'
    printf '%s\n' "$pr_files" | grep -E '^vault/00-MOCs/')"
  [ -z "$authored" ] && exit 0

  {
    echo "⛔ kg-save gate — the chunk being merged has NO change to .knowledge-graph/."
    echo "Garth's standing rule is \"kg-save on every chunk\", and it applies to MCP merges too."
    echo "Record the meta-KG learning on the branch, push, then merge:"
    echo
    echo "  node scripts/knowledge-graph-merkle.cjs add \"<Entity>\" \"<observation>\" \"<file>\" <line> --type <Type>"
    echo "  git add .knowledge-graph/graph.json .knowledge-graph-merkle.cjson"
    echo "  git commit -m \"chore(kg): meta-KG — <what changed and why>\" && git push"
    echo
    echo "(Genuinely not a chunk landing? Merge via Bash with [skip-kg] in the command.)"
  } >&2
  exit 2
fi

cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)" || exit 0
[ -n "$cmd" ] || exit 0

# Escape hatch.
case "$cmd" in
  *"[skip-kg]"*) exit 0 ;;
esac

# Only gate genuine chunk-LANDING commands. Match the landing verb at COMMAND
# POSITION (start of string, after optional VAR=val assignments and git/gh
# options incl. `-C <path>` / `-c <k=v>`) — NOT as a substring — so
# `git commit -m '…git push…'`, `echo … git push`, and `grep -r 'git push'`
# are not spuriously blocked. The verb may be terminated by whitespace,
# end-of-string, or a shell metachar (`git push;` / `gh pr merge&`).
# Known fail-open residuals (under-block, never over-block — the 15-minute cron
# is the floor): a landing buried in a compound (`cd x && git push`), and rare
# two-token global options other than -C/-c (e.g. `git --work-tree p push`).
printf '%s' "$cmd" | grep -qE '^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*(git([[:space:]]+(-[Cc][[:space:]]+[^[:space:]]+|-[^[:space:]]+))*[[:space:]]+push([[:space:];&|>]|$)|gh[[:space:]]+pr[[:space:]]+(create|merge)([[:space:];&|>]|$))' \
  || printf '%s' "$cmd" | tr -d "\"'" | grep -qE '(^|[;&|])[[:space:]]*gh[[:space:]]+pr[[:space:]]+merge([[:space:];&|>]|$)' \
  || exit 0
# The second pattern (2026-08-11): a MERGE may arrive cd-prefixed
# (`cd /path/to/sibling && gh pr merge N`) because the Bash tool's cwd resets
# between calls — the canonical sibling-merge shape. The start-anchored
# pattern alone exited before the merge path ever saw those (review finding:
# the every-repo KG Guard rule missed the exact class it was built for).
# push/create keep the anchored-only match with its documented residuals.

# The command runs in the Bash tool's PERSISTENT cwd, which may be a different
# repo than doxa-browser-extension (e.g. a `git push` issued after `cd ../doxa-app`). This gate
# enforces "kg-save on every chunk" for doxa-browser-extension landings ONLY — it must never
# block a sibling repo's push (doxa-app/doxa-shared/etc.). Use the hook payload's
# cwd (the real working dir) over CLAUDE_PROJECT_DIR, then bail unless the repo
# being operated on IS the doxa-browser-extension project repo.
hook_cwd="$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null)"
# The Bash tool's persistent cwd resets to the project dir between calls, so a
# sibling-repo landing written as `cd /path/to/doxa-app && gh pr merge N` arrives
# with payload.cwd=doxa-browser-extension and gets misread as a doxa-browser-extension landing (2026-07-10:
# repeatedly forced [skip-kg] on doxa-app PR merges from the doxa-browser-extension cwd). If the
# command cd's into an absolute path before the landing verb, evaluate THAT repo
# instead — the sibling-repo bail below then correctly lets it through.
# A `git -C <path> push` points the git invocation at a directory regardless
# of the shell's cwd. Extract the -C path ONLY when it belongs to a git
# invocation that ITSELF carries the landing verb (push right after, within
# the same clause) — matching any bare `-C /path` ANYWHERE in the command let
# an unrelated chained clause (`git -C /tmp/x status`, or a non-git `tar -C
# /other`) hijack repo resolution and un-gate a real doxa-browser-extension landing
# (2026-07-15). `gh` doesn't take -C, so this only needs to look at `git`.
# It's given priority over cmd_cd since it's attached directly to the landing
# verb itself (a `cd a && git -C b push` means the push really targets b).
cmd_gitC_clause="$(printf '%s' "$cmd" | grep -oE 'git[[:space:]]+(-[^C[:space:]][^[:space:]]*[[:space:]]+)*-C[[:space:]]+/[^[:space:];&|]+[^;&|]*[[:space:]]push' | head -1)"
cmd_gitC="$(printf '%s' "$cmd_gitC_clause" | grep -oE -- '-C[[:space:]]+/[^[:space:];&|]+' | head -1 | sed -E 's#-C[[:space:]]+##')"
cmd_cd="$(printf '%s' "$cmd" | grep -oE '(^|[;&|]|[[:space:]])cd[[:space:]]+(/|~/)[^[:space:];&|]+' | head -1 | sed -E 's#.*cd[[:space:]]+##')"
# Expand a leading ~ — the path arrives as a literal string, so `[ -d "~/x" ]`
# is always false and the cd would be silently ignored, misattributing a
# sibling merge to doxa-browser-extension (the 2026-08-01 bash-merge-gate incident class;
# review 2026-08-11 found this copy replayed it).
case "$cmd_cd" in '~/'*) cmd_cd="$HOME/${cmd_cd#\~/}" ;; esac
if [ -n "$cmd_gitC" ] && [ -d "$cmd_gitC" ]; then
  dir="$cmd_gitC"
elif [ -n "$cmd_cd" ] && [ -d "$cmd_cd" ]; then
  dir="$cmd_cd"
else
  dir="${hook_cwd:-${CLAUDE_PROJECT_DIR:-$PWD}}"
fi
cd "$dir" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Only gate the doxa-browser-extension repo itself; allow landings that operate on other
# repos. Compare via --git-common-dir (resolves to the MAIN checkout's .git
# dir for any linked worktree of the same repo), NOT --show-toplevel: two
# worktrees of the SAME repo have different toplevels but the same common
# dir, so toplevel equality was letting a doxa-browser-extension worktree landing slip
# through ungated as if it were "a different repo" (fail-open still holds:
# any lookup failure below still exits 0, allowing the command through).
#
# Computed HERE, before the merge-integrity block below, and reused by it —
# review 2026-08-13 (found independently across 3 sibling repos' own reviews
# of this same feature): the merge-integrity check was originally scoped
# ONLY by "does $dir have the script", with no repo-identity check, so a
# `cd <sibling-repo> && git push`/`git -C <sibling-repo> push` issued from a
# doxa-browser-extension session could be gated by DOXA-CNS's copy of this wrapper against
# the sibling's local range — using this session's fail-open conditions
# rather than that repo's own, a governance inconsistency if the two repos'
# copies ever drift. A sibling repo's OWN kg-save-gate.sh (this same feature,
# propagated fleet-wide) is what should protect a landing rooted there.
repo_common="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || exit 0
proj_common="$(cd "${CLAUDE_PROJECT_DIR:-$PWD}" 2>/dev/null && git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)"
self_repo=1
[ -n "$proj_common" ] && [ "$repo_common" != "$proj_common" ] && self_repo=0

# Cached once, reused by both the merge-integrity block below and the later
# base/empty-range check further down (review 2026-08-13: this was computed
# twice, once per site, for the identical (HEAD, origin/main) pair on every
# landing command in the fleet's hottest gate hook).
_merge_base_origin_main="$(git merge-base HEAD origin/main 2>/dev/null)"

# ---------------------------------------------------------------------------
# Merge-integrity check (2026-08-13, Garth: "standing doctrine and practice
# across all repos"). Real incident: a merge conflict on
# .knowledge-graph-merkle.cjson resolved with `git checkout --theirs` silently
# discarded a branch's own observation — the observations array is an append
# log, and a naive "pick a side" resolution can only ever keep a subset.
#
# Runs HERE, unconditionally (for self_repo landings — see the scoping guard
# just above), before every other exit path in this file — review 2026-08-13
# caught it originally placed after the `gh pr merge` KG-Guard-verdict block
# below, which exits 0 on a GREEN verdict without ever reaching a check
# placed later. `gh pr merge` is the single most common landing shape in
# this fleet, so a check unreachable from it is a check that doesn't run.
# This inspects the LOCAL git range (merge-base(origin/main, HEAD)..HEAD)
# regardless of which landing command follows — it protects any session that
# resolved a conflict in THIS checkout, whether it then lands via
# `gh pr merge`, `git push`, or `gh pr create`. A merge landed with no local
# involvement (GitHub UI, a bot with no checkout, or an MCP merge of a PR not
# checked out here) has nothing local to check and is out of this hook's
# reach by construction — that gap is what the server-side KG Guard CI
# verdict below (local range) and the --remote-pr mode (MCP path, above)
# exist to cover instead.
#
# Fail-open on any tooling trouble (script missing, node missing, no
# origin/main, empty range) — this block must never itself become the reason
# a legitimate landing is blocked.
if [ "$self_repo" -eq 1 ] && command -v node >/dev/null 2>&1 && [ -f "$dir/scripts/check-kg-merge-integrity.cjs" ]; then
  if [ -n "$_merge_base_origin_main" ] && [ "$_merge_base_origin_main" != "$(git rev-parse HEAD 2>/dev/null)" ]; then
    integrity_output="$(node "$dir/scripts/check-kg-merge-integrity.cjs" "$_merge_base_origin_main" HEAD 2>&1)"
    integrity_status=$?
    if [ "$integrity_status" -eq 1 ]; then
      printf '%s\n' "$integrity_output" >&2
      exit 2
    fi
  fi
fi

# ---------------------------------------------------------------------------
# gh pr merge path (2026-08-11, Garth: "all work must be kg-saved and merged
# to production in the relevant repo"). For MERGES the authoritative KG check
# is the PR's own KG Guard CI verdict — the local-range heuristics below can
# be satisfied by any stale linked worktree holding an old KG commit (proven
# live 2026-08-11: three doxa-browser-extension PRs merged KG-less while KG Guard was red),
# and they know nothing about sibling repos (openclaw #150 and doxa-shared
# #19 merged with no KG record at all). KG Guard runs in every gated repo and
# carries the visible exemption flow itself ([skip-kg] title token / skip-kg
# label / chore(sync)|chore(deps) titles), so asking CI duplicates no policy.
#   FAILURE etc.   -> block: add the kg-save to the PR, or use the visible
#                     CI exemptions; [skip-kg] in the merge command itself
#                     still escapes this hook (checked above).
#   PENDING/QUEUED -> block: wait for the verdict — merging ahead of a red
#                     check is exactly the hole this closes.
#   absent/error   -> fail-open (repo without the workflow, offline, fork).
# This branch fully owns merge commands for EVERY repo; the local-range logic
# below serves git push / gh pr create on doxa-browser-extension only.
# ---------------------------------------------------------------------------
merge_scan="$(printf '%s' "$cmd" | tr -d "\"'")"
if printf '%s' "$merge_scan" | grep -qE '(^|[;&|(){}[:space:]])gh[[:space:]]+pr[[:space:]]+merge'; then
  repo_arg="$(printf '%s' "$merge_scan" | grep -oE -- '(--repo|-R)[= ][^[:space:]]+' | head -1 | sed -E 's/^(--repo|-R)[= ]//')"
  if [ -z "$repo_arg" ]; then
    repo_arg="$(git remote get-url origin 2>/dev/null | sed -E 's#^.*github\.com[:/]##; s#\.git$##')"
  fi
  # Tokenise the PR ref: flags may precede it, value-taking flags consume
  # their value ( --flag=value forms keep their value attached and fall to the
  # -* arm); the first remaining positional is the ref. Empty ref = the
  # current branch's PR — resolved by gh from the CWD with NO --repo flag
  # (gh errors on --repo without a selector; review 2026-08-11 proved that
  # silently un-gated the most common merge shape). Globbing is disabled
  # around the unquoted expansion so a `*` from a stripped subject cannot
  # inject cwd filenames as candidate refs. A mis-parsed ref fails toward
  # ABSENT, which falls THROUGH to the local-range gate — never to allow.
  pr_ref=""
  set -f
  # shellcheck disable=SC2086
  set -- $merge_scan
  set +f
  while [ $# -gt 0 ] && [ "$1" != "merge" ]; do shift; done
  [ "${1:-}" = "merge" ] && shift
  while [ $# -gt 0 ]; do
    case "$1" in
      --repo|-R|--body|-b|--body-file|-F|--subject|-t|--match-head-commit|--author-email|-A)
        shift 2 2>/dev/null || shift; continue ;;
      -*) shift; continue ;;
      *) pr_ref="$1"; break ;;
    esac
  done
  # Trust only unambiguous refs: a PR number or URL. Anything else (branch
  # names, mis-tokenised flag-value fragments like 'cleanup' or
  # 'bot@doxa.app') could resolve a DIFFERENT PR whose green check would
  # wrongly bless this merge — clear it and let current-branch resolution or
  # the ABSENT fall-through carry the gate instead.
  case "$pr_ref" in ''|http*) : ;; *[!0-9]*) pr_ref="" ;; esac
  verdict="$(kg_guard_verdict "$pr_ref" "$repo_arg")"
  case "$verdict" in
    RED)  block_red "${repo_arg:-?}" "${pr_ref:-current-branch}"; exit 2 ;;
    WAIT) block_wait "${repo_arg:-?}" "${pr_ref:-current-branch}"; exit 2 ;;
    GREEN)
      # CI vouches for the merge itself — but a CHAINED landing in the same
      # command (`git push && gh pr merge N`) still owes the push its
      # local-range gate below (review 2026-08-11: the unconditional exit 0
      # here un-gated chained pushes).
      if ! printf '%s' "$cmd" | grep -qE '^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*(git([[:space:]]+(-[Cc][[:space:]]+[^[:space:]]+|-[^[:space:]]+))*[[:space:]]+push([[:space:];&|>]|$)|gh[[:space:]]+pr[[:space:]]+create([[:space:];&|>]|$))'; then
        exit 0
      fi ;;
    *)
      # ABSENT: workflow missing, gh unreachable, post-push scheduling race,
      # or a non-main-base PR (kg-guard only runs on PRs to main). Never
      # allow on blindness — fall through to the local-range gate, which was
      # the pre-2026-08-11 floor. Sibling repos exit 0 at the bail below
      # (their own kg-guard + this hook's verdict check on a resolvable
      # rollup are their coverage; no local range exists for them here).
      : ;;
  esac
fi

# Only gate the doxa-browser-extension repo itself; allow landings that operate on other
# repos (repo_common/proj_common/self_repo computed once, above, and shared
# with the merge-integrity block).
[ "$self_repo" -eq 1 ] || exit 0

# Base this chunk diverged from (cached above). No origin/main ref -> can't
# reason -> allow.
base="$_merge_base_origin_main"
[ -n "$base" ] || exit 0

# Empty range (HEAD at or behind origin/main) -> nothing is landing -> allow.
[ "$base" = "$(git rev-parse HEAD 2>/dev/null)" ] && exit 0

# Local main can drift ahead of origin/main purely by cns-sync's own chore(sync)
# auto-commits (generated federation state, allowlisted — not a chunk). If the
# ENTIRE range is such generated commits, nothing real is landing -> allow. This
# stops the false-positive where a `gh pr merge N` (whose real KG change lives in
# the REMOTE PR branch, not local main) is blocked just because local main is
# sync-diverged and no linked worktree still holds the chunk (2026-07-10).
if [ -z "$(git log --format='%s' "$base"..HEAD 2>/dev/null | grep -vE '^chore\(sync\)')" ]; then
  exit 0
fi

# Already a meta-KG change in this chunk's range? -> allow.
if ! git diff --quiet "$base" HEAD -- .knowledge-graph/ 2>/dev/null; then
  exit 0
fi

# Worktree-aware pass (PR-first landings push from scratch worktrees, 2026-07-10):
# the payload cwd is usually the MAIN checkout, but the chunk being landed may
# live in a linked worktree. If ANY worktree of this repo has a non-empty
# origin/main..HEAD range that includes a .knowledge-graph/ change -> allow
# (under-block, never over-block, per the fail-open philosophy above).
while IFS= read -r wt; do
  [ -d "$wt" ] || continue
  wt_head="$(git -C "$wt" rev-parse HEAD 2>/dev/null)" || continue
  wt_base="$(git -C "$wt" merge-base HEAD origin/main 2>/dev/null)" || continue
  [ "$wt_base" = "$wt_head" ] && continue   # nothing landing from this worktree
  if ! git -C "$wt" diff --quiet "$wt_base" "$wt_head" -- .knowledge-graph/ 2>/dev/null; then
    exit 0
  fi
done <<EOF
$(git worktree list --porcelain 2>/dev/null | sed -n 's/^worktree //p')
EOF

# Confirmed: a landing command with zero .knowledge-graph/ change in origin/main..HEAD.
{
  echo "⛔ kg-save gate — this chunk (origin/main..HEAD) has NO change to .knowledge-graph/."
  echo "Garth's standing rule is \"kg-save on every chunk.\" Record the meta-KG learning before landing:"
  echo
  echo "  node scripts/knowledge-graph-merkle.cjs add \"<Entity>\" \"<observation>\" \"<file>\" <line> --type <Type>"
  echo "  git add .knowledge-graph/graph.json .knowledge-graph-merkle.cjson"
  echo "  git commit -m \"chore(kg): meta-KG — <what changed and why>\""
  echo
  echo "Then re-run this command. (Genuinely not a chunk landing? Add [skip-kg] to the command to bypass.)"
} >&2
exit 2
