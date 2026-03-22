# EduDash Pro — Master Plan

> **Single source of truth.** All prior plans, roadmaps, and TODOs are consolidated here.
> Generated 18 March 2026 from a full codebase audit. **Re-verified 18 March 2026** — corrections applied (see Confidence Ratings section at end).
> **Updated 18 March 2026** — Membership module (46 screens, 66 components, 17 hooks, ~129 files, ~26K LOC) extracted to PulseBoard project.
> **Updated 19 March 2026** — JS-only fixes sprint completed & OTA deployed (versionCode 47, update group `d225db7b`).
> **Updated 20 March 2026** — Engineering Super Prompt audit completed. P0 security, P1 bugs, P2 tech debt resolved (3 commits: `fefdaca3`, `0c21c4a3`, `83f6623c`).
> Metrics: 260+ .md files, 123 TODO/FIXME items, ~299 screens, 71 Edge Functions, 106 npm scripts.

---

## Current State Snapshot

| Metric                | Value                                                          |
| --------------------- | -------------------------------------------------------------- |
| **Version**           | 1.0.33                                                         |
| **versionCode**       | 47                                                             |
| **Next build target** | **versionCode 48**                                             |
| **Expo SDK**          | 54                                                             |
| **React Native**      | 0.81.1                                                         |
| **TypeScript**        | 5.9.2                                                          |
| **Screens**           | ~299 (was 345 — 46 membership screens extracted to PulseBoard) |
| **Edge Functions**    | 71                                                             |
| **SQL Migrations**    | 359                                                            |
| **Languages**         | 9 (en, af, zu, st, nso, fr, pt, es, de)                        |
| **Maturity**          | Late Alpha / Early Beta                                        |

---

## v48 Release Plan

### P0 — SECURITY (must ship before v48 build)

| #   | Item                                    | File                                                                  | Action                                                                                                                                        |
| --- | --------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Payment debug logging in production** | `supabase/functions/payments-create-checkout/index.ts:361`            | ✅ FIXED — Removed TEMP DEBUG signature dump + 3 other payment logs across 3 EFs; redacted error objects to log only error.code               |
| 2   | **WhatsApp security stubs**             | `lib/services/WhatsAppSecurityAlert.ts`, `WhatsAppBusinessService.ts` | ✅ FIXED — Deleted dead stubs (zero imports); feature flags now env-configurable (default off); server-side `whatsapp-send` EF already exists |

### P1 — CRITICAL BUGS & DATA INTEGRITY (v48 blockers)

| #   | Item                                                    | File                                                     | Action                                                                                                                                                                                  |
| --- | ------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3   | **CEO Dashboard shows Math.random() data**              | Extracted to PulseBoard                                  | ✅ RESOLVED — entire membership module moved to `/home/edp/Desktop/PulseBoard/`                                                                                                         |
| 4   | **OrgAdmin metrics hardcoded to 0**                     | `hooks/useOrgAdminMetrics.ts:98,122-126`                 | ✅ FIXED — Now queries real data (enrollments, student_progress, subscriptions+plans). 4 metrics (certPipeline, cohorts, certifications, placements) remain 0 pending DB table creation |
| 5   | **`.vercelignore` blocks `components/reports/`**        | `.vercelignore:82`                                       | ✅ FIXED — changed `reports/` to `/reports/`                                                                                                                                            |
| 6   | **DesktopLayout shows "My School" for platform admins** | `components/layout/DesktopLayout.tsx:168`                | ✅ FIXED — now shows "EduDash Pro" for platform staff                                                                                                                                   |
| 7   | **K12 student screens are empty shells**                | `app/(k12)/student/messages,schedule,classes,grades.tsx` | ✅ FIXED — 4 new hooks (`useStudentClasses`, `useStudentGrades`, `useStudentSchedule`, `useStudentMessages`) wired to real Supabase data                                                |

### P2 — TECH DEBT REDUCTION (ship with v48)

| #   | Item                               | Count           | Action                                                                                                                                                                      |
| --- | ---------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8   | **DI migration leftovers**         | 13 services     | ✅ PARTIAL — 8/13 singleton blocks removed (zero imports). 5 remaining need caller migration (LessonsService, EventBus, DashWhatsApp, MemoryService, DashRealTimeAwareness) |
| 9   | **Deprecated voice providers**     | 3 files         | ✅ PARTIAL — 2/3 deleted (openaiWhisperProvider, openaiWhisperStreamingProvider). claudeProvider kept (3 active web importers)                                              |
| 10  | **Empty shared component barrels** | 8 files         | ✅ FIXED — 5/8 deleted (ui, media, forms, feedback, audio). 2 kept (celebrations, messaging have real exports). Root barrel updated                                         |
| 11  | **Static runtimeVersion 1.0.23**   | `app.config.js` | ✅ FIXED — Switched to `{ "policy": "fingerprint" }` (Expo SDK 54 best practice). Next native build required for OTA targeting                                              |

