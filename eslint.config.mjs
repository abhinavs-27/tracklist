import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    // Build artifacts — compiled JS, never source-of-truth
    "**/dist/**",
    // Git worktrees created by Claude Code — not part of this branch
    ".claude/worktrees/**",
    // Untracked one-off scripts (not yet part of the codebase)
    "scripts/refresh-all-taste-identity.ts",
  ]),
  // Files that are legitimately CommonJS — `.cjs` by extension, or config
  // files (babel) that Babel/Metro load synchronously via require(). require()
  // is correct here, so the no-require-imports rule does not apply.
  {
    files: ["**/*.cjs", "**/babel.config.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
