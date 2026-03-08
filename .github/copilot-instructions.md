# Copilot Instructions for EduDash Pro

## Project Overview

**EduDash Pro** is a multi-tenant, mobile-first educational platform (preschool/ECD sector, South Africa) with agentic AI, strict RBAC, and 5 user roles.

**Architecture — two codebases, one backend:**

| Layer | Stack | Location |
|-------|-------|----------|
| Mobile | React Native 0.81.1 + Expo 54 + expo-router 6 | `/app`, `/components`, `/hooks`, `/services` |
| Web | Next.js 16 + React 19 + TailwindCSS 4 | `/web/src` |
| Backend | Supabase (PostgreSQL + RLS + Auth + Edge Functions) | `/supabase`, `/migrations` |
| AI | Claude (Anthropic), GPT-4o, Gemini — all via Edge Function proxy | `/supabase/functions/ai-proxy` |
| Payments | PayFast (South Africa) | `/supabase/functions/payfast-webhook` |
| Video | Daily.co WebRTC | `/supabase/functions/daily-token`, `daily-rooms` |
| i18n | 9 languages: en, af, zu, st, nso, fr, pt, es, de | `/locales` |

**Multi-Tenant Model:** Every school is a tenant (`preschool_id` / `organization_id`). All tables enforce RLS. SQL helper `current_user_org_id()` derives tenant from JWT. Super-admins bypass RLS via service role.

## Critical Developer Workflows

```bash
# Mobile development (Android-first)
npm start                         # Expo dev server (localhost for port forwarding)
npm run dev:android               # Start + open Android emulator
npm run start:clear               # Clear cache (fixes most build issues)

# Web development
cd web && npm run dev             # Next.js dev server :3000

# Type checking — MUST use elevated memory, script uses 4096 internally
npm run typecheck                 # Runs: NODE_OPTIONS=--max-old-space-size=4096 tsc --noEmit
npm run typecheck:strict          # Strict config for new code

# Quality gates (run before committing)
npm run lint:fix                  # ESLint with auto-fix
npm run format                    # Prettier
npm run check:console             # No console.log in production
npm run check:file-sizes          # WARP.md compliance

# Database migrations (NEVER use supabase start or local Docker)
supabase migration new <name>     # Create migration
npm run lint:sql                  # SQLFluff lint (REQUIRED)
supabase db push                  # Push to remote (NO --local flag)
supabase db diff                  # Verify no drift

# RBAC validation
npx tsx lib/rbac/validate.ts      # Expected: "All validations passed!"

# Android builds
npm run build:android:apk         # Local APK
npm run build:android:aab         # Production AAB (EAS cloud)
```

## File Size Standards (WARP.md — NON-NEGOTIABLE)

| File type | Max lines | Split strategy |
|-----------|-----------|----------------|
| Components | ≤400 (excl. StyleSheet) | Extract sub-components to `components/<domain>/` |
| Screens | ≤500 (excl. StyleSheet) | Extract hooks + sub-components |
| Hooks | ≤200 | Split into subfolder with barrel `index.ts` |
| Services/Utilities | ≤500 | Split by concern |
| Type definitions | ≤300 (except auto-generated `database.types.ts`) | Split by domain |
| StyleSheet | Extract to `.styles.ts` if >200 lines | `createStyles(theme)` factory pattern |

## Key Architectural Patterns

### 1. Modular Hook Folders (established pattern)
When a hook exceeds 200 lines, decompose into a subfolder with focused files and a barrel `index.ts`:

```
hooks/principal-hub/           # Real example — was 1300 lines
  ├── index.ts                 # Orchestrator (≤200 lines), composes fetch functions
  ├── types.ts                 # Interfaces + constants + helper functions
  ├── fetchPrincipalStats.ts   # One concern per file
  ├── fetchPrincipalTeachers.ts
  ├── fetchPrincipalFinancials.ts
  └── ...
```

Other modular hook folders: `hooks/dash-assistant/`, `hooks/membership/`, `hooks/pop/`, `hooks/parent-messaging/`, `hooks/principal/`. The standalone `hooks/usePrincipalHub.ts` re-exports from the subfolder — consumers are unaffected.

