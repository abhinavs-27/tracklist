# Project Dependency Audit Summary (June 2026 Update)

## Audit Status
- **Vulnerabilities Fixed:** 1 (@xmldom/xmldom updated to 0.9.10 in mobile project to fix XML injection and DoS vulnerabilities).
- **Core Guidelines Followed:**
  - Updated dependencies to their latest safe versions (June 2026 Audit).
  - Maintained version consistency for shared packages across root, backend, and mobile projects.
  - Verified zero vulnerabilities across all projects via `npm audit`.
- **Verification:**
  - Successfully ran `npm run build` for the root project.
  - Successfully ran `npm run test:unit` for the root project (60/60 passed).
  - Successfully ran Vitest integration tests for critical flows (23/23 passed).
  - Successfully ran Playwright E2E tests for critical flows (4/5 passed, 1 timeout).
  - Successfully ran `npm run build` for the backend project.
  - Successfully ran `npx expo export` for the mobile project.
  - Verified that pre-existing lint/typecheck issues in root, backend and mobile are not regressions from the upgrades.

## Updated Dependencies

### Root Project
| Package | Version Change | Vulnerability Fixed |
|---------|----------------|---------------------|
| `@aws-sdk/client-s3` | `^3.1050.0` -> `^3.1052.0` | - |
| `@aws-sdk/client-sqs` | `^3.1050.0` -> `^3.1052.0` | - |
| `@aws-sdk/s3-request-presigner` | `^3.1050.0` -> `^3.1052.0` | - |
| `@supabase/supabase-js` | `^2.106.0` -> `^2.106.1` | - |
| `@tanstack/react-virtual` | `^3.13.24` -> `^3.13.25` | - |
| `bullmq` | `^5.76.10` -> `^5.77.0` | - |
| `framer-motion` | `^12.39.0` -> `^12.40.0` | - |
| `vercel` | `^54.2.0` -> `^54.3.0` | - |

### Backend Project
| Package | Version Change | Vulnerability Fixed |
|---------|----------------|---------------------|
| `@supabase/supabase-js` | `^2.106.0` -> `^2.106.1` | - |

### Mobile Project
| Package | Version Change | Vulnerability Fixed |
|---------|----------------|---------------------|
| `@supabase/supabase-js` | `^2.106.1` -> `^2.106.1` (Synced) | - |
| `expo` | `~55.0.25` -> `~55.0.26` | - |
| `expo-router` | `~55.0.15` -> `~55.0.16` | - |
| `expo-image` | `~55.0.10` -> `~55.0.11` | - |
| `@xmldom/xmldom` | `0.8.10` -> `0.9.10` (Override) | Yes (GHSA-wh4c-j3r5-mjhp, GHSA-2v35-w6hq-6mfw, GHSA-f6ww-3ggp-fr8h, GHSA-x6wf-f3px-wcqx, GHSA-j759-j44w-7fr8) |
