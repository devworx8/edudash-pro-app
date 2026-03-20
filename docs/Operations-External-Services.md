# EduDash Pro — External Services & Operations Monitoring Guide

> **For operations staff.** This document lists every external service the platform depends on, what breaks if it goes down, and how to check its status.
>
> Last updated: 19 March 2026 | Covers: EduDash Pro (mobile+web), Marketing Site, BKK Innovation Hub

---

## Quick Reference — Service Status Pages

| Service         | Status Page                        | Dashboard                           |
| --------------- | ---------------------------------- | ----------------------------------- |
| Supabase        | https://status.supabase.com        | https://supabase.com/dashboard      |
| Expo / EAS      | https://status.expo.dev            | https://expo.dev                    |
| Vercel          | https://www.vercel-status.com      | https://vercel.com/dashboard        |
| Anthropic       | https://status.anthropic.com       | https://console.anthropic.com       |
| OpenAI          | https://status.openai.com          | https://platform.openai.com         |
| Azure           | https://status.azure.com           | https://portal.azure.com            |
| Daily.co        | https://www.dailystatus.com        | https://dashboard.daily.co          |
| PayFast         | https://status.payfast.co.za       | https://merchant.payfast.co.za      |
| Resend          | https://resend-status.com          | https://resend.com/overview         |
| PostHog         | https://status.posthog.com         | https://us.posthog.com              |
| Sentry          | https://status.sentry.io           | https://sentry.io                   |
| Firebase / FCM  | https://status.firebase.google.com | https://console.firebase.google.com |
| Google Cloud    | https://status.cloud.google.com    | https://console.cloud.google.com    |
| Brave Search    | —                                  | https://api.search.brave.com        |
| Picovoice       | —                                  | https://console.picovoice.ai        |
| RevenueCat      | https://status.revenuecat.com      | https://app.revenuecat.com          |
| Meta (Facebook) | https://metastatus.com             | https://business.facebook.com       |

---

## TIER 1 — CRITICAL (App stops working)

These services must be operational for the platform to function. If any goes down, users are immediately affected.

---

### 1. Supabase (Backend — Database, Auth, Storage, Edge Functions, Realtime)

| Field               | Detail                                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What it does**    | EVERYTHING — PostgreSQL database, user authentication, file storage, 70+ Edge Functions (serverless APIs), Realtime WebSocket channels for video call signaling |
| **Project ID**      | `lvvvjywrmpcqrpvuptdi`                                                                                                                                          |
| **If it goes down** | **Entire platform is offline** — no logins, no data, no API calls, no file access, no push notifications dispatch, no payments processing                       |
| **What to check**   | Supabase Dashboard → Health tab; check Edge Function invocation logs for errors; check Database → Logs for slow queries                                         |
| **Storage buckets** | `tts-audio` (voice cache), `dash-generated-images` (AI images), `birthday-memories`, plus document/avatar/attachment buckets                                    |
| **Env vars**        | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`                                                                        |
| **Used by**         | All projects (EduDash Pro, Marketing Site, BKK Innovation Hub)                                                                                                  |

**Monitoring checklist:**

- [ ] Database connections not maxed out (check Supabase Dashboard → Database → Connections)
- [ ] Edge Function error rate < 5% (Dashboard → Edge Functions → Logs)
- [ ] Storage usage within plan limits
- [ ] Realtime connections stable (for video call signaling)
- [ ] Auth service responding (sign-in/sign-up working)

---

### 2. Anthropic (Primary AI Provider)

| Field               | Detail                                                                                                                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What it does**    | Powers ALL AI features — Dash AI conversations, lesson generation, homework generation, exam generation, grading, answer explanations, weekly progress reports, social content generation, platform error monitoring |
| **Models in use**   | `claude-sonnet-4-20250514` (primary), `claude-3-5-haiku-20241022` (fast/cheap), `claude-3-5-sonnet-20241022`, `claude-3-opus-20240229`                                                                               |
| **API endpoint**    | `https://api.anthropic.com/v1/messages`                                                                                                                                                                              |
| **If it goes down** | All AI features stop — Dash AI chat returns errors, no lesson/exam generation, no grading assistance, social content cron fails, weekly reports fail                                                                 |
| **What to check**   | Anthropic Console → Usage; check for 429 (rate limit) or 529 (overload) errors in Edge Function logs; check monthly spend vs budget                                                                                  |
| **Env vars**        | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`                                                                                                                                                                               |
| **Rate limits**     | Tier-based; watch for 429 errors in `ai-proxy` function logs                                                                                                                                                         |

**Monitoring checklist:**

- [ ] API key valid and not expired
- [ ] Monthly usage within budget (check Anthropic Console → Billing)
- [ ] No sustained 429/529 errors in `ai-proxy` Edge Function logs
- [ ] Response latency < 10s for chat, < 30s for generation tasks

---

### 3. PayFast (Payment Gateway)

| Field               | Detail                                                                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What it does**    | Processes all subscription payments for South African users. Handles payment creation + ITN (Instant Transaction Notification) webhook for payment confirmations                          |
| **Endpoints**       | `https://www.payfast.co.za/eng/process` (production), `https://sandbox.payfast.co.za/eng/process` (sandbox)                                                                               |
| **If it goes down** | Users cannot subscribe or upgrade plans; revenue collection stops; existing subscriptions continue until renewal                                                                          |
| **What to check**   | PayFast Merchant Dashboard → transaction history; check `payfast-webhook` Edge Function logs for failed ITN callbacks; verify `payment_transactions` table in Supabase for recent entries |
| **Env vars**        | `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`, `PAYFAST_SANDBOX`                                                                                                    |

