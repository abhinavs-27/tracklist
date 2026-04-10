# Project Dependency Audit Summary

## Audit Status
- **Vulnerabilities Fixed:** 1 high-severity vulnerability in `basic-ftp` (via `vercel` dependency).
- **Core Guidelines Followed:**
  - Updated all dependencies to their "Wanted" versions as specified by semantic versioning in `package.json`.
  - Avoided major version upgrades for core stability (Next.js, Express, React Native).
  - Maintained Expo-specific versioning constraints (`~`) for `@types/react` and `@types/react-dom` in the mobile project.
- **Verification:**
  - Successfully ran `npm run build` for the root project.
  - Successfully ran `npm run build` for the backend project.
  - Successfully ran `npm run test:unit` (54/54 passed).
  - Verified that mobile typecheck and lint issues are pre-existing and not regressions from the upgrades.

## Updated Dependencies

### Root Project
| Package | Version Change |
|---------|----------------|
| `@aws-sdk/client-s3` | `3.1025.0` -> `3.1028.0` |
| `@aws-sdk/client-sqs` | `3.1025.0` -> `3.1028.0` |
| `@aws-sdk/s3-request-presigner` | `3.1025.0` -> `3.1028.0` |
| `@supabase/ssr` | `0.10.0` -> `0.10.2` |
| `@supabase/supabase-js` | `2.101.1` -> `2.103.0` |
| `@tanstack/react-query` | `5.96.2` -> `5.97.0` |
| `@tanstack/react-query-devtools` | `5.96.2` -> `5.97.0` |
| `@types/node` | `25.5.2` -> `25.6.0` |
| `bullmq` | `5.73.0` -> `5.73.3` |
| `eslint-config-next` | `16.2.2` -> `16.2.3` |
| `next` | `16.2.2` -> `16.2.3` |
| `vercel` | `50.39.0` -> `50.42.0` |
| `vitest` | `4.1.2` -> `4.1.4` |

### Backend Project
| Package | Version Change |
|---------|----------------|
| `@supabase/supabase-js` | `2.101.1` -> `2.103.0` |
| `@types/cookie-parser` | `1.4.8` -> `1.4.10` |
| `@types/cors` | `2.8.17` -> `2.8.19` |
| `http-proxy-middleware` | `3.0.3` -> `3.0.5` |

### Mobile Project
| Package | Version Change |
|---------|----------------|
| `@expo/vector-icons` | `15.0.2` -> `15.1.1` |
| `@react-native-async-storage/async-storage` | `3.0.1` -> `3.0.2` |
| `@supabase/supabase-js` | `2.101.1` -> `2.103.0` |
| `@tanstack/react-query` | `5.96.0` -> `5.97.0` |
| `axios` | `1.14.0` -> `1.15.0` |
| `expo` | `55.0.9` -> `55.0.13` |
| `expo-auth-session` | `55.0.9` -> `55.0.13` |
| `expo-blur` | `55.0.10` -> `55.0.14` |
| `expo-constants` | `55.0.8` -> `55.0.13` |
| `expo-image` | `55.0.6` -> `55.0.8` |
| `expo-linking` | `55.0.7` -> `55.0.12` |
| `expo-notifications` | `55.0.13` -> `55.0.18` |
| `expo-router` | `55.0.6` -> `55.0.11` |
| `expo-status-bar` | `55.0.4` -> `55.0.5` |
| `expo-web-browser` | `55.0.10` -> `55.0.14` |
