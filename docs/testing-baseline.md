# Testing Baseline — 2026-07-03

## Gate suites (must stay green)

- **typecheck** (`npm run typecheck`): PASS — exits 0
- **lint** (`npm run lint`): BLOCKED — 341 pre-existing errors in 182 files (see below); auto-fixed 7 issues via `--fix`; dist artifacts and git worktrees now excluded via `eslint.config.mjs`
- **unit** (`npm run test:unit`): PASS — 64 files, 485 tests

## Lint — pre-existing errors (not gated until cleaned up)

`npm run lint` exits non-zero due to 341 pre-existing errors. These are NOT new — they existed before this branch. Error breakdown:

| Count | Rule | Nature |
|-------|------|--------|
| 144 | `@typescript-eslint/no-explicit-any` | Widespread `any` usage; needs gradual type-narrowing |
| 77+26 | `react-hooks/exhaustive-deps` (rendering) | setState-in-effect and similar hook violations |
| 64 | `react/no-unescaped-entities` | Bare `'` and `"` in JSX text |
| 11 | `react-hooks/rules-of-hooks` | Hook calls in non-hook functions |
| 6 | `@typescript-eslint/no-require-imports` | `require()` in source files (non-dist) |
| 5+4 | `react-hooks/error-boundaries` | JSX inside try/catch blocks |
| 3 | `@typescript-eslint/triple-slash-reference` | Legacy `/// <reference>` directives |
| 1 | `@next/next/no-html-link-for-pages` | `<a>` instead of `<Link>` |

**What was fixed**: `eslint.config.mjs` updated to exclude `**/dist/**` (build artifacts) and `.claude/worktrees/**` (isolated Claude Code worktrees). 7 `prefer-const` issues auto-fixed.

**Plan**: These are tracked as tech debt. Do not disable rules wholesale. Address `no-unescaped-entities` (64) and `no-explicit-any` (144) incrementally in dedicated cleanup PRs.

## Quarantined unit tests (excluded from green, to restore later)

None. All 63 test files / 483 tests pass cleanly without quarantining.

## E2E (informational, not gated)

Tests were kicked off at baseline time but results were not fully awaited due to run duration (expected ~10–20 min). Playwright auto-starts the dev server.

- 35 spec files under `tests/`
- Require a working dev server + real Supabase credentials
- Not included in the gate — too slow and environment-dependent
- Run manually: `npm run test:e2e`

Known constraints:
- Require `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GOOGLE_CLIENT_ID`/`SECRET`, `NEXTAUTH_SECRET` to be set
- Auth-dependent tests will fail in CI without real credentials or seeded test users

## Rule

`npm run typecheck && npm run test:unit` must exit 0 on main at all times.

Lint is tracked but not yet gated due to the 341 pre-existing errors. Once those are cleared, add `npm run lint` to the gate.

## How to run verification

```bash
# Quick gate (typecheck + unit)
npm run typecheck && npm run test:unit

# Full (add lint when pre-existing errors are fixed)
npm run typecheck && npm run lint && npm run test:unit

# E2E (manual, informational)
npm run test:e2e
```
