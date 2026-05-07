# Project Dependency Audit Summary (May 2026 Update)

## Audit Status
- **Vulnerabilities Fixed:** 1 moderate severity vulnerability in `vercel` (addressed by upgrading to `53.2.0`).
- **Audit Result:** `npm audit` now reports 0 vulnerabilities across root, backend, mobile, and shared packages.
- **Core Guidelines Followed:**
  - Updated all dependencies to their "Wanted" versions as specified by semantic versioning in `package.json`.
  - Upgraded `vercel` to `53.2.0` to resolve a moderate severity vulnerability.
  - Fixed a regression in `mobile/lib/explore-track-artwork.ts` where a property existence check was needed for a union type.
  - Added `@types/spotify-api` to root and mobile to resolve global namespace issues.
  - Updated `mobile/tsconfig.json` with `ignoreDeprecations: "6.0"` to match backend and suppress `baseUrl` warnings.
- **Verification:**
  - Successfully ran `npm run build` for the root project.
  - Successfully ran `npm run build` for the backend project.
  - Successfully ran `npm run test:unit` (54/54 passed).
  - Verified that mobile typecheck and lint issues are pre-existing and not regressions from the upgrades.

## Updated Dependencies (Major/Key Changes)

### Root Project
- `vercel`: `50.44.0` -> `53.2.0` (Security Fix)
- `next`: `16.2.4` -> `16.2.5`
- `bullmq`: `5.76.5` -> `5.76.6`
- `next-auth`: `4.24.13` -> `4.24.14`
- `@types/spotify-api`: Added as devDependency

### Backend Project
- `dotenv`: `17.4.1` -> `17.4.2`
- `@supabase/supabase-js`: `2.105.2` -> `2.105.3`

### Mobile Project
- `expo`: `55.0.20` -> `55.0.23`
- `expo-router`: `55.0.12` -> `55.0.14`
- `expo-notifications`: `55.0.20` -> `55.0.22`
- `@react-native-async-storage/async-storage`: `3.0.1` -> `3.0.2`
- `@types/spotify-api`: Added as devDependency
