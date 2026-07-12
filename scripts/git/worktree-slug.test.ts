import { describe, it, expect } from 'vitest';
import { deriveWorktreeSlug } from './worktree-slug.mjs';

describe('deriveWorktreeSlug', () => {
  it('replaces the type slash with a dash', () => {
    expect(deriveWorktreeSlug('fix/ula-bucket')).toBe('fix-ula-bucket');
    expect(deriveWorktreeSlug('feat/add-search')).toBe('feat-add-search');
  });
  it('leaves already-flat names unchanged', () => {
    expect(deriveWorktreeSlug('fix-a')).toBe('fix-a');
  });
});
