# EduDash Pro — Disabled Features & Native Changes Audit

> Generated during JS-only fixes sprint. Captures every commented-out feature,
> stub implementation, disabled flag, and native-only dependency in the codebase.

---

## JS-Only Fixes Applied This Sprint

| # | File(s) | Change | OTA? |
|---|---------|--------|------|
| 1 | `app/(k12)/student/classes.tsx` | Wired to `useStudentClasses` — fetches `student_enrollments` + `classes` | ✅ |
| 2 | `app/(k12)/student/grades.tsx` | Wired to `useStudentGrades` — aggregates `homework_submissions` by subject | ✅ |
| 3 | `app/(k12)/student/schedule.tsx` | Wired to `useStudentSchedule` — shows daily timetable from enrolled classes | ✅ |
| 4 | `app/(k12)/student/messages.tsx` | Wired to `useStudentMessages` — fetches `announcements` for student's org | ✅ |
| 5 | `lib/featureFlags.ts:296` | PostHog `getFeatureFlags()` now returns real flags instead of `{}` | ✅ |
| 6 | `app/screens/ai-progress-analysis.tsx` | Replaced mock "Sample Student" data with real Supabase queries | ✅ |

New hooks created: `hooks/k12/useStudentClasses.ts`, `useStudentGrades.ts`, `useStudentSchedule.ts`, `useStudentMessages.ts`

> **Caveat**: All K-12 student hooks (including pre-existing `useK12StudentDashboard` and `useStudentAssignments`) assume `auth.uid() == students.id`. If K-12 students are created with a different ID scheme, these queries would return empty results. This is an existing systemic assumption, not introduced by these changes.

---

## Commented-Out Features (15 instances, 12 files)

| File | Line | What's Disabled | Fix Type |
|------|------|-----------------|----------|
| `app/screens/admin/data-export.tsx` | 13, 22, 190 | `router`, `assertSupabase` imports + real Edge Function call — entire export simulated with `setTimeout` | OTA + Edge Function needed |
| `app/screens/admin/school-settings.tsx` | 19 | `useThemedStyles` import | OTA (minor) |
| `app/screens/ai-homework-helper.tsx` | 6 | `assertSupabase` import | OTA |
| `components/ai/AllocationManagementScreen.tsx` | 29, 43, 76, 78 | Animated import + `bulkAllocateQuotas` / `isBulkAllocating` — bulk allocation UI incomplete | OTA |
| `components/pricing/PricingComparisonTable.tsx` | 5, 173 | i18n (`useTranslation`) usage | OTA |
| `components/whatsapp/WhatsAppProfileGuard.tsx` | 102 | `profileService.updatePhone()` — phone update never persists | OTA (blocked by WhatsApp kill switch) |
| `components/whatsapp/WhatsAppIntegrationDemo.tsx` | 412 | `router.push('/profile')` navigation | OTA |
| `lib/rbac/types.ts` | 5 | JSON import | OTA (minor) |
| `lib/dashboard/optimisticUpdates.ts` | 74 | `queryClient.invalidateQueries()` — intentional design choice | N/A (optional) |
| `services/AttachmentService.ts` | 11 | `expo-media-library` import — cannot save photos to gallery | **Native rebuild** |
| `services/dash-ai/DashVoiceService.ts` | 191–206 | `prepareToRecordAsync`, `startAsync` — recording API deprecated | OTA |
| `services/DashWebSearchService.ts` | 437 | `await assertSupabase()` | OTA |

---

## Stub / Mock Implementations (26 instances)

### Critical (user-facing, returning fake data)

| File | Description | Fix Type |
|------|-------------|----------|
| `app/screens/admin/data-export.tsx:155` | **Entire export is simulated** — `simulateExport()` = `setTimeout(2000)` | OTA + Edge Function |
| `app/screens/whatsapp-setup.tsx:65` | **WhatsApp verification faked** — accepts any 6-digit code | OTA + Edge Function |
| `app/admin-dashboard.tsx:163` | Admin refresh = `setTimeout(1500)` with fake activity data | OTA |
| `components/auth/EnhancedSignIn.tsx:365` | Social login shows "not implemented in this demo" | OTA |
| `services/SemanticMemoryEngine.ts:457` | `generateEmbedding()` returns **fake hash-based vectors** | OTA + Edge Function |
| `services/LessonsService.ts:654` | `getLessonAnalytics()` returns **all zeros** | OTA + DB query |
| `services/DashCAPSKnowledge.ts:348` | `getPastExamQuestions()` returns `[]` | OTA + DB/content |
| `services/EASService.ts:198` | Returns mock build data on API failure | OTA |

### Moderate (internal, partial functionality)