**Monitoring checklist:**

- [ ] Daily transaction volume matches expected patterns
- [ ] ITN webhook receiving callbacks (check `payfast-webhook` function invocations)
- [ ] No failed payment records piling up in `payment_transactions` table
- [ ] Passphrase hasn't been rotated without updating Edge Function secrets

---

### 4. Expo / EAS (Mobile App Distribution + OTA Updates)

| Field               | Detail                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **What it does**    | Builds mobile app (APK/AAB), distributes OTA (over-the-air) JavaScript updates, serves the Expo push notification API |
| **Push endpoint**   | `https://exp.host/--/api/v2/push/send`                                                                                |
| **If it goes down** | No OTA updates can be published; push notifications stop for all mobile users; new builds cannot be created           |
| **What to check**   | Expo Dashboard → Updates (check latest OTA is serving); EAS Build history for recent build failures                   |
| **Env vars**        | `EAS_PROJECT_ID` (`accd5738-9ee6-434c-a3be-668d9674f541`)                                                             |

**Monitoring checklist:**

- [ ] Latest OTA update serving correctly on `production` branch
- [ ] Push notification delivery rate healthy (check notification dispatch logs)
- [ ] No build queue backlog on EAS

---

### 5. Daily.co (Video & Voice Calls)

| Field                    | Detail                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **What it does**         | WebRTC infrastructure for 1:1 and group video/voice calls between users (teachers, parents, principals)              |
| **API endpoint**         | `https://api.daily.co/v1`                                                                                            |
| **If it goes down**      | All video and voice calls fail — users cannot call each other                                                        |
| **What to check**        | Daily Dashboard → Rooms; check `daily-rooms` and `daily-token` Edge Function logs; verify room creation success rate |
| **Room duration limits** | Free=15min, Starter=30min, Basic/Premium/Pro=60min, Enterprise=24hrs                                                 |
| **Env vars**             | `DAILY_API_KEY`                                                                                                      |

**Monitoring checklist:**

- [ ] API key valid (test with `curl -H "Authorization: Bearer $KEY" https://api.daily.co/v1/rooms`)
- [ ] Room creation not failing (check `daily-rooms` Edge Function logs)
- [ ] Call concurrent usage within plan limits

