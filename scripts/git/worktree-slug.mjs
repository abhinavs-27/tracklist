/**
 * Derive a filesystem-safe worktree folder name from a branch name.
 * @param {string} branch
 * @returns {string}
 */
export function deriveWorktreeSlug(branch) {
  return branch.replace(/\//g, '-');
}
