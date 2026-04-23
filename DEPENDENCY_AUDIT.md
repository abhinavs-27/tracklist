# Project Dependency Audit Summary

## Audit Status (March 2025 Update)
- **Vulnerabilities Fixed:** 26 (Total reduced to 0).
- **Core Guidelines Followed:**
  - Updated all dependencies to their "Wanted" versions.
  - Addressed high-severity Next.js DoS vulnerability (updated to `16.2.4`).
  - Addressed persistent vulnerabilities in `fast-xml-parser` and `uuid` using root `overrides`.
  - Maintained stability across root, backend, and mobile projects.
- **Verification:**
  - Root: `npm run build` passed.
  - Backend: `npm run build` passed.
  - Mobile: `npx tsc --noEmit` verified (no regressions).
  - Unit Tests: `npm run test:unit` (54/54 passed).

## Updated Dependencies

### Root Project
| Package | Version Change |
|---------|----------------|
| `next` | `^16.2.2` -> `^16.2.4` |
| `@tanstack/react-query` | `^5.96.0` -> `^5.99.2` |
| `@tanstack/react-query-devtools` | `^5.96.0` -> `^5.99.2` |
| `@aws-sdk/client-s3` | `^3.1025.0` -> `^3.1035.0` |
| `@aws-sdk/client-sqs` | `^3.1025.0` -> `^3.1035.0` |
| `@aws-sdk/s3-request-presigner` | `^3.1025.0` -> `^3.1035.0` |
| `@supabase/ssr` | `^0.10.0` -> `^0.10.2` |
| `@supabase/supabase-js` | `^2.101.1` -> `^2.104.0` |
| `bullmq` | `^5.71.1` -> `^5.76.1` |
| `next-auth` | `^4.24.13` -> `^4.24.14` |
| `vercel` | `^50.37.3` -> `^50.44.0` |

### Backend Project
| Package | Version Change |
|---------|----------------|
| `@supabase/supabase-js` | `^2.101.1` -> `^2.104.0` |
| `next-auth` | `^4.24.13` -> `^4.24.14` |

### Mobile Project
| Package | Version Change |
|---------|----------------|
| `@expo/vector-icons` | `^15.0.2` -> `^15.1.1` |
| `@react-native-async-storage/async-storage` | `^3.0.1` -> `^3.0.2` |
| `@supabase/supabase-js` | `^2.101.1` -> `^2.104.0` |
| `@tanstack/react-query` | `^5.96.0` -> `^5.99.2` |
| `axios` | `^1.14.0` -> `^1.15.2` |
| `expo` | `^55.0.9` -> `^55.0.17` |
| `expo-auth-session` | `^55.0.9` -> `^55.0.15` |
| `expo-blur` | `~55.0.10` -> `~55.0.14` |
| `expo-constants` | `~55.0.8` -> `~55.0.15` |
| `expo-image` | `~55.0.6` -> `~55.0.9` |
| `expo-linking` | `^55.0.7` -> `^55.0.14` |
| `expo-notifications` | `~55.0.13` -> `~55.0.20` |
| `expo-router` | `~55.0.6` -> `~55.0.13` |
| `expo-status-bar` | `~55.0.4` -> `~55.0.5` |
| `expo-web-browser` | `^55.0.10` -> `^55.0.14` |

### Overrides (Vulnerability Fixes)
| Package | Forced Version | Reason |
|---------|----------------|--------|
| `fast-xml-parser` | `5.7.0` | Fix XML injection vulnerabilities (GHSA-gh4j-gqv2-49f6) |
| `uuid` | `14.0.0` | Fix buffer bounds check vulnerability (GHSA-w5hq-g745-h8pq) |