| File | Description | Fix Type |
|------|-------------|----------|
| `hooks/useOrgAdminMetrics.ts:98` | `completed`, `totalCohorts`, `totalCertifications`, `totalPlacements` hardcoded to 0 | OTA + DB |
| `hooks/useRegionalDashboard.ts:269` | Revenue and ID cards not fetched | OTA + DB |
| `hooks/platform-monitoring/usePlatformErrors.ts:145` | `avg_resolution_time_hours: null` never computed | OTA + DB |
| `lib/voice-pipeline.ts:482` | `queueOfflineAudio()` logs and does nothing | OTA |
| `lib/voice-pipeline.ts:491` | `getAudioDuration()` always returns 0 | OTA |
| `lib/services/ComplianceService.ts:309` | Teacher vetting + learner support queries not implemented | OTA + DB |
| `lib/audio/soundManager.ts:32` | Sound files are placeholders | OTA (assets) |
| `services/DashPDFGenerator.ts:770` | AI compose/template render not called, page count hardcoded to 1 | OTA + Edge Function |
| `services/SMSService.ts:554` | SMS inbox integration not implemented | OTA + DB |
| `services/DashAgenticEngine.ts:492` | Autonomy level hardcoded to `'assistant'` | OTA + DB |
| `services/dash-ai/tools/LearningProgressTool.ts:225` | Falls back to simulated progress data | OTA + DB |
| `components/dashboard/cards/CertificationsCard.tsx:10` | TODO: Replace with real data | OTA + DB |
| `components/dashboard/cards/FixturesCard.tsx:9` | TODO: Replace with real data | OTA + DB |
| `components/messaging/GifSearchPanel.tsx:162` | "Full GIF search coming soon" without API key | OTA (needs API key) |
| `components/updates/PlayStoreUpdateChecker.tsx:139` | iOS App Store check returns null | OTA |

### Security lockdowns (intentionally disabled)

| File | Description |
|------|-------------|
| `lib/services/WhatsAppBusinessService.ts` | **Entire service stubbed** — all methods return `success: false` |
| `lib/services/WhatsAppSecurityAlert.ts` | Duplicate security stub |
| `lib/calls/callkeep-manager.ts` | All CallKeep methods are no-ops (Expo SDK 54+ incompatible) |

---

## Disabled Feature Flags

### Hardcoded `false` in `lib/featureFlags.ts` (12 flags)

| Flag | Category |
|------|----------|
| `principal_meeting_rooms` | Collaboration |
| `real_time_whiteboard` | Collaboration |
| `meeting_recordings` | Collaboration |
| `advanced_school_metrics` | Analytics |
| `teacher_performance_analytics` | Analytics |
| `stripe_billing_enabled` | Billing |
| `seat_management_enabled` | Billing |
| `enterprise_trials` | Billing |
| **`whatsapp_integration`** | **EMERGENCY KILL — credentials exposed** |
| **`whatsapp_opt_in`** | **EMERGENCY KILL** |
| **`whatsapp_webhook`** | **EMERGENCY KILL** |
| **`whatsapp_send_receive`** | **EMERGENCY KILL** |

### Opt-in only in `lib/featureFlags.ts` (16 flags, off by default)

`ai_gateway_enabled`, `enterprise_tier_enabled`, `principal_hub_enabled`, `homework_v2_enabled`, `resource_portal_enabled`, `advanced_grading_enabled`, `contact_sales_enabled`, `ENABLE_IMAGE_PROVIDER_FALLBACK`, `dash_tutor_sessions_v1`, `dash_tutor_voice_sticky_v1`, `auto_handoff_v1`, `phonics_strict_v1`, `dash_chart_safe_mode_v1`, `learner_inactivity_automation_v1`, `learner_duplicate_queue_v1`, `ebooks_enabled`, `principal_signup_enabled`, `teacher_signup_enabled`, `parent_claim_child_enabled`

### Compile-time disabled in `config/featureFlags.ts` (24 flags)

`PARENT_PUSH_PREFERENCES`, `AI_VOICE_V2`, `AI_MEMORY_PERSISTENCE`, `AI_ROBOTICS_CURRICULUM`, `AI_WAKE_WORD_V2`, `ENABLE_IMAGE_PROVIDER_FALLBACK`, `GROUP_CHAT`, `TYPING_INDICATORS`, `READ_RECEIPTS`, `VOICE_MESSAGES_V2`, `REVENUECAT_PAYMENTS`, `SELF_SERVICE_SUBSCRIPTION`, `PAYMENT_RETRY`, `MEMBER_ID_CARDS`, `WING_FINANCIALS`, `BULK_TEACHER_IMPORT`, `SCHOOL_ANALYTICS_V2`, `AI_LESSON_SUGGESTIONS`, `WEB_DASHBOARD_V2`, `WEB_PWA_OFFLINE`, `WEB_EXAM_PREP`, `PHONE_VERIFICATION`, `BIOMETRIC_V2`, `SESSION_PERSISTENCE`