### 2. RBAC System
- **Roles**: `super_admin`, `principal`, `teacher`, `parent`, `student`
- **Permissions matrix**: `lib/rbac/roles-permissions.json`
- **TypeScript helpers**: Import `roleHasPermission` from `@/lib/rbac/types`
- **Enhanced profiles**: `fetchEnhancedUserProfile()` returns `hasRole()`, `hasCapability()` methods
- **Always check permissions** before rendering UI or executing operations

### 3. Agentic AI System

**Golden Rule: NEVER call AI APIs directly from client** — always via `supabase/functions/ai-proxy/` Edge Function.

**Client SDK** (`services/dash-ai/DashAIClient.ts`):
- `callAIService(params)` → routes to streaming or non-streaming
- Streaming: SSE via `fetch` on web, WebSocket on React Native (feature-flagged: `EXPO_PUBLIC_USE_WEBSOCKET_STREAMING`)
- Error mapping: 429 → quota exceeded, 401 → session expired, 503 → service unavailable

**AI Proxy Edge Function** (`supabase/functions/ai-proxy/index.ts`, ~1500 lines):
- **Provider routing**: Default → Anthropic; `prefer_openai: true` → OpenAI; super-admins → always Anthropic with Sonnet 4 access
- **Allowed Anthropic models**: `claude-sonnet-4-20250514`, `claude-3-5-haiku-20241022`, `claude-3-5-sonnet-20241022`, `claude-3-opus-20240229` (+ aliases resolved automatically)
- **Allowed OpenAI models**: `gpt-4o`, `gpt-4o-mini`
- **Service types & max tokens**: `chat_message` (2048), `lesson_generation` (4096), `homework_generation` (4096), `grading` (2048), `exam_generation` (4096), `agent_plan` (1024), `agent_reflection` (256), `image_analysis` (2048)
- **Security**: PII redaction (SA phone, email, ID numbers, card numbers) before provider calls; JWT auth; org membership check
- **Retries**: Automatic on 429/503/529 errors

**Tool Registry** (`services/dash-ai/DashToolRegistry.ts`):
- 9 registered tools: `query_database`, `caps_curriculum_query`, `textbook_content`, `exam_prep_generate`, `student_tutor`, `learning_progress`, `mistake_pattern_detector`, `user_context`, `context_aware_resources`
- `web_search` tool runs server-side only (Brave Search API primary, DuckDuckGo fallback)
- Risk levels: `low | medium | high` (all current tools are `low`)
- Tier hierarchy: `free → starter → basic → premium → pro → enterprise`
- **Tool continuation pattern**: Client sends `enable_tools: true` + tool definitions → Edge Function returns `pending_tool_calls` → client executes via `DashToolRegistry.executeTool()` → results sent back with `enable_tools: false` to prevent infinite loops
- Security: guest block, role verification, tier verification, parameter validation (type, enum, min/max, pattern)

**Agent Orchestrator** (`services/AgentOrchestrator.ts`) — Plan-Act-Reflect loop:
1. **PERCEIVE**: Gather user profile, memories, tool specs, screen context
2. **PLAN+ACT** (loop, max 4 steps / 5 tools / 20s timeout):
   - THINK → `ai-proxy` with `service_type='agent_plan'`, model `claude-3-5-haiku-20241022` (temp 0.3)
   - ACT → Execute returned tool calls via `ToolRegistry.execute()`
   - Publish `TOOL_EXECUTED` via EventBus; break if no tool calls returned
3. **REFLECT**: `service_type='agent_reflection'` for 1-2 sentence self-assessment
4. **STORE**: Save to MemoryService (interaction + pattern memory, importance=5)
- Cancellation via `cancelCurrentRun()` — checks `isRunning` flag each loop iteration
- Singleton via DI container (`TOKENS.agentOrchestrator`)

