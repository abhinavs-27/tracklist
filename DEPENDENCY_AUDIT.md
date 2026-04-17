# Project Dependency Audit Summary

## Audit Status
- **Vulnerabilities Fixed:** 2 High (Next.js, basic-ftp).
- **Core Guidelines Followed:**
  - Updated all major dependencies to their latest stable versions.
  - Resolved TypeScript 6.0 deprecation warnings in backend `tsconfig.json`.
  - Maintained Expo-specific versioning constraints (`~`) for `@types/react` and `@types/react-dom` in the mobile project.
  - Kept `react-native` at baseline `0.83.2` for stability.
- **Verification:**
  - Successfully ran `npm run build` for the root project.
  - Successfully ran `npm run build` for the backend project.
  - Successfully ran `npm run test:unit` (54/54 passed).
  - Verified that mobile typecheck and lint issues are pre-existing baseline issues.

## Updated Dependencies

### Root Project
| Package | Version Change |
|---------|----------------|
| `next` | `16.2.2` -> `16.2.4` |
| `@supabase/supabase-js` | `2.101.1` -> `2.103.3` |
| `@supabase/ssr` | `0.10.0` -> `0.10.2` |
| `@tanstack/react-query` | `5.96.0` -> `5.99.0` |
| `@tanstack/react-query-devtools` | `5.96.0` -> `5.99.0` |
| `@aws-sdk/client-s3` | `3.1025.0` -> `3.1031.0` |
| `@aws-sdk/client-sqs` | `3.1025.0` -> `3.1031.0` |
| `@aws-sdk/s3-request-presigner` | `3.1025.0` -> `3.1031.0` |
| `bullmq` | `5.71.1` -> `5.74.1` |
| `next-auth` | `4.24.13` -> `4.24.14` |
| `react` | `19.2.4` -> `19.2.5` |
| `react-dom` | `19.2.4` -> `19.2.5` |
| `vercel` | `50.37.3` -> `50.44.0` |
| `eslint-config-next` | `16.2.2` -> `16.2.4` |
| `vitest` | `4.1.2` -> `4.1.4` |
| `typescript` | `6.0.2` -> `6.0.3` |
| `@types/node` | `25.5.0` -> `25.6.0` |

### Backend Project
| Package | Version Change |
|---------|----------------|
| `@supabase/supabase-js` | `2.101.1` -> `2.103.3` |
| `next-auth` | `4.24.13` -> `4.24.14` |
| `typescript` | `6.0.2` -> `6.0.3` |
| `dotenv` | `17.4.1` -> `17.4.2` |

### Mobile Project
| Package | Version Change |
|---------|----------------|
| `@supabase/supabase-js` | `2.101.1` -> `2.103.3` |
| `@tanstack/react-query` | `5.96.0` -> `5.99.0` |
| `expo` | `55.0.9` -> `55.0.15` |
| `expo-auth-session` | `55.0.9` -> `55.0.14` |
| `expo-blur` | `55.0.10` -> `55.0.14` |
| `expo-constants` | `55.0.8` -> `55.0.14` |
| `expo-linking` | `55.0.7` -> `55.0.13` |
| `expo-notifications` | `55.0.13` -> `55.0.19` |
| `expo-router` | `55.0.6` -> `55.0.12` |
| `expo-web-browser` | `55.0.10` -> `55.0.14` |
| `react` | `19.2.4` -> `19.2.5` |
| `react-dom` | `19.2.4` -> `19.2.5` |
| `typescript` | `6.0.2` -> `6.0.3` |