### P3 — FEATURE COMPLETENESS (ship with v48 if time allows)

| #   | Item                                 | Status          | Action                                                                              |
| --- | ------------------------------------ | --------------- | ----------------------------------------------------------------------------------- |
| 12  | **Admin data-export screen**         | Shell only      | `app/screens/admin/data-export.tsx:155` — implement actual export via Edge Function |
| 13  | **SyncEngine (offline)**             | Stub            | `lib/sync/SyncEngine.ts` — decide: implement basic offline queue or remove stub     |
| 14  | **AdMob integration**                | Commented out   | `lib/adMob.ts` — implement or defer to v49                                          |
| 15  | **WebSocket AI streaming on mobile** | Not implemented | `features/dash-ai/DashAIClientImpl.ts:1145` — Phase 2 TODO                          |

---

## Completed Sprints

### JS-Only Fixes Sprint (19 March 2026) — OTA deployed, versionCode 47

**Commit**: `cb6fd40d` → branch `development` → OTA update group `d225db7b-f387-4409-9d31-df8182af95df`

| Change                                                 | Files                                                                                                                                                                       | Status       |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Wire 4 K-12 student stub screens to real Supabase data | `app/(k12)/student/{classes,grades,schedule,messages}.tsx` + 4 new hooks in `hooks/k12/`                                                                                    | ✅ Deployed  |
| Fix PostHog `getFeatureFlags()` returning empty object | `lib/featureFlags.ts` — now calls `posthog.getFeatureFlags()` with `Boolean()` coercion                                                                                     | ✅ Deployed  |
| Replace AI progress analysis mock data                 | `app/screens/ai-progress-analysis.tsx` — real queries for `student_enrollments`, `homework_submissions`, `homework_assignments`                                             | ✅ Deployed  |
| Enable Dash Orb voice on web                           | `features/dash-orb/DashOrbImpl.tsx` — removed `Platform.OS !== 'web'` guards for TTS/STT                                                                                    | ✅ Deployed  |
| Fix WebRTC capability detection on web                 | `lib/voice/capabilities.ts` — `hasWebRTC` now checks `navigator.mediaDevices` instead of returning `false`                                                                  | ✅ Deployed  |
| Support assistant teachers seeing their classes        | `hooks/k12/useTeacherGameControl.ts`, `hooks/useTeacherStudents.ts`, `lib/dashboard/fetchTeacherDashboard.ts` — dual-source lookup (`class_teachers` + legacy `teacher_id`) | ✅ Deployed  |
| Disabled-Features-Audit                                | `docs/Disabled-Features-Audit.md` — comprehensive catalog of 15 commented-out features, 26 stubs, 52 disabled flags, 12 native deps                                         | ✅ Committed |

**Deferred items** (require DB migrations or native changes — targeting v48 build):

- `from('users')` in `teacherDataService.ts` → needs FK migration from `users` to `profiles`
- Admin data-export → needs new Edge Function
- WhatsApp phone persistence → WhatsApp integration is emergency-killed
- `student_id` FK assumption → existing hooks use `auth.uid()` as `student_id`, but FKs point to `students.id` table. Same pattern as pre-existing K-12 hooks. Needs DB-level review.

---

## WARP.md Compliance Targets

Current violations vs targets:

| Category                       | Current (verified) | v48 Target | v50 Target |
| ------------------------------ | ------------------ | ---------- | ---------- |
| `Alert.alert` calls            | **430**            | 300 (-130) | **0**      |
| `console.log` in prod          | **1,337**          | 900 (-437) | **0**      |
| FlatList (should be FlashList) | **59 files**       | 40 (-19)   | **0**      |
| Hooks > 200 lines              | **113**            | 80 (-33)   | < 20       |
| Components > 400 lines         | **146**            | 110 (-36)  | < 30       |
| Screens > 500 lines            | **115**            | 80 (-35)   | < 30       |
| Services > 500 lines           | **47**             | 35 (-12)   | < 10       |