---

### 6. Resend (Transactional Email)

| Field               | Detail                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **What it does**    | Sends ALL transactional emails — teacher account invitations, payment receipts, aftercare confirmations, progress reports, admin notifications |
| **API endpoint**    | `https://api.resend.com/emails`                                                                                                                |
| **From address**    | `noreply@edudashpro.org.za`                                                                                                                    |
| **If it goes down** | No emails delivered — new teacher invitations fail, payment receipts not sent, parent notifications missing                                    |
| **What to check**   | Resend Dashboard → Emails tab; check delivery rate and bounce rate; check `send-email` Edge Function logs                                      |
| **Env vars**        | `RESEND_API_KEY`, `FROM_EMAIL`                                                                                                                 |
| **Also used by**    | Marketing site (early access notifications), BKK Innovation Hub (candidate notifications)                                                      |

**Monitoring checklist:**

- [ ] Email delivery rate > 95%
- [ ] Bounce rate < 5%
- [ ] Domain `edudashpro.org.za` DNS records (SPF, DKIM, DMARC) still valid
- [ ] Monthly email volume within Resend plan limits

---

### 7. Firebase Cloud Messaging (FCM)

| Field               | Detail                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **What it does**    | Sends high-priority data-only push messages to Android devices to wake them for incoming video/voice calls (when app is killed/background) |
| **API endpoint**    | `https://fcm.googleapis.com/v1/projects/{projectId}/messages:send`                                                                         |
| **If it goes down** | Android users won't receive incoming call notifications when app is closed — calls appear as "missed"                                      |
| **What to check**   | Firebase Console → Cloud Messaging; check `send-fcm-call` Edge Function logs for auth failures                                             |
| **Env vars**        | `GOOGLE_SERVICE_ACCOUNT_KEY`, `FIREBASE_PROJECT_ID`                                                                                        |

**Monitoring checklist:**

- [ ] Service account key valid and not expired
- [ ] FCM quota not exceeded
- [ ] `send-fcm-call` Edge Function success rate > 90%

---

## TIER 2 — IMPORTANT (Feature degradation)

If these go down, specific features stop working, but the core app remains functional.

---

### 8. OpenAI (AI Fallback + Voice Transcription)

| Field               | Detail                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **What it does**    | Whisper STT (speech-to-text for voice input), GPT-4o chat fallback when Anthropic is down, DALL-E image generation, real-time voice conversation |
| **Models**          | `gpt-4o`, `gpt-4o-mini`, `whisper-1`, `gpt-4o-realtime-preview`                                                                                  |
| **Endpoints**       | `https://api.openai.com/v1/chat/completions`, `https://api.openai.com/v1/audio/transcriptions`, `wss://api.openai.com/v1/realtime`               |
| **If it goes down** | Voice-to-text input fails; AI chat fallback unavailable; image generation with DALL-E fails; real-time voice conversations fail                  |
| **Env vars**        | `OPENAI_API_KEY`                                                                                                                                 |

**Monitoring checklist:**

- [ ] API key valid with sufficient credits
- [ ] `transcribe-audio` Edge Function success rate > 90%
- [ ] Monthly spend within budget

---

### 9. Azure Cognitive Services (Text-to-Speech)

| Field                  | Detail                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **What it does**       | Neural text-to-speech — Dash AI reads responses aloud using lifelike voices, pronunciation assessment for learners |
| **Region**             | `southafricanorth` (primary)                                                                                       |
| **Default voice**      | `en-US-AndrewMultilingualNeural`                                                                                   |
| **Supported SA langs** | en-ZA, af-ZA, zu-ZA, xh-ZA                                                                                         |
| **If it goes down**    | TTS (read-aloud) stops working; pronunciation features fail; voice falls back to device TTS (lower quality)        |
| **Env vars**           | `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`                                                                          |

**Monitoring checklist:**

