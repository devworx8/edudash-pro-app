# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

EduDash Pro is a React Native (Expo) mobile-first educational platform for South African learners, parents, and educators. It supports multiple organization types (schools, preschools, districts, tutoring centers) and independent users (parents without school affiliation). Multi-tenant SaaS with a cloud-hosted Supabase (PostgreSQL) backend.

**Stack**: React Native 0.81 + Expo SDK 54 + React 19 + TypeScript 5.9 + Supabase JS v2 + TanStack Query v5

Node.js 20 is required (`.nvmrc` and `package.json` engines field).

## Essential Commands

### Development
```bash
npm start                    # Start Metro with dev client (port 8081)
npm run start:clear          # Start with cache cleared
npm run dev:android          # Start + open on connected Android device
npm run web:dev              # Run in browser via react-native-web (port 8082)
```

### Quality Gates
```bash
npm run typecheck            # TypeScript check (uses 8GB heap automatically)
npm run lint                 # Runs validate:progress-bars + check:expo-filesystem + ESLint (max 200 warnings)
npm run lint:fix             # ESLint autofix
npm test                     # Jest tests (roots: lib/, services/, tests/)
npm run test:watch           # Jest in watch mode
npm run lint:sql             # SQLFluff lint on supabase/migrations/
npm run check:file-sizes     # Enforce file size limits
```

### Pre-OTA / Pre-Production Verification
```bash
npm run test:pre-ota         # lint + typecheck + test + verify:reliability-audit + check:expo-filesystem
npm run verify:prod          # Same as above — run before production builds
```

### Building
```bash
npm run build:dev            # Dev build on EAS (Android)
npm run build:dev:apk        # Dev APK on EAS
npm run build:android:aab    # Production AAB (bumps version automatically)
npm run build:playstore      # Play Store build (bumps version + uses playstore profile)
npm run ota                  # OTA update to production channel
npm run ota:release8:safe    # Pre-OTA checks + OTA push
```

### Database
```bash
supabase migration new <name>   # Create new migration
supabase db push                # Apply migrations to remote (NEVER use --local)
supabase db diff                # Verify no schema drift after push
npm run inspect-db              # Inspect remote DB schema
npm run inspect-db-full         # Inspect with service role
```

### Running a Single Test
```bash
npx jest path/to/file.test.ts              # Run one test file
npx jest --testPathPattern='some-pattern'  # Run tests matching pattern
```

## Architecture

### Routing (Expo Router / file-based)
All screens live under `app/`. Route groups:
- `app/(auth)/` — Sign-in, sign-up, forgot-password, role selection
- `app/(parent)/` — Parent-specific deep routes (message threads, proof-of-payment)
- `app/(k12)/` — K-12 student/parent routes with a separate layout
- `app/(public)/` — Unauthenticated pages (pricing, terms, privacy, apply)
- `app/screens/` — The bulk of the app: role-specific dashboards and feature screens (200+ files). Screens are NOT grouped by role in the filesystem; role gating happens at runtime.
- `app/_layout.tsx` — Root layout. Wraps the entire app in a deep provider tree (17+ nested providers: QueryProvider → ThemeProvider → AuthProvider → SubscriptionProvider → AdsProvider → … → GestureHandlerRootView).

### Provider Stack (app/_layout.tsx)
The root layout nests providers in a specific order. Key providers:
- `QueryProvider` (TanStack Query with AsyncStorage persistence)
- `AuthProvider` (Supabase auth, profile loading, RBAC permissions)
- `SubscriptionProvider` (tier/plan state, RevenueCat on native)
- `AdsProvider` (AdMob, conditional on tier)
- `CallProvider` (Daily.co WebRTC video calls)
- `NotificationProvider` (push notification state)
- `SpotlightTourProvider` (onboarding tours)

