# Project Dependency Audit Summary (May 2026 Update)

## Audit Status
- **Vulnerabilities Fixed:**
  - Fixed **Next.js Denial of Service with Server Components** (GHSA-q4gf-8mx6-v5v3) by upgrading `next` from `16.2.2` to `16.2.4`.
  - Fixed **basic-ftp CRLF Injection and DoS** (GHSA-6v7q-wjvx-w8wg, GHSA-chqc-8p9q-pq6q, GHSA-rp42-5vxx-qpwr) by upgrading `vercel` from `50.37.3` to `50.44.0` (which pulls a patched `basic-ftp` via `get-uri`).
  - Fixed **Axios SSRF and Header Injection** (GHSA-3p68-rc4w-qgx5, GHSA-fvcv-3m26-pcqx) by upgrading `axios` from `1.14.0` to `1.15.2` in the mobile project.
  - Fixed **follow-redirects Authentication Header Leak** (GHSA-r4q5-vmmm-2653) by updating dependencies in backend and mobile.
- **Core Guidelines Followed:**
  - Updated all dependencies to their latest "Wanted" versions as specified by semantic versioning.
  - Resolved TypeScript deprecation warnings in the backend project by updating `tsconfig.json`.
  - Fixed regression in unit tests caused by duplicate mock properties.
- **Verification:**
  - `npm audit`: 0 vulnerabilities (Root, Backend, Mobile).
  - `npm run build`: Success (Root, Backend).
  - `npm run test:unit`: 54/54 passed (Root).
  - `npm run typecheck`: Success (Root).

## Updated Dependencies

### Root Project
| Package | Version Change |
|---------|----------------|
| `next` | `16.2.2` -> `16.2.4` |
| `next-auth` | `4.24.13` -> `4.24.14` |
| `vercel` | `50.37.3` -> `50.44.0` |
| `@aws-sdk/*` | `3.1025.0` -> `3.1034.0` |
| `@supabase/ssr` | `0.10.0` -> `0.10.2` |
| `@supabase/supabase-js` | `2.101.1` -> `2.104.0` |
| `@tanstack/react-query` | `5.96.0` -> `5.99.2` |
| `bullmq` | `5.71.1` -> `5.75.2` |

### Backend Project
| Package | Version Change |
|---------|----------------|
| `@supabase/supabase-js` | `2.101.1` -> `2.104.0` |
| `dotenv` | `17.4.1` -> `17.4.2` |
| `next-auth` | `4.24.13` -> `4.24.14` |

### Mobile Project
| Package | Version Change |
|---------|----------------|
| `axios` | `1.14.0` -> `1.15.2` |
| `expo` | `55.0.9` -> `55.0.17` |
| `@tanstack/react-query` | `5.96.0` -> `5.99.2` |
| `@supabase/supabase-js` | `2.101.1` -> `2.104.0` |
| `expo-*` (various) | Upgraded to latest 55.0.x versions |