- [ ] Speech key valid (check Azure Portal → Cognitive Services)
- [ ] `tts-proxy` and `azure-speech-token` Edge Functions responding
- [ ] Free tier quota not exhausted (5M chars/month on F0)

---

### 10. PostHog (Analytics + Feature Flags)

| Field               | Detail                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **What it does**    | Product analytics (user events, session recording), feature flags (controls which features are enabled for which users) |
| **Host**            | `https://us.i.posthog.com`                                                                                              |
| **If it goes down** | Analytics stop collecting; feature flags fall back to local defaults (no remote overrides); A/B tests stop              |
| **Env vars**        | `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST`                                                                   |

**Monitoring checklist:**

- [ ] Event ingestion pipeline healthy (PostHog Dashboard → Data Management)
- [ ] Feature flags loading correctly (check `lib/featureFlags.ts` fallback behavior)

---

### 11. Sentry (Error Tracking)

| Field               | Detail                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------- |
| **What it does**    | Captures JavaScript errors, native crashes, and performance metrics from the mobile app |
| **If it goes down** | Errors go undetected — no crash reports, no performance data, no alerting               |
| **Env vars**        | `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_ENABLE_SENTRY`                                   |

**Monitoring checklist:**

- [ ] Recent events appearing in Sentry Dashboard
- [ ] Error rate not spiking (indicates a bad release)
- [ ] DSN still valid

---

### 12. Google AdMob (Ads — Revenue)

| Field               | Detail                                                                                |
| ------------------- | ------------------------------------------------------------------------------------- |
| **What it does**    | Displays banner, interstitial, rewarded, and native ads to free-tier users on Android |
| **If it goes down** | Ad revenue stops; users see blank ad spaces; not a user-facing error                  |
| **Env vars**        | `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID`, plus per-format ad unit IDs (8 total)             |

**Monitoring checklist:**

- [ ] Ad fill rate healthy in AdMob dashboard
- [ ] Test IDs not accidentally deployed to production
- [ ] Revenue tracking normal

---

### 13. Facebook Graph API (Social Publishing)

| Field               | Detail                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **What it does**    | Auto-publishes social media content for schools — connects Facebook pages, posts AI-generated content on schedule |
| **API version**     | `v20.0`                                                                                                           |
| **If it goes down** | Social media auto-publishing stops; schools' Facebook pages not updated automatically                             |
| **Env vars**        | `FACEBOOK_GRAPH_VERSION`, `SOCIAL_TOKEN_ENCRYPTION_KEY`                                                           |

**Monitoring checklist:**

- [ ] Page tokens still valid (they expire — check `social_connections` table for `token_expires_at`)
- [ ] `social-agent-daily-cron` and `social-publisher-cron` Edge Functions running successfully
- [ ] No "token expired" errors in Edge Function logs

---

## TIER 3 — OPTIONAL / FALLBACK (Graceful degradation)

These enhance the platform but have fallbacks or are not user-facing.

---

### 14. Brave Search API

| **What**           | Web search for Dash AI's `web_search` tool                       |
| ------------------ | ---------------------------------------------------------------- |
| **Fallback chain** | Brave → Bing → Google Custom Search → DuckDuckGo (no key needed) |
| **Env vars**       | `BRAVE_SEARCH_API_KEY`                                           |

### 15. Bing Web Search API

| **What**     | Fallback #1 for web search |
| ------------ | -------------------------- |
| **Env vars** | `BING_SEARCH_API_KEY`      |

### 16. Google Custom Search API

| **What**     | Fallback #2 for web search               |
| ------------ | ---------------------------------------- |
| **Env vars** | `GOOGLE_SEARCH_API_KEY`, `GOOGLE_CSE_ID` |

### 17. DuckDuckGo Instant Answer API

| **What**     | Last-resort web search fallback (no API key needed) |
| ------------ | --------------------------------------------------- |
| **Env vars** | None                                                |

### 18. Google Imagen (Vertex AI)

