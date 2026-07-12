#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { validateBranchName } from './validate-branch-name.mjs';
import { deriveWorktreeSlug } from './worktree-slug.mjs';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

const branch = process.argv[2];
if (!branch) {
  console.error('usage: npm run wt:new <type/short-desc>   e.g. npm run wt:new fix/foo-bar');
  process.exit(1);
}

const check = validateBranchName(branch);
if (!check.valid) { console.error(`✗ ${check.reason}`); process.exit(1); }

const repoRoot = git(['rev-parse', '--show-toplevel']);
const dest = path.join(path.dirname(repoRoot), 'tracklist-worktrees', deriveWorktreeSlug(branch));

if (existsSync(dest)) { console.error(`✗ worktree path already exists: ${dest}`); process.exit(1); }

console.error('Fetching origin…');
git(['fetch', 'origin', '--quiet']);
git(['worktree', 'add', '-b', branch, dest, 'origin/main']);
console.error(`✓ worktree ready on ${branch}\n  cd ${dest}`);
console.log(dest); // stdout = path only, so `cd "$(npm run --silent wt:new ...)"` works