### Top oversized files to split for v48:

| File                                              | Lines (verified)              | Target | Notes                                   |
| ------------------------------------------------- | ----------------------------- | ------ | --------------------------------------- |
| `features/dash-orb/DashOrbImpl.tsx`               | **2,670**                     | ≤500   | Worst offender — 6.7x limit             |
| `features/dash-assistant/useDashAssistantImpl.ts` | **682** (was 2,407 pre-split) | ≤200   | 27 useState — still 3.4x limit          |
| `components/calls/WhatsAppStyleVideoCall.tsx`     | **1,303** (was 2,226)         | ≤400   | Reduced 41%, still 3.3x limit           |
| `app/screens/finance-control-center.tsx`          | **1,187** (was 1,559)         | ≤500   | Reduced 24%, still 2.4x limit           |
| `services/FinancialDataService.ts`                | **196** (was 2,273)           | ≤500   | ✅ Now compliant — massively refactored |

---

## Feature Flags to Evaluate for v48

There are **24** flags set to `enabled: false` in `config/featureFlags.ts` (plus a separate PostHog-based flag system in `lib/featureFlags.ts` with ~80+ flags). Decide: enable, defer, or remove.

### Ready to enable (overdue or nearly complete):

| Flag                        | Owner | Expected Stable          | Decision Needed           |
| --------------------------- | ----- | ------------------------ | ------------------------- |
| `REVENUECAT_PAYMENTS`       | Dev 8 | 2026-03-01 (**overdue**) | Enable or extend deadline |
| `SELF_SERVICE_SUBSCRIPTION` | Dev 8 | TBD                      | Depends on RevenueCat     |
| `PAYMENT_RETRY`             | Dev 8 | TBD                      | Depends on RevenueCat     |

### Defer to v49+:

| Flag                     | Reason                            |
| ------------------------ | --------------------------------- |
| `AI_VOICE_V2`            | Needs noise cancellation pipeline |
| `AI_MEMORY_PERSISTENCE`  | Needs long-term memory schema     |
| `AI_ROBOTICS_CURRICULUM` | Phase 4 — not urgent              |
| `GROUP_CHAT`             | Needs new Realtime channels + UI  |
| `TYPING_INDICATORS`      | Depends on group chat             |
| `READ_RECEIPTS`          | Depends on messaging refactor     |
| `WEB_DASHBOARD_V2`       | Major web redesign                |
| `WEB_PWA_OFFLINE`        | Needs SyncEngine                  |

### Remove (dead code):

| Flag                     | Reason                                             |
| ------------------------ | -------------------------------------------------- |
| `stripe_billing_enabled` | Not using Stripe — PayFast is the payment provider |
| `real_time_whiteboard`   | No implementation exists                           |

---

## Roadmap (Post-v48)

### Phase 1 — Core Enhancements (Sprints 13-14, Q2 2026)

| Feature                          | Priority | Source Doc                       |
| -------------------------------- | -------- | -------------------------------- |
| Learner dashboard (real data)    | HIGH     | `LEARNER_DASHBOARD_PLAN.md`      |
| Group chat                       | MEDIUM   | Feature flags                    |
| Translation completion (9 langs) | MEDIUM   | `i18n-sweep-report.md`           |
| Daily activity feed (parents)    | MEDIUM   | Feature flags                    |
| Progressive difficulty in tutor  | MEDIUM   | `dash-ai-enhancement-roadmap.md` |

### Phase 2 — Communication (Sprints 15-16, Q2-Q3 2026)

| Feature                                 | Priority | Source Doc                             |
| --------------------------------------- | -------- | -------------------------------------- |
| Phone verification (Twilio)             | HIGH     | `ROAD-MAP.md` Phase 2                  |
| WhatsApp API migration                  | HIGH     | `ROAD-MAP.md` Phase 2                  |
| Enhanced notifications                  | MEDIUM   | Feature flags                          |
| Teachers Hub (subscription marketplace) | MEDIUM   | `MASTER_ENGINEERING_PLAN.md` Sprint 15 |

### Phase 3 — Advanced Features (Q3-Q4 2026)