### Disabled AI Tools

| Tool | Reason |
|------|--------|
| `generate_worksheet` | Gated — complex structured content |
| `generate_chart` | Gated — complex structured content |

---

## Native-Only Dependencies (Require Native Rebuild)

| Package | Status | Impact |
|---------|--------|--------|
| `react-native-callkeep` | **Removed** (SDK 54+ incompatible) | `lib/calls/callkeep-manager.ts` — all no-ops |
| `@picovoice/porcupine-react-native` | Optional, graceful fallback | Wake word detection off without `PICOVOICE_ACCESS_KEY` |
| `react-native-purchases` (RevenueCat) | Code exists, flag disabled | `lib/revenuecat/config.ts` — full config; `REVENUECAT_PAYMENTS: false` |
| `expo-media-library` | Import commented out | `services/AttachmentService.ts:11` — can't save to gallery |
| `expo-local-authentication` | Works native, stubbed web | Biometrics on mobile only |
| `react-native-google-mobile-ads` | Dynamic require, works Android | `lib/adMob.ts` — **currently functional** |
| `sentry-expo` | Stubbed on web | Native crash reporting works |
| `@daily-co/react-native-daily-js` | Active, works | Video calls functional |
| `react-native-incall-manager` | Active | Audio routing for calls |
| `react-native-pip-android` | Active | Picture-in-picture on Android |
| `react-native-background-timer` | Active | Background timers |
| `@react-native-firebase/app+messaging` | Active | Push notifications |

### Web Stubs (20 files in `lib/stubs/`)

All native modules stubbed for `react-native-web` builds: AdMob, BackHandler, biometrics, DeviceEventEmitter, HMRClient, NativeEventEmitter, Platform, RevenueCat, Sentry, etc.

---

## Deprecated Code (Should Be Removed)

| File | Note |
|------|------|
| `lib/voice/openaiWhisperProvider.ts` | DEPRECATED — expo-audio SDK 53+ incompatible |
| `lib/voice/openaiWhisperStreamingProvider.ts` | DEPRECATED — same |
| `lib/voice/claudeProvider.ts` | DEPRECATED on mobile — use Azure Speech SDK |
| `lib/voice/hooks.ts:153` | `useVoiceRecording` → use `useVoiceController` |
| `lib/debug.ts` | DEPRECATED — use `@/lib/logger` |
| `hooks/useNotificationCount.ts` | DEPRECATED — re-exports from NotificationContext |
| `lib/tenant/compat.ts:204` | Legacy school-based API |
| 13 service files | Legacy singletons with `// TODO: Remove once all call sites migrated to DI` |

---

## NOT JS-Only Fixable (Requires DB Migration or External Service)

| Item | Reason |
|------|--------|
| `lib/services/teacherDataService.ts:36` — `from('users')` | FK `homework_assignments_teacher_id_fkey` → `users` table. Need migration to repoint to `profiles`. |
| `app/screens/admin/data-export.tsx` — simulated export | No `export-data` Edge Function exists. Must create it. |
| `app/screens/whatsapp-setup.tsx` — fake verification | WhatsApp integration killed (credential exposure). Server-side rotation needed first. |
| `services/SemanticMemoryEngine.ts` — fake embeddings | Needs embedding model API call (Edge Function). |
| `app/onboarding/guardian.tsx` — invite not sent | Needs notification Edge Function. |

---

## Quick Wins (Zero-Code OTA via Environment Variables)

These flags default to `false` but toggle on by setting `EXPO_PUBLIC_*=true`:

| Flag | Effect |
|------|--------|
| `EXPO_PUBLIC_EBOOKS_ENABLED=true` | Enables eBook reader |
| `EXPO_PUBLIC_PRINCIPAL_SIGNUP_ENABLED=true` | Opens principal self-signup |
| `EXPO_PUBLIC_TEACHER_SIGNUP_ENABLED=true` | Opens teacher self-signup |
| `EXPO_PUBLIC_PARENT_CLAIM_CHILD_ENABLED=true` | Parent claim-child flow |
| `EXPO_PUBLIC_PRINCIPAL_HUB_ENABLED=true` | Principal hub feature |
| `EXPO_PUBLIC_HOMEWORK_V2_ENABLED=true` | Homework v2 system |
| `EXPO_PUBLIC_DASH_TUTOR_SESSIONS_V1=true` | Tutor session tracking |
| `EXPO_PUBLIC_ENABLE_IMAGE_PROVIDER_FALLBACK=true` | OpenAI → Imagen fallback |
