#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { computeTidyPlan } from './tidy-plan.mjs';

const APPLY = process.argv.includes('--yes');

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}
function tryGit(args) {
  try { return git(args); } catch { return ''; }
}
function mergedIntoMain(ref) {
  try { execFileSync('git', ['merge-base', '--is-ancestor', ref, 'origin/main']); return true; }
  catch { return false; }
}

tryGit(['fetch', 'origin', '--quiet']);
const currentBranch = tryGit(['rev-parse', '--abbrev-ref', 'HEAD']);

// Parse worktrees (first entry is always the main worktree).
const worktrees = [];
let cur = {};
for (const line of tryGit(['worktree', 'list', '--porcelain']).split('\n')) {
  if (line.startsWith('worktree ')) cur = { path: line.slice(9) };
  else if (line.startsWith('branch ')) cur.branch = line.slice(7).replace('refs/heads/', '');
  else if (line === 'detached') cur.branch = null;
  else if (line === '' && cur.path) { worktrees.push(cur); cur = {}; }
}
if (cur.path) worktrees.push(cur);

const checkedOut = new Set(worktrees.map((w) => w.branch).filter(Boolean));
checkedOut.add(currentBranch);

const branches = tryGit(['for-each-ref', '--format=%(refname:short)', 'refs/heads/'])
  .split('\n').filter(Boolean)
  .map((name) => ({ name, mergedIntoMain: mergedIntoMain(name), checkedOut: checkedOut.has(name) }));

const wtInfo = worktrees.map((w, i) => {
  const missing = !existsSync(w.path);
  return {
    path: w.path,
    branch: w.branch ?? null,
    isMain: i === 0,
    missing,
    // A present worktree with any staged/unstaged/untracked change is dirty and must be kept.
    dirty: !missing && tryGit(['-C', w.path, 'status', '--porcelain']).length > 0,
    mergedIntoMain: w.branch ? mergedIntoMain(w.branch) : false,
  };
});

const plan = computeTidyPlan({ branches, worktrees: wtInfo });

if (!plan.branchesToDelete.length && !plan.worktreesToPrune.length) {
  console.log('✓ nothing to tidy — no merged branches or stale worktrees');
  process.exit(0);
}

console.log(APPLY ? 'Tidying:' : 'Dry run (pass --yes to apply):');
for (const p of plan.worktreesToPrune) console.log(`  prune worktree ${p}`);
for (const b of plan.branchesToDelete) console.log(`  delete branch  ${b}`);

if (!APPLY) { console.log('\nRe-run with --yes to apply.'); process.exit(0); }

for (const p of plan.worktreesToPrune) {
  try { git(['worktree', 'remove', p]); console.log(`removed worktree ${p}`); }
  catch (e) { console.error(`skip worktree ${p}: ${e.message}`); }
}
git(['worktree', 'prune']);
// -D is safe here: computeTidyPlan already confirmed each branch is an ancestor of origin/main.
for (const b of plan.branchesToDelete) {
  try { git(['branch', '-D', b]); console.log(`deleted branch ${b}`); }
  catch (e) { console.error(`skip branch ${b}: ${e.message}`); }
}
