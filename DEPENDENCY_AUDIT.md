# Project Dependency Audit Summary (Updated)

## Audit Status (June 2024 Update)
- **Vulnerabilities Fixed:** 4 high/moderate severity vulnerabilities resolved across root, backend, and mobile.
  - Root: `next` DoS vulnerability fixed by upgrading to `16.2.4`. `basic-ftp` CRLF injection fixed via `npm audit fix`.
  - Backend: `follow-redirects` header leak fixed via `npm audit fix`.
  - Mobile: `axios` SSRF/Metadata exfiltration fixed by upgrading to `1.15.1`.
- **Core Guidelines Followed:**
  - Updated dependencies to their "Wanted" versions as specified by semantic versioning.
  - Maintained stability by avoiding major version jumps for core frameworks where possible.
  - Kept mobile `@types/react` and `@types/react-dom` on tilde versions for Expo compatibility.
- **Verification:**
  - `npm run build` (Root): PASSED
  - `npm run build` (Backend): PASSED
  - `npm run test:unit` (Root): PASSED (54/54 passed)
  - `npm run typecheck` (Root): PASSED

## Updated Dependencies

### Root Project
| Package | Version Change |
|---------|----------------|
| `next` | `16.2.2` -> `16.2.4` |
| `@supabase/supabase-js` | `2.101.1` -> `2.103.3` |
| `@tanstack/react-query` | `5.96.2` -> `5.99.2` |
| `@tanstack/react-query-devtools` | `5.96.2` -> `5.99.2` |
| `@tanstack/react-virtual` | `3.13.23` -> `3.13.24` |
| `bullmq` | `5.73.0` -> `5.74.2` |
| `vercel` | `50.39.0` -> `50.44.0` |
| `@aws-sdk/client-s3` | `3.1025.0` -> `3.1032.0` |
| `@supabase/ssr` | `0.10.0` -> `0.10.2` |
| `next-auth` | `4.24.13` -> `4.24.14` |

### Backend Project
| Package | Version Change |
|---------|----------------|
| `@supabase/supabase-js` | `2.101.1` -> `2.103.3` |
| `next-auth` | `4.24.13` -> `4.24.14` |
| `dotenv` | `17.4.1` -> `17.4.2` |
| `http-proxy-middleware` | `3.0.3` -> `3.0.5` |

### Mobile Project
| Package | Version Change |
|---------|----------------|
| `axios` | `1.14.0` -> `1.15.1` |
| `expo` | `55.0.11` -> `55.0.15` |
| `expo-router` | `55.0.10` -> `55.0.12` |
| `expo-image` | `55.0.8` -> `55.0.8` (up-to-date) |
| `@supabase/supabase-js` | `2.101.1` -> `2.103.3` |
| `@tanstack/react-query` | `5.96.2` -> `5.99.2` |
| `expo-auth-session` | `55.0.12` -> `55.0.14` |
| `expo-blur` | `55.0.12` -> `55.0.14` |
| `expo-constants` | `55.0.11` -> `55.0.14` |
| `expo-linking` | `55.0.11` -> `55.0.13` |
| `expo-notifications` | `55.0.16` -> `55.0.19` |
| `expo-status-bar` | `55.0.5` -> `55.0.5` (up-to-date) |
| `expo-web-browser` | `55.0.12` -> `55.0.14` |