**Quota System**:
- Tables: `user_ai_tiers` (user→tier mapping), `ai_usage_tiers` (tier limits), `user_ai_usage` (counters), `ai_request_log` (audit trail)
- `check_ai_usage_limit` RPC: returns `{allowed, remaining, limit, current_tier, upgrade_available}`
- Platform schools (Community School, EduDash Pro Main) get unlimited usage
- Free/trial tier: 300 chat messages/month; others scale by `chat_messages_per_day * 30`
- Client-side pre-check: `useDashAI` hook calls `checkAIQuota()` from `@/lib/ai/guards` before each send
- Dev bypass: `AI_QUOTA_BYPASS=true` + `ENVIRONMENT=development|local`
- Usage recorded after every request via `record_ai_usage` RPC (user_id, model, tokens_in/out, scope, org_id)

**AI Hooks** (`hooks/dash-assistant/`):
| Hook | Purpose |
|------|---------|
| `useDashAI` | Client lifecycle, model selection, quota check, `sendMessage()` |
| `useDashConversation` | Conversation state (messages, history) |
| `useDashTutorMode` | Tutor mode: Diagnose → Teach → Practice → Check |
| `useDashVoice` | Voice input/output handling |

### 4. Database Access
- **Mobile**: `assertSupabase()` from `@/lib/supabase` (throws if unavailable)
- **Web**: `createClient()` from `@/lib/supabase/client` (singleton via `@supabase/ssr`)
- **Edge Functions**: New client per request with `SUPABASE_SERVICE_ROLE_KEY`
- **Auto-generated types**: `lib/database.types.ts` (~35k lines, never edit manually)
- **Storage**: Always store paths, never signed URLs (they expire in ~1 hour)

### 5. Supabase Edge Functions
Two patterns coexist (majority uses imported `serve`):
```typescript
// Pattern A (27 functions) — imported serve
import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
serve(async (req) => { ... });

// Pattern B (10 functions) — Deno.serve
Deno.serve(async (req) => { ... });
```

All use: Zod for validation, `_shared/cors.ts` for CORS, Supabase client with service role. 40 Edge Functions total covering AI, payments, notifications, video, sync, and cron jobs.

### 6. Authentication & Context Providers
- **Auth**: `contexts/AuthContext.tsx` → `user`, `session`, `profile`, `permissions`
- **Session**: `lib/sessionManager.ts` handles login/logout/refresh
- **Route guards**: `hooks/useRouteGuard.ts` enforces auth + role restrictions
- **Key contexts**: `ThemeContext`, `SubscriptionContext`, `NotificationContext`, `OrganizationBrandingContext`, `TerminologyContext`, `OnboardingContext`

## Project-Specific Conventions

### Imports
- Use `@/` alias for absolute imports from project root
- Order: React → React Native → third-party → `@/` internal → relative

### Styling
- **Mobile**: `StyleSheet.create()` at bottom of file; extract to `.styles.ts` if >200 lines
- **Web**: TailwindCSS utility classes
- **Theming**: `useTheme()` hook for mobile, Tailwind dark mode for web

### UI Rules
- **NEVER use `Alert.alert`** — use `AlertModal` or `useAlertModal` hook
- **Lists**: Use `@shopify/flash-list` (FlashList) instead of FlatList for 1000+ items
- **Phone numbers (SA)**: Strip non-digits, replace leading `0` with `27` (see `lib/utils/phoneUtils.ts`)

### Shared Utilities (avoid reinventing)
- `lib/utils/feeUtils.ts` — `isUniformLabel()`, fee structure helpers
- `lib/utils/payment-utils.ts` — `formatCurrencyCompact()` (1000→"R1k", 1M→"R1.0M")
- `lib/utils/phoneUtils.ts` — SA phone format, WhatsApp URL generation
- `lib/utils/dateUtils.ts` — Date formatting
- `lib/utils/nameUtils.ts` — Name display helpers
- `lib/logger.ts` — Structured logging (never `console.log` in production)

### Database-First Problem Solving
If code needs a DB column that doesn't exist, **add it via migration** — don't code workarounds with fallback chains like `message.sender_id || message.user_id || message.created_by`.

