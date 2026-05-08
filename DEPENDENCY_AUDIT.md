# Project Dependency Audit Summary

## Audit Status (May 2026)
- **Vulnerabilities Fixed:** 1 moderate severity vulnerability in `vercel` (fixed by upgrading to `53.2.0`).
- **Core Guidelines Followed:**
  - Updated all dependencies to their "Wanted" versions as specified by semantic versioning in `package.json`.
  - Upgraded `vercel` to `53.2.0` in the root project to address GHSA-pgf8-2hgj-grqg.
  - Maintained stability by staying within major versions for core frameworks (Next.js, Express, React Native).
- **Verification:**
  - Root: `npm run typecheck`, `npm run build`, and `npm run test:unit` (54/54 passed) all successful.
  - Backend: `npm run build` (TSC) successful.
  - Mobile: Verified `npx tsc --noEmit` and updated `tsconfig.json` to resolve deprecation warnings.
  - Confirmed that existing lint and type errors in the mobile project are pre-existing and not regressions.

## Updated Dependencies

### Root Project
| Package | Version Change |
|---------|----------------|
| `@aws-sdk/client-s3` | `3.1025.0` -> `3.1045.0` |
| `@aws-sdk/client-sqs` | `3.1025.0` -> `3.1045.0` |
| `@aws-sdk/s3-request-presigner` | `3.1025.0` -> `3.1045.0` |
| `@supabase/ssr` | `0.10.0` -> `0.10.3` |
| `@supabase/supabase-js` | `2.101.1` -> `2.105.3` |
| `@tanstack/react-query` | `5.96.0` -> `5.100.9` |
| `@tanstack/react-query-devtools` | `5.96.0` -> `5.100.9` |
| `@types/node` | `25.5.0` -> `25.6.2` |
| `bullmq` | `5.71.1` -> `5.76.6` |
| `eslint-config-next` | `16.2.2` -> `16.2.6` |
| `next` | `16.2.2` -> `16.2.6` |
| `vercel` | `50.37.3` -> `53.2.0` |

### Backend Project
| Package | Version Change |
|---------|----------------|
| `@supabase/supabase-js` | `2.101.1` -> `2.105.3` |
| `@types/node` | `22.19.17` -> `22.19.18` |

### Mobile Project
| Package | Version Change |
|---------|----------------|
| `@supabase/supabase-js` | `2.101.1` -> `2.105.3` |
| `@tanstack/react-query` | `5.96.0` -> `5.100.9` |
| `expo` | `55.0.9` -> `55.0.23` |
| `expo-blur` | `~55.0.10` -> `~55.0.14` |
| `expo-constants` | `~55.0.8` -> `~55.0.16` |
| `expo-image` | `~55.0.6` -> `~55.0.10` |
| `expo-linking` | `^55.0.7` -> `^55.0.15` |
| `expo-notifications` | `~55.0.13` -> `~55.0.22` |
| `expo-router` | `~55.0.6` -> `~55.0.14` |
| `expo-status-bar` | `~55.0.4` -> `~55.0.6` |
| `expo-web-browser` | `^55.0.10` -> `^55.0.15` |
