import { describe, it, expect } from 'vitest';
import { computeTidyPlan } from './tidy-plan.mjs';

const wt = (over = {}) => ({
  path: '/x', branch: 'b', mergedIntoMain: false, missing: false, isMain: false, ...over,
});

describe('computeTidyPlan', () => {
  it('deletes merged, non-checked-out, non-protected branches', () => {
    const plan = computeTidyPlan({
      branches: [
        { name: 'feat/old', mergedIntoMain: true, checkedOut: false },
        { name: 'fix/wip', mergedIntoMain: false, checkedOut: false },
        { name: 'chore/current', mergedIntoMain: true, checkedOut: true },
        { name: 'main', mergedIntoMain: true, checkedOut: false },
      ],
      worktrees: [],
    });
    expect(plan.branchesToDelete).toEqual(['feat/old']);
  });

  it('never deletes protected branches even if merged', () => {
    const plan = computeTidyPlan({
      branches: [{ name: 'main', mergedIntoMain: true, checkedOut: false }],
      worktrees: [],
      protectedBranches: ['main', 'develop'],
    });
    expect(plan.branchesToDelete).toEqual([]);
  });

  it('prunes worktrees that are missing or on a merged branch, except the main tree', () => {
    const plan = computeTidyPlan({
      branches: [],
      worktrees: [
        wt({ path: '/main', isMain: true, mergedIntoMain: true }),  // main tree, never pruned
        wt({ path: '/gone', missing: true }),                       // missing -> prune
        wt({ path: '/merged', mergedIntoMain: true }),              // merged -> prune
        wt({ path: '/active', mergedIntoMain: false }),             // unmerged -> keep
      ],
    });
    expect(plan.worktreesToPrune.sort()).toEqual(['/gone', '/merged']);
  });

  it('returns empty plan when nothing is stale', () => {
    const plan = computeTidyPlan({
      branches: [{ name: 'fix/wip', mergedIntoMain: false, checkedOut: false }],
      worktrees: [wt({ isMain: true })],
    });
    expect(plan).toEqual({ branchesToDelete: [], worktreesToPrune: [] });
  });
});
