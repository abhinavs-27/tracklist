#!/usr/bin/env node
import { validateBranchName } from './validate-branch-name.mjs';

const name = process.argv[2] ?? '';
const { valid, reason } = validateBranchName(name);
if (!valid) {
  console.error(`✗ push blocked: ${reason}`);
  process.exit(1);
}
