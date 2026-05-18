# Project Dependency Audit Summary (May 2026 Update)

## Audit Status
- **Vulnerabilities Fixed:** 5 (4 High, 1 Moderate) - *Current audit shows 0 vulnerabilities.*
- **Core Guidelines Followed:**
  - Updated all dependencies to their "Wanted" or safe versions (May 2026 Audit).
  - Resolved `fast-uri`, `fast-xml-builder`, and `@xmldom/xmldom` high severity vulnerabilities via root and project-specific `overrides`.
  - Upgraded `next` to `16.2.6` to fix high severity DoS and bypass vulnerabilities.
  - Upgraded `vercel` to `54.1.0` to fix a moderate severity vulnerability.
  - Upgraded `express` to `5.2.1` and `http-proxy-middleware` to `4.0.0` in the backend.
  - Upgraded `react-native` to `0.85.3` in the mobile project.
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
| `@tanstack/react-query` | `5.96.0" -> `5.100.10` | - |
| `bullmq` | `5.76.9` -> `5.76.10` | - |
| `next-auth` | `4.24.13` -> `4.24.14` | - |
| `react` | `19.2.4` -> `19.2.6` | - |
| `react-dom` | `19.2.4` -> `19.2.6` | - |
| `typescript` | `6.0.2` -> `6.0.3` | - |
| `@playwright/test` | `1.58.2` -> `1.60.0` | - |
| `@tailwindcss/postcss` | `4.2.2` -> `4.3.0` | - |
| `@types/node` | `25.5.0` -> `25.8.0` | - |
| `@vitejs/plugin-react` | `6.0.1` -> `6.0.2` | - |
| `eslint-config-next` | `16.2.2` -> `16.2.6` | - |
| `tailwindcss` | `4.2.2` -> `4.3.0` | - |
| `tsx` | `4.22.0` -> `4.22.1` | - |
| `vitest` | `4.1.2` -> `4.1.6` | - |

### Backend Project
| Package | Version Change |
|---------|----------------|
| `@supabase/supabase-js` | `2.101.1` -> `2.105.4` |
| `dotenv` | `17.4.1` -> `17.4.2` |
| `express` | `4.22.2` -> `5.2.1` |
| `http-proxy-middleware` | `3.0.5` -> `4.0.0` |
| `next-auth` | `4.24.13` -> `4.24.14` |
| `@types/express` | `4.17.25` -> `5.0.6` |
| `@types/node` | `22.19.19` -> `25.8.0` |

### Mobile Project
| Package | Version Change | Vulnerability Fixed |
|---------|----------------|---------------------|
| `@supabase/supabase-js` | `2.101.1` -> `2.105.4` | - |
| `@xmldom/xmldom` (override)| `0.8.10` -> `0.9.10` | High (XML Injection, DoS) |
| `expo` | `55.0.9` -> `55.0.24` | - |
| `react` | `19.2.0` -> `19.2.6` | - |
| `react-dom` | `19.2.0` -> `19.2.6` | - |
| `react-native` | `0.83.6` -> `0.85.3` | - |
| `axios` | `1.14.0` -> `1.16.1` | - |
| `react-native-safe-area-context` | `5.6.2` -> `5.7.0` | - |
| `react-native-screens` | `4.23.0` -> `4.25.0` | - |