| Feature                                 | Priority | Source Doc                                                                                                       |
| --------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| Dash Studio (form builder + automation) | HIGH     | `dash-studio.md`, `form-builder.md` — partial implementation exists at `app/screens/dash-studio.tsx` (563 lines) |
| Teacher payroll system                  | HIGH     | `PAYROLL_SYSTEM_DESIGN.md`                                                                                       |
| RevenueCat in-app purchases             | HIGH     | Feature flags                                                                                                    |
| Interactive whiteboard                  | MEDIUM   | `ROAD-MAP.md` Phase 3                                                                                            |
| Module locking (tier-gated)             | MEDIUM   | `ROAD-MAP.md` Phase 3                                                                                            |
| CI/CD pipeline (GitHub Actions)         | MEDIUM   | `ROAD-MAP.md` Phase 3                                                                                            |

### Phase 4 — STEM & Robotics (Q4 2026+)

| Feature                     | Source Doc                              |
| --------------------------- | --------------------------------------- |
| AI robotics tutor           | `ROAD-MAP.md` Phase 4                   |
| Robotics challenge system   | `validate-robotics-challenge` EF exists |
| STEM dashboard enhancements | `PRESCHOOL_STEM_ENHANCEMENTS.md`        |

### Phase 5 — Enterprise (2027)

| Feature                | Source Doc                               |
| ---------------------- | ---------------------------------------- |
| Multi-school districts | `ROAD-MAP.md` Phase 5                    |
| Public API             | `ROAD-MAP.md` Phase 5                    |
| White-label support    | `ROAD-MAP.md` Phase 5                    |
| DBE compliance service | `dbe-compliance-service-edudash.plan.md` |

---

## Ecosystem Projects

| Project                      | Repo                | Supabase                        | Status                                                                                                                                               |
| ---------------------------- | ------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **EduDash Pro (Mobile+Web)** | `/dashpro`          | `lvvvjywrmpcqrpvuptdi`          | PRIMARY — active dev                                                                                                                                 |
| **PulseBoard**               | `/PulseBoard`       | TBD (shares EduDash DB for now) | NEW — extracted membership/org module (46 screens, 66 components, 17 hooks). For businesses, NPOs, and membership organizations. Not yet standalone. |
| **Marketing Website**        | `/web`              | Read-only                       | Active — Vercel auto-deploy                                                                                                                          |
| **EduSitePro (Edusite)**     | `/Edusite`          | `bppuzibjlxgfwrujzfsz`          | Active — school registration portal                                                                                                                  |
| **Young Eagles**             | `/YoungEagles`      | `bppuzibjlxgfwrujzfsz` (shared) | Active — standalone school app                                                                                                                       |
| **BKK Innovation Hub**       | `/bkkinnovationhub` | Separate                        | Separate project                                                                                                                                     |

### Cross-Project Issues

| Issue                                                          | Status                                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------- |
| EduSitePro + Young Eagles share same Supabase DB               | Known — `SINGLE_DATABASE_DISCOVERY.md`                     |
| API key rotation broke both Edusite + YoungEagles registration | ✅ FIXED — updated Vercel env vars + removed hardcoded key |
| Sync between Edusite registrations and EduDash Pro             | 3 Edge Functions exist (`sync-*`), needs verification      |

---

## File Cleanup (Stale .md files to archive)

**71 stale .md files identified across all repos.** Key candidates for deletion or archival:

### dashpro (move to `docs/root-archive/`):

- `docs/features/CRITICAL_FIXES_JAN7_2026.md` (completed)
- `docs/features/ACTION_ITEMS_SUMMARY.md` (completed)
- `docs/features/QUICK_ACTIONS_NEEDED.md` (completed)
- `docs/EXPO_AV_MIGRATION_STATUS.md` (completed)
- `docs/features/EXPO_AUDIO_MIGRATION.md` (completed)
- `docs/AFTERCARE_PROMO_IMPLEMENTATION.md` (expired campaign)
- All session logs in `docs/` (11 files)
- `docs/FixMe.md` (superseded by this Master Plan)

### web (most are stale):

- All 30+ fix docs in `docs/fixes/`
- All session summaries in `docs/sessions/`
- Root-level status .md files (7 files)

### Edusite (most are stale):

- 40+ root-level .md files that are one-time setup/status docs

---

## Canonical Reference Documents (DO NOT DELETE)

These are the source-of-truth files for the project:

