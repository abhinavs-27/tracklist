/**
 * Pure classifier for `git:tidy`. Decides which local branches are safe to delete
 * and which worktrees are safe to prune. All git I/O happens in the caller.
 * @param {{
 *   branches: Array<{ name: string, mergedIntoMain: boolean, checkedOut: boolean }>,
 *   worktrees: Array<{ path: string, branch: string|null, mergedIntoMain: boolean, missing: boolean, dirty: boolean, isMain: boolean }>,
 *   protectedBranches?: string[]
 * }} input
 * @returns {{ branchesToDelete: string[], worktreesToPrune: string[] }}
 */
export function computeTidyPlan(input) {
  const protectedBranches = new Set(input.protectedBranches ?? ['main']);
  const branchesToDelete = input.branches
    .filter((b) => b.mergedIntoMain && !b.checkedOut && !protectedBranches.has(b.name))
    .map((b) => b.name);
  const worktreesToPrune = input.worktrees
    .filter((w) => !w.isMain && !w.dirty && (w.missing || w.mergedIntoMain))
    .map((w) => w.path);
  return { branchesToDelete, worktreesToPrune };
}
