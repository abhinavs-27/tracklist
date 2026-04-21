# Project Dependency Audit Summary (Updated 2026-04-21)

## Audit Status
- **Vulnerabilities Fixed:** Resolved high-severity DoS in `next` and high-severity injection in `basic-ftp` (via `vercel` upgrade).
- **Core Updates:**
  - Upgraded Root `next` to `16.2.4`.
  - Upgraded Root `vercel` to `50.44.0`.
  - Upgraded all projects to `typescript@6.0.3`.
  - Upgraded `@supabase/supabase-js` to `2.104.0`.
  - Upgraded `@tanstack/react-query` to `5.99.2`.
- **Core Guidelines Followed:**
  - Updated all dependencies to their latest safe versions within major version constraints.
  - Maintained Expo-specific versioning for `mobile/` dependencies.
  - Fixed TypeScript deprecation warnings in `backend/tsconfig.json`.
- **Verification:**
  - Successfully ran `npm run build`, `npm run typecheck`, and `npm run test:unit` for the root project.
  - Successfully ran `npm run build` for the backend project.
  - Verified that mobile typecheck issues are pre-existing baseline and not regressions.

## Updated Dependencies

### Root Project
| Package | Version Change |
|---------|----------------|
| `next` | `16.2.2` -> `16.2.4` |
| `vercel` | `50.39.0` -> `50.44.0` |
| `typescript` | `6.0.2` -> `6.0.3` |
| `@supabase/supabase-js` | `2.101.1` -> `2.104.0` |
| `vitest` | `4.1.2` -> `4.1.4` |
| `bullmq` | `5.73.0` -> `5.75.2` |
| `next-auth` | `4.24.13` -> `4.24.14` |

### Backend Project
| Package | Version Change |
|---------|----------------|
| `typescript` | `6.0.2` -> `6.0.3` |
| `@supabase/supabase-js` | `2.101.1` -> `2.104.0` |
| `dotenv` | `17.4.1` -> `17.4.2` |

### Mobile Project
| Package | Version Change |
|---------|----------------|
| `typescript` | `6.0.2` -> `6.0.3` |
| `@supabase/supabase-js` | `2.101.1` -> `2.104.0` |
| `@babel/runtime` | `7.25.7` -> `7.26.10` |
| `axios` | `1.14.0` -> `1.15.1` |
