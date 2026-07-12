import { describe, it, expect } from 'vitest';
import { validateBranchName, BRANCH_NAME_RULE } from './validate-branch-name.mjs';

describe('validateBranchName', () => {
  it('accepts each allowed prefix with a kebab description', () => {
    for (const b of [
      'feat/add-search',
      'fix/ula-alltime-bucket',
      'chore/tidy-deps',
      'docs/git-workflow',
      'refactor/split-queries',
      'test/feed-coverage',
      'perf/album-catalog',
    ]) {
      expect(validateBranchName(b).valid, b).toBe(true);
    }
  });

  it('accepts single-segment descriptions and digits', () => {
    expect(validateBranchName('fix/a').valid).toBe(true);
    expect(validateBranchName('chore/deps-2026').valid).toBe(true);
  });

  it('exempts main and HEAD', () => {
    expect(validateBranchName('main').valid).toBe(true);
    expect(validateBranchName('HEAD').valid).toBe(true);
  });

  it('rejects unknown prefixes', () => {
    expect(validateBranchName('wip/thing').valid).toBe(false);
    expect(validateBranchName('feature/thing').valid).toBe(false);
  });

  it('rejects missing prefix, bad chars, and empty', () => {
    for (const b of [
      'reports-redesign',       // no prefix
      'ratings-first-class',    // no prefix
      'fix/Add-Search',         // uppercase
      'fix/add_search',         // underscore
      'fix/add--search',        // double dash
      'fix/-lead',              // leading dash
      'fix/trail-',             // trailing dash
      'fix/',                   // empty description
      'fix/a/b',                // extra slash
      '',                       // empty
    ]) {
      expect(validateBranchName(b).valid, b).toBe(false);
    }
  });

  it('returns a reason that includes the rule when invalid', () => {
    const r = validateBranchName('wip/thing');
    expect(r.valid).toBe(false);
    expect(r.reason).toContain(BRANCH_NAME_RULE);
  });
});