### Authentication & Profiles
- `contexts/AuthContext.tsx` — Manages auth state. Heavy logic split into `contexts/auth/` submodules (sessionBoot, handleSignedIn, handleSignedOut, profileFetch).
- **Use `profiles` table, NOT `users` table.** The `users` table is deprecated. `profiles.id` equals `auth.uid()`.
- `lib/rbac/` — Role-Based Access Control. Roles: superadmin, principal, principal_admin, teacher, parent, independent_user, student, learner, admin. Permission matrix in `lib/rbac/roles-permissions.json`.
- `lib/sessionManager.ts` — Session persistence, sign-out, token refresh.

### Supabase Client
- `lib/supabase.ts` — Single Supabase client instance. Uses unified storage adapter (AsyncStorage on native, localStorage on web). Auth session key: `edudash-auth-session`. PKCE flow enabled.
- All AI calls go through Supabase Edge Functions (never direct client-side API keys).

### Dash AI Assistant (services/dash-ai/)
Modular AI assistant system:
- `DashAICore.ts` — Orchestration facade
- `DashAIClient.ts` — LLM communication via `ai-proxy` Edge Function
- `DashConversationManager.ts` / `DashConversationService.ts` — Chat state & persistence
- `DashMemoryService.ts` — Conversation memory
- `DashVoiceService.ts` — Voice input/output (Azure Speech SDK)
- `DashToolRegistry.ts` / `tools/` — Agentic tool system
- `DashPromptBuilder.ts` — System prompt construction
- `DashAINavigator.ts` — AI-driven navigation
- `facades/` — Role-specific AI facades
- Initialized lazily in `app/_layout.tsx` via dynamic import.

### Voice System (lib/voice/)
Multiple voice providers:
- `azureProvider.ts` — Azure Cognitive Services (primary, region: `southafricanorth`)
- `expoProvider.ts` — Expo Speech Recognition (on-device fallback)
- `openaiWhisperProvider.ts` / `openaiWhisperStreamingProvider.ts` — OpenAI Whisper
- `unifiedProvider.ts` — Abstraction layer that selects provider
- `webrtcProvider.ts` — WebRTC-based real-time voice
- SA languages: en-ZA, af-ZA, zu-ZA, xh-ZA

### Navigation System (lib/navigation/)
- `navManifest.ts` — Bottom tab configuration, role-based center Dash tab
- `BottomTabBar` component (components/navigation/) — Persistent bottom navigation
- `DraggableDashFAB` — Floating action button for AI assistant access
- `safeRouter.ts` / `router-utils.ts` — Route helpers
- `navigationInterceptor.ts` — Route interception logic

### State Management
- **TanStack Query v5** for all server state. Persisted to AsyncStorage via `lib/query/queryClient.tsx`. Cache key: `EDUDASH_QUERY_CACHE`.
- **React Context** for client-only state (auth, theme, subscription, ads, active child, etc.)
- Query keys centralized in `lib/queryKeys/` and `lib/query/queryClient.tsx`.

### Multi-Tenant Isolation
- Affiliated users filter by `organization_id` (or legacy `preschool_id`).
- Independent users filter by `user_id` only (organization_id is NULL).
- RLS policies enforce isolation at the database level.
- **The `organization_members` table has no `status` column.** Use `membership_status` or `seat_status`.

### Edge Functions (supabase/functions/)
70+ Edge Functions including:
- `ai-proxy`, `ai-gateway`, `ai-insights`, `ai-usage` — AI orchestration
- `azure-speech-token`, `stt-proxy`, `tts-proxy` — Voice services
- `payfast-*`, `payments-*` — Payment processing
- `daily-rooms`, `daily-token`, `send-fcm-call` — Video calling
- `notifications-dispatcher`, `birthday-reminders-cron`, `weekly-report-cron` — Background jobs
- `social-agent-*`, `social-facebook-*` — Social media automation
- Shared utilities in `supabase/functions/_shared/`