### Security (non-negotiable)
- Never expose `SUPABASE_SERVICE_ROLE_KEY` client-side
- Never call AI APIs directly from client — always via `ai-proxy` Edge Function
- Always maintain RLS policies for tenant isolation
- Never modify authentication flow without explicit approval

## File Organization

```
app/                              # Expo Router (file-based routing)
  ├── (auth)/                     # Auth screens (sign-in, sign-up, etc.)
  ├── (k12)/, (parent)/, (public)/ # Route groups
  └── screens/                    # ~180 screen files (all roles)
components/<domain>/              # React Native components by domain
  ├── dashboard/, principal/, teacher/, parent/, admin/
  ├── calls/, messaging/, ai/, voice/
  └── ui/                         # Reusable primitives
hooks/                            # Custom hooks (flat + modular subfolders)
services/                         # Business logic + API service layer
lib/                              # Utilities, types, RBAC, AI capabilities
contexts/                         # React context providers
web/src/                          # Separate Next.js codebase
  ├── app/                        # App Router routes
  ├── components/, hooks/, lib/   # Web-specific implementations
  └── lib/supabase/               # client.ts (browser), server.ts (SSR)
supabase/functions/               # 40 Deno Edge Functions
locales/                          # i18n: en, af, zu, st, nso, fr, pt, es, de
migrations/                       # SQL migration files
docs/                             # All documentation (only README/WARP/ROAD-MAP in root)
```

## Integration Points

### Daily.co Video Calls (complete call flow)

**Architecture**: Supabase Realtime (Postgres Changes) for signaling → Daily.co WebRTC SDK for media transport. No custom WebSocket server.

**Database Tables**:
- `active_calls` — call lifecycle state (columns: `call_id`, `caller_id`, `callee_id`, `call_type`, `status`, `meeting_url`, `started_at`, `answered_at`, `ended_at`, `duration_seconds`)
- `call_signals` — backup meeting URL delivery (columns: `call_id`, `from_user_id`, `to_user_id`, `signal_type`, `payload`)

**Outgoing Call Flow**:
1. `CallProvider.startVideoCall(userId, userName)` → sets `outgoingCall` state
2. `WhatsAppStyleVideoCall` mounts → `initializeCall()`:
   - Creates room: `POST /functions/v1/daily-rooms` (tier-based duration limits)
   - Inserts `active_calls` record (status: `'ringing'`)
   - Sends push notification via `notifications-dispatcher`
   - Inserts `call_signals` record (signal_type: `'offer'`, payload: `{meeting_url, call_type, caller_name}`)
   - Gets token: `POST /functions/v1/daily-token` (owner token for caller)
   - Creates Daily object → `daily.join({url, token})`
   - 30-second ring timeout → status `'missed'`

**Incoming Call Detection** (triple redundancy):
1. Supabase Realtime: `incoming-calls-${userId}` channel → INSERT on `active_calls` WHERE callee_id
2. Push Notification: Expo Notifications listener → creates `ActiveCall` from data
3. Call Signals: `call-signals-${userId}` channel → INSERT on `call_signals` WHERE to_user_id

**Answer Flow**: `CallProvider.answerCall()` → cancel notifications → mount `WhatsAppStyleVideoCall` → skip room creation (URL from `active_calls`) → get token → `daily.join()` → callState `'connected'`

**Teardown**: `endCall()` → UPDATE `active_calls` SET status=`'ended'` → `daily.leave()` + `daily.destroy()` → release `AudioModeCoordinator` → `InCallManager.stop()`. Other party detects via Realtime UPDATE.

**Realtime Channels** (3 total):
| Channel | Table | Event | Purpose |
|---------|-------|-------|---------|
| `incoming-calls-${userId}` | `active_calls` | INSERT | New incoming call |
| `incoming-calls-${userId}` | `active_calls` | UPDATE | Call ended/rejected/missed |
| `call-signals-${userId}` | `call_signals` | INSERT | Backup meeting URL delivery |
| `video-status-${callId}` | `active_calls` | UPDATE | Remote hangup detection (in-call) |