| File                                                | Purpose                                        |
| --------------------------------------------------- | ---------------------------------------------- |
| `edudashpro_playbook.md`                            | Full architecture & engineering playbook       |
| `WARP.md`                                           | Non-negotiable coding standards                |
| `AGENTS.md`                                         | AI agent instructions                          |
| `.github/copilot-instructions.md`                   | Copilot context                                |
| `docs/Master-Plan.md`                               | **THIS FILE** — consolidated plan              |
| `docs/MASTER_ENGINEERING_PLAN.md`                   | Sprint-level engineering tracker               |
| `docs/root-archive/plans/ROAD-MAP.md`               | Product roadmap (6 phases: 1, 1.5, 2, 3, 4, 5) |
| `docs/database/domain-map.md`                       | Database domain map (280+ tables)              |
| `docs/features/dash-ai-enhancement-roadmap.md`      | AI feature roadmap                             |
| `docs/CODEBASE_AUDIT_2026.md`                       | Full codebase maturity assessment              |
| `config/featureFlags.ts`                            | Feature flag registry                          |
| `~/Desktop/EduDashPro_Pricing_Plan_Consolidated.md` | Pricing spec                                   |

---

## v48 Build Checklist

```
Pre-build:
[x] P0 security items resolved (payment debug logging, WhatsApp stubs) (20 March 2026)
[x] P1 critical bugs fixed (OrgAdmin metrics wired to real data) (20 March 2026)
[x] K12 student screens wired to real data (Sprint: 19 March 2026)
[x] PostHog feature flags fixed (Sprint: 19 March 2026)
[x] AI progress analysis using real data (Sprint: 19 March 2026)
[x] Assistant teacher class visibility fixed (Sprint: 19 March 2026)
[x] Web voice enabled (Dash Orb + WebRTC detection) (Sprint: 19 March 2026)
[ ] npm run verify:prod passes (lint + typecheck + test + audits)
[x] P2 tech debt reduced: 8 DI singletons, 2 voice stubs, 5 barrels, runtimeVersion (20 March 2026)
[x] .vercelignore /reports/ fix committed and pushed
[x] DesktopLayout platform admin branding committed and pushed
[x] Disabled-Features-Audit.md completed (Sprint: 19 March 2026)

Build (native changes — version 48):
[ ] Native dependency updates / fixes from Disabled-Features-Audit.md
[ ] npm run build:playstore (auto-bumps to versionCode 48)
[ ] Test APK on physical device
[ ] Verify registration flow on edusitepro.edudashpro.org.za
[ ] Verify Young Eagles registration after key rotation fix

Post-build:
[ ] Upload AAB to Play Store
[ ] OTA for JS-only fixes if needed: npm run ota:release8:safe
[ ] Update this Master Plan with completion status
```

---

---

## Verification Confidence Ratings (18 March 2026)

Re-verified by deploying 4 parallel agents against the actual codebase. Each section rated 1-10.

### P0/P1 Claims — Confidence: **10/10**

| Claim                                   | Verdict      | Notes                                |
| --------------------------------------- | ------------ | ------------------------------------ |
| Payment TEMP DEBUG logging at L361      | ✅ CONFIRMED | Exact line, exact content            |
| WhatsApp stubs blocking all messaging   | ✅ CONFIRMED | Both files return `{success: false}` |
| CEO Dashboard Math.random() at L162-163 | ✅ CONFIRMED | Exact lines, exact code              |
| OrgAdmin metrics hardcoded to 0         | ✅ CONFIRMED | 5 metrics hardcoded zero             |
| K12 student screens empty shells        | ✅ CONFIRMED | All 4 render `items={[]}`            |
| Admin data-export is a shell            | ✅ CONFIRMED | Calls `simulateExport()`             |
| SyncEngine is a stub                    | ✅ CONFIRMED | No-op class                          |
| AdMob SDK commented out                 | ✅ CONFIRMED | Entire import block commented        |

### Tech Debt Counts — Confidence: **7/10** (5 corrections made)

| Metric                 | Original Claim | Actual    | Delta                                 |
| ---------------------- | -------------- | --------- | ------------------------------------- |
| Alert.alert calls      | 710            | **430**   | ❌ Was 65% overcounted                |
| console.log in prod    | 1,364          | **1,337** | ✅ ~2% off — close enough             |
| FlatList files         | 72             | **59**    | ⚠️ 18% off                            |
| Hooks > 200 lines      | 30+            | **113**   | ❌ Massively undercounted (3.8x more) |
| Components > 400 lines | 30+            | **146**   | ❌ Massively undercounted (4.9x more) |
| Screens > 500 lines    | 30+            | **115**   | ❌ Massively undercounted (3.8x more) |
| Services > 500 lines   | 20+            | **47**    | ❌ Undercounted (2.4x more)           |
| DI migration TODOs     | 13             | **13**    | ✅ Exact match                        |