### Web Platform
- Runs via `react-native-web`. Metro config (`metro.config.js`) has extensive web-specific resolver that stubs out native-only modules (AdMob, biometrics, RevenueCat, Sentry, Porcupine wake word, etc.) using files in `lib/stubs/`.
- PWA support: service worker, manifest.json served via Metro middleware.

### i18n
- `i18next` + `react-i18next` with `expo-localization`. Config in `lib/i18n.ts`.
- Locale files in the project (en-ZA primary, af-ZA, zu-ZA, xh-ZA).
- ESLint plugin `i18next/no-literal-string` warns on hardcoded JSX strings.

### Testing
- Jest with `ts-jest` preset. Config in `jest.config.js`, setup in `jest.setup.js`.
- Test roots: `lib/`, `services/`, `tests/`.
- Module alias `@/` maps to project root (same as in app code).
- React Native is mocked via `__mocks__/react-native.js`.
- Tests use `tsconfig.test.json`.

## Critical Conventions

### Database Operations
- **NEVER** use `supabase start` or local Docker.
- **NEVER** execute SQL directly in Supabase Dashboard.
- **ALWAYS** use `supabase migration new` → `npm run lint:sql` → `supabase db push` → `supabase db diff`.

### User Data
- **ALWAYS** use `profiles` table (NOT deprecated `users` table).
- Foreign keys reference `profiles.id` which equals `auth.uid()`.

### Path Aliases
- `@/` maps to project root in both app code (babel `module-resolver`) and tests (jest `moduleNameMapper`).

### EAS Project Switching
Multiple EAS project IDs are managed via `scripts/eas-projects.js` and `EAS_PROJECT_ID` env var. The `app.config.js` dynamically resolves owner/slug/projectId. Use `npm run eas:project:list` / `npm run eas:project:current` to inspect.

### Shell Commands
- **NEVER** use heredoc syntax (`<<EOF`) — it doesn't work reliably in this environment.
- Use `echo` with newlines, `printf`, or write to files directly instead.

### postinstall
- `patch-package` runs on install, applying patches from `/patches/`. If `npm install` fails, check that patches still apply.

### Expo Web Stubs
If you see module resolution errors when running Expo web, check `metro.config.js` for stub mappings in `lib/stubs/`.

### Typecheck Heap Size
`npm run typecheck` already sets `NODE_OPTIONS=--max-old-space-size=8192`. Running bare `npx tsc --noEmit` without this will OOM.

### Console Logs in Production
`babel-plugin-transform-remove-console` strips all `console.*` calls (except `console.error`) in production builds. No need to manually guard with `__DEV__`.

### AdMob
Test IDs are enforced in development. Production ad unit IDs come from environment variables.

### Promise.any Polyfill
A polyfill in `polyfills/promise-shim.js` runs before all app code via Metro's `getModulesRunBeforeMainModule`. This is required because Daily.co SDK captures `Promise` at module init time.

### Environment
- `.env` at root (gitignored, copy from `.env.example`). Supabase anon key and URL are also committed in `eas.json` (anon role only, public).
- URL helpers read:
  - `EXPO_PUBLIC_APP_WEB_URL` (primary EduDash web base URL)
  - `EXPO_PUBLIC_WEB_URL` (fallback EduDash web base URL)
  - `EXPO_PUBLIC_SOA_WEB_URL` (Soil of Africa web base URL)
- Firebase native config files must stay untracked:
  - `google-services.json`
  - `app/google-services.json`
  - `GoogleService-Info.plist`
  - `ios/GoogleService-Info.plist`
- For EAS builds, provide file secrets/env paths:
  - `GOOGLE_SERVICES_JSON` (Android)
  - `GOOGLE_SERVICE_INFO_PLIST` (iOS)
- Auth session stored under key `edudash-auth-session`.
- Backend is cloud-hosted Supabase (project ID: `lvvvjywrmpcqrpvuptdi`). No local database.

