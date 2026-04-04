# Project Dependency Audit Summary

## Audit Status
- **Vulnerabilities Fixed:** 0 (Baseline was 0 vulnerabilities).
- **Core Guidelines Followed:**
  - Updated all dependencies to their "Wanted" versions as specified by semantic versioning in `package.json`.
  - Avoided major version upgrades for core stability (Next.js, Express, React Native).
  - Maintained Expo-specific versioning constraints (`~`) for `@types/react` and `@types/react-dom` in the mobile project.
- **Verification:**
  - Successfully ran `npm run build` for the root project.
  - Successfully ran `npm run build` for the backend project.
  - Successfully ran `npm run test:unit` (30/30 passed).
  - Verified that mobile typecheck and lint issues are pre-existing and not regressions from the upgrades.

## Updated Dependencies

### Root Project
| Package | Version Change |
|---------|----------------|
| `@tanstack/react-query` | `5.96.0` -> `5.96.2` |
| `@tanstack/react-query-devtools` | `5.96.0` -> `5.96.2` |
| `@types/node` | `25.5.0` -> `25.5.2` |
| `bullmq` | `5.71.1` -> `5.73.0` |
| `eslint-config-next` | `16.2.0` -> `16.2.2` |
| `vercel` | `50.37.3` -> `50.39.0` |

### Backend Project
| Package | Version Change |
|---------|----------------|
| `@types/node` | `22.10.7` -> `22.19.17` |

### Mobile Project
| Package | Version Change |
|---------|----------------|
| `@react-native-async-storage/async-storage` | `3.0.1` -> `3.0.2` |
| `@tanstack/react-query` | `5.96.0` -> `5.96.2` |
| `expo` | `55.0.9` -> `55.0.11` |
| `expo-auth-session` | `55.0.9` -> `55.0.12` |
| `expo-blur` | `55.0.10` -> `55.0.12` |
| `expo-constants` | `55.0.9` -> `55.0.11` |
| `expo-image` | `55.0.6` -> `55.0.8` |
| `expo-linking` | `55.0.8` -> `55.0.11` |
| `expo-notifications` | `55.0.13` -> `55.0.16` |
| `expo-router` | `55.0.7` -> `55.0.10` |
| `expo-status-bar` | `55.0.4` -> `55.0.5` |
| `expo-web-browser` | `55.0.10` -> `55.0.12` |
| `@types/react` | `~19.2.2` (unchanged) |
| `@types/react-dom` | `~19.2.3` (unchanged) |
