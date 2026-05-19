# Project Dependency Audit Summary (June 2026 Update)

## Audit Status
- **Vulnerabilities Fixed:** 3 (1 High, 2 Moderate) - *Current audit shows 0 vulnerabilities.*
- **Core Guidelines Followed:**
  - Updated all dependencies to their "Wanted" or safe versions (June 2026 Audit).
  - Resolved `brace-expansion` moderate severity vulnerability via root and backend `overrides`.
  - Resolved `@xmldom/xmldom` high severity vulnerability via mobile `overrides`.
  - Maintained version consistency for shared packages (`@supabase/supabase-js`, `@tanstack/react-query`, `react`, etc.) across root, backend, and mobile projects.
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
| `brace-expansion` (override) | `5.0.5` -> `5.0.6` | Moderate (DoS) |
| `@aws-sdk/client-s3` | `3.1048.0` -> `^3.1049.0` | - |
| `@aws-sdk/client-sqs` | `3.1048.0` -> `^3.1049.0` | - |
| `@aws-sdk/s3-request-presigner` | `3.1048.0` -> `^3.1049.0` | - |
| `@supabase/supabase-js` | `2.105.4` -> `^2.106.0` | - |
| `@tanstack/react-query` | `5.100.10` -> `^5.100.11` | - |
| `@tanstack/react-query-devtools` | `5.100.10` -> `^5.100.11` | - |
| `bullmq` | `5.76.9` -> `^5.76.10` | - |
| `framer-motion` | `12.38.0` -> `^12.39.0` | - |
| `tsx` | `4.22.1` -> `^4.22.2` | - |

### Backend Project
| Package | Version Change | Vulnerability Fixed |
|---------|----------------|---------------------|
| `brace-expansion` (override) | N/A -> `5.0.6` | Moderate (DoS) |
| `@supabase/supabase-js` | `2.105.4` -> `^2.106.0` | - |

### Mobile Project
| Package | Version Change | Vulnerability Fixed |
|---------|----------------|---------------------|
| `@xmldom/xmldom` (override) | `0.8.10` -> `0.9.10` | High (Multiple XML Injections) |
| `@supabase/supabase-js` | `2.105.4` -> `^2.106.0` | - |
| `@tanstack/react-query` | `5.100.10` -> `^5.100.11` | - |
| `react` | `19.2.0` -> `19.2.6` | - |
| `react-dom` | `19.2.0` -> `19.2.6` | - |