**Room Tier Limits** (enforced at creation in `daily-rooms` Edge Function):
| Tier | Max Duration |
|------|-------------|
| `free` | 15 min |
| `starter` | 30 min |
| `basic` / `premium` / `pro` | 60 min |
| `enterprise` | 24 hours |

**Token Properties** (`daily-token` Edge Function): `is_owner` = true for caller + teachers/principals/superadmins; non-owners join muted; 3-hour expiry.

**Audio Management**: `AudioModeCoordinator` (session-based) → `InCallManager` (routing) → `expo-audio` (ringback tone, loops, earpiece). Earpiece enforced during ringing (500ms interval).

**Key Components**:
| Component | Purpose |
|-----------|---------|
| `CallProvider` (~1036 lines) | Context, state machine, Realtime subscriptions, notification handling |
| `WhatsAppStyleVideoCall` (~2133 lines) | Full video UI: draggable local preview, PiP, screen share, recording |
| `WhatsAppStyleIncomingCall` | Incoming overlay (answer/reject), vibration pattern |
| `FloatingCallOverlay` | Minimized call bubble |
| `VoiceCallInterface` | Voice-only call UI |

**Call hooks** (`components/calls/hooks/`): `useCallBackgroundHandler` (foreground service), `useVoiceCallAudio`, `useVoiceCallDaily`, `useVoiceCallState`, `useVoiceCallTimeout`

**CallContext API** (via `useCall()` hook):
```typescript
startVoiceCall(userId, userName?): void;
startVideoCall(userId, userName?): void;
answerCall(): void;
rejectCall(): Promise<void>;
endCall(): Promise<void>;
isCallActive: boolean;
callState: 'idle' | 'connecting' | 'ringing' | 'connected' | 'ended' | 'failed';
incomingCall: ActiveCall | null;
returnToCall(): void;
isUserOnline(userId): boolean;
```

**Feature flags**: Entire call system gated behind `video_calls_enabled` / `voice_calls_enabled`. CallKeep disabled (broken with Expo SDK 54+) — graceful fallback to custom UI.

### Other Integrations

| System | Key files | Notes |
|--------|-----------|-------|
| PayFast | `supabase/functions/payfast-webhook/` | SA payment gateway; tiers: Free, Basic, Pro, Enterprise |
| Push Notifications | `contexts/NotificationContext.tsx`, `lib/NotificationRouter.ts` | Multi-account routing; Expo Notifications (mobile) + Web Push |
| Edusite Sync | `supabase/functions/sync-*` | Bi-directional sync with external platform |
| Sentry | `sentry-expo` (mobile), `@sentry/nextjs` (web) | Error tracking; ErrorBoundary for component-level |

## Testing

```bash
npm test                          # Jest (roots: lib/, services/)
```

- Tests in `tests/unit/`, `tests/integration/`, `tests/sql/`, `tests/voice/`
- Service-level tests: `services/dash-ai/__tests__/`
- Component tests: `jest.config.components.js` (separate config)
- Android-first manual testing approach
- RBAC validation: `npx tsx lib/rbac/validate.ts`

## Scoped Instruction Files

Additional context-specific rules are in `.github/instructions/` — these are auto-applied by file glob:

| File | Applies to | Key rules |
|------|-----------|-----------|
| `react-native.instructions.md` | `components/**` | Component ≤400 lines, Container/Presentational |
| `lib.instructions.md` | `lib/**/*.ts` | Service ≤500, Hook ≤200 lines; RBAC rules |
| `typescript-services.instructions.md` | `services/**/*.ts` | ≤500 lines; storage paths not URLs |
| `web.instructions.md` | `web/**` | Same limits; AI proxy rules |
| `sql.instructions.md` | `**/*.sql` | RLS mandates, snake_case naming |
| `supabase-migrations.instructions.md` | `supabase/migrations/**` | Full migration workflow |
| `documentation.instructions.md` | `**/*.md` | Only README/WARP/ROAD-MAP in root |
| `testing.instructions.md` | `tests/**` | Unit/integration structure |
