#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { deriveWorktreeSlug } from './worktree-slug.mjs';

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

const FORCE = process.argv.includes('--force');
const nameArg = process.argv.slice(2).find((a) => !a.startsWith('--'));

const repoRoot = git(['rev-parse', '--show-toplevel']);
const target = nameArg
  ? path.join(path.dirname(repoRoot), 'tracklist-worktrees',
      nameArg.includes('/') ? deriveWorktreeSlug(nameArg) : nameArg)
  : repoRoot; // no arg => the current worktree

// Guard 1: never remove the main worktree (first entry of `worktree list`).
const paths = tryGit(['worktree', 'list', '--porcelain'])
  .split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9));
const mainTree = paths[0];
if (!mainTree) { console.error('✗ could not determine the main worktree'); process.exit(1); }
if (path.resolve(target) === path.resolve(mainTree)) {
  console.error('✗ refusing to remove the main worktree'); process.exit(1);
}

// Guard 2: uncommitted changes.
const dirty = tryGit(['-C', target, 'status', '--porcelain']);
if (dirty && !FORCE) {
  console.error(`✗ ${target} has uncommitted changes; use --force to remove anyway`); process.exit(1);
}

// Guard 3: unmerged branch.
const branch = tryGit(['-C', target, 'rev-parse', '--abbrev-ref', 'HEAD']);
if (branch && branch !== 'HEAD' && !mergedIntoMain(branch) && !FORCE) {
  console.error(`✗ branch ${branch} has unmerged commits; use --force to remove anyway`); process.exit(1);
}

git(['worktree', 'remove', target, ...(FORCE ? ['--force'] : [])]);
git(['worktree', 'prune']);
console.error(`✓ removed worktree ${target}`);
