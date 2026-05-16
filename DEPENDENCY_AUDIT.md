# Project Dependency Audit Summary (May 2026 Update)

## Audit Status
- **Vulnerabilities Fixed:** 4 (3 High, 1 Moderate).
- **Core Guidelines Followed:**
  - Updated all dependencies to their "Wanted" or safe versions.
  - Resolved `fast-uri` and `fast-xml-builder` high severity vulnerabilities via root `overrides`.
  - Upgraded `next` to `16.2.6` to fix high severity DoS and bypass vulnerabilities.
  - Upgraded `vercel` to `54.1.0` to fix a moderate severity vulnerability.
  - Maintained version consistency for shared packages (`@supabase/supabase-js`, `next-auth`, `react`, etc.) across root, backend, and mobile projects.
- **Verification:**
  - Successfully ran `npm run build` for the root project.
  - Successfully ran `npm run test:unit` for the root project (54/54 passed).
  - Successfully ran `npm run build` for the backend project.
  - Verified 0 vulnerabilities across all projects via `npm audit`.
  - Identified that existing lint/typecheck issues in root and mobile are pre-existing and not regressions from the upgrades.

## Updated Dependencies

### Root Project
| Package | Version Change | Vulnerability Fixed |
|---------|----------------|---------------------|
| `next` | `16.2.2` -> `16.2.6` | High (DoS, Proxy Bypass, XSS, Cache Poisoning) |
| `vercel` | `50.37.3` -> `54.1.0` | Moderate |
| `fast-uri` (override) | N/A -> `3.1.2` | High (Path Traversal, Host Confusion) |
| `fast-xml-builder` (override) | N/A -> `1.2.0` | High (Malicious Attribute Bypass) |
| `@aws-sdk/client-s3` | `3.1025.0` -> `3.1048.0` | - |
| `@supabase/ssr` | `0.10.0` -> `0.10.3` | - |
| `@supabase/supabase-js` | `2.101.1` -> `2.105.4` | - |
| `@tanstack/react-query` | `5.96.0` -> `5.100.10` | - |
| `bullmq` | `5.71.1` -> `5.76.8` | - |
| `next-auth` | `4.24.13` -> `4.24.14` | - |
| `react` | `19.2.4` -> `19.2.6` | - |
| `react-dom` | `19.2.4` -> `19.2.6` | - |

### Backend Project
| Package | Version Change |
|---------|----------------|
| `@supabase/supabase-js` | `2.101.1` -> `2.105.4` |
| `dotenv` | `17.4.1` -> `17.4.2` |
| `express` | `4.22.1` -> `4.22.2` |
| `http-proxy-middleware` | `3.0.3` -> `3.0.5` |
| `next-auth` | `4.24.13` -> `4.24.14` |

### Mobile Project
| Package | Version Change |
|---------|----------------|
| `@supabase/supabase-js` | `2.101.1` -> `2.105.4` |
| `@tanstack/react-query` | `5.96.0` -> `5.100.10` |
| `expo` | `55.0.9` -> `55.0.24` |
| `react` | `19.2.4` -> `19.2.6` |
| `react-dom` | `19.2.4` -> `19.2.6` |
| `axios` | `1.14.0` -> `1.16.1` |
