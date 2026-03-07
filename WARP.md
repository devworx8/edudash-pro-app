# WARP.md

Operational rules for WARP/Codex work in this repository.

## Secrets Policy (Mandatory)

- Never commit secrets or private keys to git.
- Keep `.env`, `.env.local`, `.env.production`, `.env.eas`, and other local env variants untracked.
- Do not place server-only credentials in `EXPO_PUBLIC_*` variables.
- For Supabase function secrets, avoid custom names starting with `SUPABASE_` (reserved). Use names like `SERVER_SUPABASE_SERVICE_ROLE_KEY`.
- If a secret leaks, rotate immediately and assume compromise.

## Rotation Checklist

When rotating auth/JWT/API/VAPID keys, update all of:

1. Local developer env files.
2. EAS envs (`development`, `preview`, `production`).
3. Supabase secrets (`supabase secrets set ...`).
4. Any external runtime/hosting secret stores.

Then:

1. Validate auth and push flows.
2. Run `npm run verify:prod`.
3. Decide OTA vs rebuild:
   - OTA for JS/config usage changes.
   - Rebuild for native/binary changes.

## VAPID-Specific Rule

- Public and private VAPID keys must be kept as a pair across all environments.
- After VAPID rotation, existing browser push subscriptions may need re-subscription.