| **What**         | AI image generation fallback if DALL-E unavailable       |
| ---------------- | -------------------------------------------------------- |
| **Env vars**     | `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_CLOUD_PROJECT_ID` |
| **Feature flag** | `ENABLE_IMAGE_PROVIDER_FALLBACK`                         |

### 19. Deepgram

| **What**     | Streaming STT fallback |
| ------------ | ---------------------- |
| **Env vars** | `DEEPGRAM_API_KEY`     |

### 20. Picovoice Porcupine

| **What**     | Wake word detection ("Hey Dash") — native only |
| ------------ | ---------------------------------------------- |
| **Env vars** | `EXPO_PUBLIC_PICOVOICE_ACCESS_KEY`             |

### 21. WhatsApp Business API (Meta)

| **What**     | WhatsApp message delivery for notifications      |
| ------------ | ------------------------------------------------ |
| **Status**   | Emergency-disabled (security stubs in place)     |
| **Env vars** | `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` |

### 22. Google Calendar API

| **What**     | Calendar sync for school events/reminders                                               |
| ------------ | --------------------------------------------------------------------------------------- |
| **Env vars** | `EXPO_PUBLIC_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_WEBHOOK_TOKEN` |

### 23. Discord / Slack Webhooks

| **What**     | Build notifications (dev team only)        |
| ------------ | ------------------------------------------ |
| **Env vars** | `DISCORD_WEBHOOK_URL`, `SLACK_WEBHOOK_URL` |

---

## DISABLED / PLANNED (Not currently active)