**Note:** The "30+" figures were placeholder minimums from the original audit. The WARP.md compliance debt is **far worse** than originally stated. Targets updated accordingly.

### Top Oversized Files — Confidence: **9/10** (4 corrections made)

| File                       | Original Claim            | Actual Now                  | Status                                                                                                                 |
| -------------------------- | ------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| DashOrbImpl.tsx            | 2,670                     | **2,670**                   | ✅ Exact match — still the worst                                                                                       |
| useDashAssistant           | 2,407 lines / 34 useState | **682 lines / 27 useState** | ❌ Was refactored into `useDashAssistantImpl.ts` + `hooks/dash-ai/` subfolder (13 files)                               |
| WhatsAppStyleVideoCall.tsx | 2,226                     | **1,303**                   | ⚠️ Reduced 41% since audit                                                                                             |
| FinancialDataService.ts    | 2,273                     | **196**                     | ❌ Massively refactored — now compliant. Path also wrong: `services/FinancialDataService.ts` not `services/financial/` |
| finance-control-center.tsx | 1,559                     | **1,187**                   | ⚠️ Reduced 24% since audit                                                                                             |

### Feature Flags & Versions — Confidence: **9/10** (2 minor corrections)

| Claim                                                     | Verdict                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Version 1.0.33 / vCode 47 / runtime 1.0.23 / SDK ~54.0.33 | ✅ All 4 exact                                                         |
| React 19.1.0 / RN 0.81.1 / TS ~5.9.2                      | ✅ All 3 exact                                                         |
| All dependency versions                                   | ✅ All 4 exact                                                         |
| 9 supported languages                                     | ✅ Exact                                                               |
| 22 disabled feature flags                                 | ⚠️ Actually **24** disabled flags                                      |
| REVENUECAT_PAYMENTS overdue                               | ✅ 17 days overdue                                                     |
| stripe_billing_enabled exists                             | ✅ Confirmed — dead code                                               |
| 13 DI migration services                                  | ✅ Exact                                                               |
| Empty shared barrels (5)                                  | ⚠️ Actually **8** barrels (3 uncounted: celebrations, messaging, root) |
| 3 deprecated voice providers                              | ✅ All confirmed with deprecation comments                             |

### Reference Documents — Confidence: **9/10** (1 correction)

| Claim                                                 | Verdict                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| ROAD-MAP.md has 5 phases                              | ⚠️ Actually **6** (includes Phase 1.5)                             |
| MASTER_ENGINEERING_PLAN.md sprint tracking            | ✅ Sprint 3+ confirmed                                             |
| CODEBASE_AUDIT_2026.md says "Late Alpha / Early Beta" | ✅ Exact match                                                     |
| edudashpro_playbook.md updated Mar 2026               | ⚠️ File says "14 Mar 2026" but **not tracked by git** — local only |
| Pricing plan exists at ~/Desktop/                     | ✅ Confirmed — 15KB detailed doc                                   |
| Payroll = design only, not built                      | ✅ Zero payroll screens                                            |
| Dash Studio = design only                             | ❌ `app/screens/dash-studio.tsx` exists (563 lines) — partial impl |
| Ecosystem shared DB (bppuzibjlxgfwrujzfsz)            | ✅ Confirmed — YoungEagles + Edusite                               |
| 95+ npm scripts                                       | ✅ Actually **106**                                                |
| 345 screens / 71 Edge Functions / 359 migrations      | ✅ All within ±1%                                                  |

### Overall Confidence Summary

| Section                  | Confidence | Errors Found                                                                  |
| ------------------------ | ---------- | ----------------------------------------------------------------------------- |
| P0/P1 security + bugs    | **10/10**  | 0 — all exact                                                                 |
| Tech debt counts         | **7/10**   | 5 wrong (Alert.alert overcounted; all WARP violations massively undercounted) |
| Top oversized files      | **6/10**   | 4 of 5 were stale (files were refactored since original audit)                |
| Feature flags & versions | **9/10**   | 2 minor (24 not 22 flags; 8 not 5 barrels)                                    |
| Roadmap & reference docs | **9/10**   | 1 wrong (Dash Studio partially built), 1 minor (6 not 5 phases)               |
| **Weighted Average**     | **8.2/10** | **12 corrections applied to this document**                                   |

---

_This plan supersedes all prior planning documents. Future work references this file._