### Secrets & Rotation Rules
- Never commit secrets, tokens, private keys, service-role keys, or credential files to git (including docs/reports artifacts).
- `.env`, `.env.local`, `.env.production`, `.env.eas`, and all `*.local` env files must remain gitignored.
- Keep server-only secrets out of `EXPO_PUBLIC_*` vars. Use server-only names (example: `SERVER_SUPABASE_SERVICE_ROLE_KEY`).
- Supabase Edge secrets must not use names starting with `SUPABASE_` for custom values (reserved prefix). Use custom prefixes like `SERVER_` or domain-specific names.
- After JWT/API key rotation, update all runtime surfaces in one pass:
  - Local env files used by developers.
  - EAS envs (`development`, `preview`, `production`).
  - Supabase secrets for functions.
  - Hosting/runtime secret stores (if any).
- VAPID rotation requires syncing both public and private keys everywhere and forcing/retrying web push re-subscription for existing browser subscriptions.
- After any secret rotation:
  - Re-run auth and push notification smoke tests.
  - Run `npm run verify:prod`.
  - Publish OTA only for JS/env-consumed fixes; rebuild app if native config/binaries changed.
- If a secret was exposed publicly, treat it as compromised immediately: rotate first, then clean git history/repositories.

### Production Readiness
- **Single session (one device):** On sign-in, the app revokes all other sessions so only the current device stays logged in. Set `EXPO_PUBLIC_SINGLE_SESSION_ENABLED=false` to allow multiple devices per account.
- **Subscription test mode:** `EXPO_PUBLIC_SUBSCRIPTION_TEST_MODE=true` enables a 24-hour trial reset (SubscriptionContext). Disable or leave unset for production so tiers are not auto-reset.
- **Payment tier sync:** After PayFast success, `app/screens/payments/return.tsx` polls `payment_transactions` and then calls `refreshProfile()` and `refreshSubscription()`. The server (PayFast webhook or checkout completion) must update `profiles.subscription_tier` or the subscriptions table so the app sees the new tier on refresh.
- **Stubs (web):** RevenueCat, AdMob, biometrics, etc. are stubbed in `lib/stubs/` for Expo web builds. Do not rely on native-only purchase or ad behavior on web.

## Cursor Cloud specific instructions

### Node.js version
The project requires Node.js 20 (per `.nvmrc` and `package.json` engines). The update script handles `nvm use 20` automatically. Always prefix shell commands with `source ~/.nvm/nvm.sh && nvm use 20 > /dev/null 2>&1 &&` if running outside the update script context.

### Running the web app (primary dev target for cloud agents)
- `npm run web:dev` starts the Expo web build on port **8082** via Metro + react-native-web.
- First bundle takes ~30-60s. Subsequent hot-reloads are fast.
- The landing page is a public marketing page; sign-in is at `/sign-in`.
- Authentication requires a valid Supabase account (test credentials must be provided via secrets).

### Environment variables
- Secrets are injected as environment variables. The update script generates `.env` from `.env.example`, substituting any matching env vars.
- The minimum required secrets for the app to start: `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

### Quality gates (see Essential Commands above for full list)
- `npm run lint` first runs `validate:progress-bars` and `check:expo-filesystem` before ESLint. The progress-bar validator may fail on pre-existing issues unrelated to your changes.
- `npm run typecheck` uses 8GB heap (`NODE_OPTIONS=--max-old-space-size=8192`). Never run bare `tsc --noEmit` without this flag.
- `npm test` runs Jest. Some tests may fail due to env-specific URL mismatches (e.g., `EXPO_PUBLIC_APP_WEB_URL` affecting redirect URL assertions).

### Known pre-existing issues
- 2 TypeScript errors in `contexts/theme/nextGenVariant.ts` (unknown properties in theme variant).
- Progress-bar validation warnings in `npm run lint` (pre-existing, not blocking).