| Service        | Purpose                        | Status                  | Env vars                                              |
| -------------- | ------------------------------ | ----------------------- | ----------------------------------------------------- |
| **RevenueCat** | In-app purchases (iOS/Android) | Feature-flagged `false` | `EXPO_PUBLIC_REVENUECAT_ANDROID_SDK_KEY`              |
| **PayPal**     | International payment gateway  | Not implemented         | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`            |
| **Twilio**     | SMS phone verification         | Disabled                | `EXPO_PUBLIC_TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` |

---

## HOSTING & DEPLOYMENT

| Service               | Purpose                                                     | Domain(s)                                            |
| --------------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| **Vercel**            | Marketing site + web portal hosting                         | `edudashpro.org.za`, `app.edudashpro.org.za`         |
| **Supabase**          | Backend hosting (PostgreSQL, Edge Functions, Storage, Auth) | `lvvvjywrmpcqrpvuptdi.supabase.co`                   |
| **EAS / Expo**        | Mobile app builds + OTA updates                             | Expo project: `accd5738-9ee6-434c-a3be-668d9674f541` |
| **Google Play Store** | Android app distribution                                    | Published app listing                                |
| **GitHub**            | Source code hosting                                         | `devworx8/edudash-pro-app` (private)                 |

---

## DOMAIN & DNS

| Domain                         | Purpose                                 | Hosting                        |
| ------------------------------ | --------------------------------------- | ------------------------------ |
| `edudashpro.org.za`            | Marketing website                       | Vercel                         |
| `app.edudashpro.org.za`        | Web application                         | Vercel                         |
| `edusitepro.edudashpro.org.za` | School registration portal (EduSitePro) | Vercel                         |
| `noreply@edudashpro.org.za`    | Transactional email sender              | Resend (DNS: SPF, DKIM, DMARC) |

**DNS health checks:**

- [ ] SPF record valid for `edudashpro.org.za`
- [ ] DKIM record valid (Resend signing)
- [ ] DMARC policy active
- [ ] SSL certificates auto-renewing (Vercel manages these)

---

## CROSS-PROJECT SERVICES

| Service              | EduDash Pro | Marketing Site |     BKK Innovation Hub      |
| -------------------- | :---------: | :------------: | :-------------------------: |
| Supabase             |  ✅ (full)  | ✅ (read-only) | ✅ (full, separate project) |
| Resend               |     ✅      | ✅ (optional)  |             ✅              |
| Vercel               |  ✅ (web)   |       ✅       |             ✅              |
| Anthropic            |     ✅      |       —        |              —              |
| OpenAI               |     ✅      |       —        |              —              |
| Azure Speech         |     ✅      |       —        |              —              |
| PayFast              |     ✅      |       —        |              —              |
| Daily.co             |     ✅      |       —        |              —              |
| FCM                  |     ✅      |       —        |              —              |
| PostHog              |     ✅      |       —        |              —              |
| Sentry               |     ✅      |       —        |              —              |
| AdMob                |     ✅      |       —        |              —              |
| Facebook             |     ✅      |       —        |              —              |
| Cloudflare Turnstile |      —      |       —        |        ✅ (optional)        |

---

## COMPLETE ENV VAR INVENTORY

### Supabase Edge Function Secrets (set via `supabase secrets set`)

| Variable                      | Service                             | Required |
| ----------------------------- | ----------------------------------- | -------- |
| `ANTHROPIC_API_KEY`           | Anthropic Claude                    | Yes      |
| `OPENAI_API_KEY`              | OpenAI                              | Yes      |
| `AZURE_SPEECH_KEY`            | Azure Cognitive Services            | Yes      |
| `AZURE_SPEECH_REGION`         | Azure (default: `southafricanorth`) | Yes      |
| `DAILY_API_KEY`               | Daily.co                            | Yes      |
| `RESEND_API_KEY`              | Resend email                        | Yes      |
| `FROM_EMAIL`                  | Resend sender address               | Yes      |
| `PAYFAST_MERCHANT_ID`         | PayFast                             | Yes      |
| `PAYFAST_MERCHANT_KEY`        | PayFast                             | Yes      |
| `PAYFAST_PASSPHRASE`          | PayFast                             | Yes      |
| `PAYFAST_SANDBOX`             | PayFast mode flag                   | Yes      |
| `GOOGLE_SERVICE_ACCOUNT_KEY`  | Google (FCM, Imagen, Calendar)      | Yes      |
| `FIREBASE_PROJECT_ID`         | Firebase / FCM                      | Yes      |
| `BRAVE_SEARCH_API_KEY`        | Brave Search                        | Optional |
| `BING_SEARCH_API_KEY`         | Bing Search                         | Optional |
| `GOOGLE_SEARCH_API_KEY`       | Google Custom Search                | Optional |
| `GOOGLE_CSE_ID`               | Google Custom Search                | Optional |
| `GOOGLE_CLOUD_PROJECT_ID`     | Google Imagen                       | Optional |
| `DEEPGRAM_API_KEY`            | Deepgram STT                        | Optional |
| `WHATSAPP_API_TOKEN`          | WhatsApp Business                   | Disabled |
| `WHATSAPP_PHONE_NUMBER_ID`    | WhatsApp Business                   | Disabled |
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | Facebook social publishing          | Optional |
| `FACEBOOK_GRAPH_VERSION`      | Facebook API                        | Optional |
| `DASH_SUPABASE_ACCESS_TOKEN`  | Supabase Management API             | Optional |
| `DASH_SUPABASE_PROJECT_REF`   | Supabase project ref                | Optional |
| `DISCORD_WEBHOOK_URL`         | Discord notifications               | Optional |
| `SLACK_WEBHOOK_URL`           | Slack notifications                 | Optional |
| `EAS_WEBHOOK_SECRET`          | Expo build webhooks                 | Optional |

### Mobile App Env Vars (`.env` / EAS environment)

| Variable                                 | Service                    | Required |
| ---------------------------------------- | -------------------------- | -------- |
| `EXPO_PUBLIC_SUPABASE_URL`               | Supabase                   | Yes      |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY`          | Supabase                   | Yes      |
| `EXPO_PUBLIC_POSTHOG_KEY`                | PostHog                    | Yes      |
| `EXPO_PUBLIC_POSTHOG_HOST`               | PostHog                    | Yes      |
| `EXPO_PUBLIC_SENTRY_DSN`                 | Sentry                     | Yes      |
| `EXPO_PUBLIC_ENABLE_SENTRY`              | Sentry toggle              | Yes      |
| `EXPO_PUBLIC_PICOVOICE_ACCESS_KEY`       | Picovoice Porcupine        | Optional |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_SDK_KEY` | RevenueCat                 | Disabled |
| `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID`       | Google AdMob               | Yes      |
| `EXPO_PUBLIC_ADMOB_ADUNIT_*`             | AdMob ad unit IDs (8 vars) | Yes      |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID`           | Google Calendar            | Optional |
| `EXPO_PUBLIC_ENABLE_ANALYTICS`           | PostHog analytics toggle   | Yes      |
| `EXPO_PUBLIC_ENABLE_POSTHOG`             | PostHog toggle             | Yes      |
| `EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS`  | Push toggle                | Yes      |
| `EXPO_PUBLIC_APP_WEB_URL`                | Web app URL                | Yes      |
| `EXPO_PUBLIC_WEB_URL`                    | Web URL fallback           | Yes      |
| `EXPO_PUBLIC_SOA_WEB_URL`                | Soil of Africa URL         | Optional |

