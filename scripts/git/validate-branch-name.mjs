// Canonical branch-naming rule. Single source of truth — the pre-push hook and
// the wt:new helper both go through validateBranchName().
export const BRANCH_NAME_RULE =
  '^(feat|fix|chore|docs|refactor|test|perf)/[a-z0-9]+(-[a-z0-9]+)*$';

const RE = new RegExp(BRANCH_NAME_RULE);
const EXEMPT = new Set(['main', 'HEAD']);

/**
 * Validate a git branch name against the project convention.
 * @param {string} name
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateBranchName(name) {
  if (typeof name !== 'string' || name.length === 0) {
    return { valid: false, reason: `branch name is empty; must match ${BRANCH_NAME_RULE}` };
  }
  if (EXEMPT.has(name)) return { valid: true };
  if (RE.test(name)) return { valid: true };
  return {
    valid: false,
    reason:
      `branch "${name}" must match ${BRANCH_NAME_RULE}\n` +
      '  e.g. feat/add-search, fix/ula-bucket, chore/tidy-deps',
  };
}
