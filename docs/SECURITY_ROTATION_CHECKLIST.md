# Security Rotation Checklist

Use this checklist immediately after any credential exposure or leak suspicion.

## 1) Rotate Credentials
- Daily.co:
  - Rotate `DAILY_API_KEY` in Daily dashboard.
  - Update Supabase Edge Function secrets (`daily-token`, `daily-rooms`).
- Supabase (EduDash Pro):
  - Rotate `SUPABASE_SERVICE_ROLE_KEY`.
  - Rotate `SUPABASE_ANON_KEY` only if required by incident scope.
- Supabase (EduSite / linked projects):
  - Rotate `EDUSITE_SUPABASE_SERVICE_ROLE_KEY`.
- Firebase / FCM:
  - Rotate server credentials if exposed (`FIREBASE_PRIVATE_KEY` / service account JSON).
- Web Push:
  - Rotate `VAPID_PRIVATE_KEY` and regenerate public key.

## 2) Update Runtime Secrets
- Supabase Functions secrets:
  - `supabase secrets set DAILY_API_KEY=...`
  - `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...`
  - `supabase secrets set EDUSITE_SUPABASE_SERVICE_ROLE_KEY=...`
- Web runtime env (Vercel/hosting):
  - Update `DAILY_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_PRIVATE_KEY`, `VAPID_PRIVATE_KEY`.
- Mobile build env (EAS):
  - Ensure no private keys are set in `app.json` or `EXPO_PUBLIC_*` private fields.

## 3) Invalidate Old Sessions/Tokens
- Revoke affected API keys where provider supports revocation.
- Force logout high-risk users if auth scope included leaked secrets.
- Reissue any long-lived tokens for automation scripts.

## 4) Verify Security Controls
- Run secret scan:
  - `gitleaks detect --redact --verbose`
  - `rg -n --hidden --glob '!node_modules/**' "(DAILY_API_KEY|SUPABASE_SERVICE_ROLE_KEY|PRIVATE_KEY|BEGIN RSA)"`
- Confirm Daily token minting is server-side only (`supabase/functions/daily-token`).
- Confirm no client bundle references private keys.

## 5) Post-Rotation Validation
- Test call flows (voice/video):
  - room creation
  - token minting
  - join for caller/callee
- Test push flow after credential updates.
- Check edge function logs for auth/secret errors.

## 6) Incident Record
- Record date/time of rotation.
- Record keys rotated and systems impacted.
- Record verification evidence and owner sign-off.

## 7) Firebase Web API Key Exposure Runbook (March 2026)
- Exposure reference: `google-services.json` and `app/google-services.json` previously tracked.
- Mandatory actions:
  - Rotate the exposed Firebase Web API key in Google Cloud Console.
  - Restrict key usage by Android package name + SHA-1 and required APIs only.
  - Remove tracked Firebase config files from git and keep local copies untracked.
  - Store production Firebase config as EAS file secrets (`GOOGLE_SERVICES_JSON`, `GOOGLE_SERVICE_INFO_PLIST`).
  - Run `npm run check:firebase-secrets` before merge/release.
- Rotation log entry (fill in during incident response):
  - Rotation completed at (UTC): `____________________`
  - Rotated by (owner): `____________________`
  - Verification evidence link: `____________________`
  - Security sign-off: `____________________`