---

## MONTHLY COST CENTERS TO MONITOR

| Service      | Billing Model                          | Where to Check                 |
| ------------ | -------------------------------------- | ------------------------------ |
| Supabase     | Plan-based (Pro/Team) + usage overages | Supabase Dashboard → Billing   |
| Anthropic    | Per-token (input/output)               | Anthropic Console → Billing    |
| OpenAI       | Per-token + per-minute (Whisper)       | OpenAI Platform → Usage        |
| Azure Speech | Per-character (TTS), per-hour (STT)    | Azure Portal → Cost Management |
| Daily.co     | Per-participant-minute                 | Daily Dashboard → Usage        |
| Resend       | Per-email (free tier: 3000/month)      | Resend Dashboard → Overview    |
| Vercel       | Plan-based + bandwidth overages        | Vercel Dashboard → Usage       |
| EAS / Expo   | Build minutes + update bandwidth       | Expo Dashboard → Usage         |
| Google AdMob | Revenue (pays you, not costs you)      | AdMob Dashboard → Payments     |
| PostHog      | Per-event (free tier: 1M events/month) | PostHog → Billing              |
| Sentry       | Per-event + per-transaction            | Sentry → Subscription          |
| Brave Search | Per-query                              | —                              |
| FCM          | Free (within limits)                   | Firebase Console → Usage       |

---

## INCIDENT RESPONSE QUICK GUIDE

### If the app is completely down:

1. Check **Supabase** status first — most likely cause
2. Check **Vercel** if web is down but mobile works
3. Check **Expo** if OTA updates aren't loading

### If AI features are broken:

1. Check **Anthropic** status and API key validity
2. Check `ai-proxy` Edge Function logs in Supabase
3. Check OpenAI as fallback if Anthropic is down

### If payments are failing:

1. Check **PayFast** merchant dashboard
2. Check `payfast-webhook` Edge Function logs
3. Verify `PAYFAST_PASSPHRASE` hasn't been rotated

### If emails aren't being sent:

1. Check **Resend** dashboard for delivery failures
2. Check DNS records (SPF/DKIM) for `edudashpro.org.za`
3. Check `send-email` Edge Function logs

### If calls aren't working:

1. Check **Daily.co** dashboard
2. Check `daily-rooms` + `daily-token` Edge Function logs
3. Check **FCM** (`send-fcm-call`) if Android wake-up calls fail

### If push notifications aren't arriving:

1. Check **Expo Push** service status
2. Check `notifications-dispatcher` Edge Function logs
3. For Android call wakeup: check **FCM** separately

---

_This document should be reviewed and updated whenever a new external service is added or an existing one is deprecated._
