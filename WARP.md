# WARP.md

Operational rules for all AI agents, WARP, Codex, Copilot, Cursor, and Claude Code working in this repository. These rules are **NON-NEGOTIABLE** and must be followed to the letter.

---

## File Size Standards (NON-NEGOTIABLE)

All files must stay within these limits. Exceeding them is a hard stop — split before committing.

| File type | Max lines | Split strategy |
|-----------|-----------|----------------|
| Components | ≤400 (excl. StyleSheet) | Extract sub-components to `components/<domain>/` |
| Screens | ≤500 (excl. StyleSheet) | Extract hooks + sub-components |
| Hooks | ≤200 | Split into subfolder with barrel `index.ts` |
| Services/Utilities | ≤500 | Split by concern |
| Type definitions | ≤300 (except auto-generated `database.types.ts`) | Split by domain |
| StyleSheet | Extract to `.styles.ts` if >200 lines | `createStyles(theme)` factory pattern |

**Modular hook folder pattern** — when a hook exceeds 200 lines, decompose into a subfolder:
```
hooks/principal-hub/
  ├── index.ts          # Orchestrator (≤200 lines), composes fetch functions
  ├── types.ts          # Interfaces + constants + helper functions
  ├── fetchStats.ts     # One concern per file
  └── ...
```
The standalone `hooks/usePrincipalHub.ts` re-exports from the subfolder — consumers are unaffected.

Run `npm run check:file-sizes` to validate before committing.

---

## Logging Policy (NON-NEGOTIABLE)

- **Never use `console.log`, `console.warn`, or `console.error` in production code.**
- Use `lib/logger.ts` (structured logger) for all logging.
- Run `npm run check:console` to catch violations before committing.
- `console.*` is only acceptable inside `// DEV ONLY` blocks guarded by `__DEV__` or `process.env.NODE_ENV === 'development'`.

---

## UI Rules (NON-NEGOTIABLE)

- **NEVER use `Alert.alert`** — use `AlertModal` or `useAlertModal` hook instead.
- **NEVER use `FlatList` for 1000+ items** — use `@shopify/flash-list` (FlashList).
- **NEVER use `alert()` on web** — use toast notifications.

---

## Database-First Rule (NON-NEGOTIABLE)

If code needs a DB column that doesn't exist, **add it via migration** — do not code workarounds with fallback chains like `message.sender_id || message.user_id || message.created_by`. Every such chain is a future bug.

---

## Storage Paths Rule (NON-NEGOTIABLE)

- **Always store Supabase Storage paths, never signed URLs.**
- Signed URLs expire (~1 hour) and will cause 400 errors on playback.
- Generate signed URLs on-demand at display time only:
  ```typescript
  // ✅ Store the path
  await sendMessage({ voiceUrl: result.storagePath }); // e.g. "user-id/voice_123.m4a"

  // ❌ Never store signed URLs
  await sendMessage({ voiceUrl: result.publicUrl }); // Will break after expiry
  ```

---

## AI Proxy Rule (NON-NEGOTIABLE)

- **NEVER call AI APIs (Anthropic, OpenAI, Gemini) directly from the client.**
- All AI calls must go through `supabase/functions/ai-proxy/` Edge Function.
- Use `services/dash-ai/DashAIClient.ts` → `callAIService(params)` on mobile.
- Use the equivalent web client for Next.js.

---

## Security Rules (NON-NEGOTIABLE)

- Never expose `SUPABASE_SERVICE_ROLE_KEY` client-side.
- Never commit secrets or private keys to git.
- Keep `.env`, `.env.local`, `.env.production`, `.env.eas` untracked.
- Do not place server-only credentials in `EXPO_PUBLIC_*` variables.
- For Supabase function secrets, avoid names starting with `SUPABASE_` (reserved). Use `SERVER_SUPABASE_SERVICE_ROLE_KEY`.
- Always maintain RLS policies for tenant isolation.
- Never modify authentication flow without explicit approval.
- If a secret leaks, rotate immediately and assume compromise.

---

## RBAC Rule (NON-NEGOTIABLE)

- Always use `roleHasPermission` from `@/lib/rbac/types` — never hardcode role string checks.
- Always check permissions before rendering UI or executing operations.
- Run `npx tsx lib/rbac/validate.ts` after any RBAC change. Expected: `"All validations passed!"`

---

## Quality Gates (run before every commit)

```bash
npm run lint:fix          # ESLint with auto-fix
npm run format            # Prettier
npm run check:console     # No console.log in production
npm run check:file-sizes  # File size compliance (this file)
npm run typecheck         # NODE_OPTIONS=--max-old-space-size=4096 tsc --noEmit
npm run lint:sql          # SQLFluff (required before any migration push)
```

---

## Secrets Rotation Checklist

When rotating auth/JWT/API/VAPID keys, update ALL of:

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

---

## VAPID-Specific Rule

- Public and private VAPID keys must be kept as a pair across all environments.
- After VAPID rotation, existing browser push subscriptions may need re-subscription.

---

## Migration Rules (NON-NEGOTIABLE)

- Use `supabase migration new <name>` for all schema changes — never edit SQL directly in the dashboard.
- Always lint SQL with `npm run lint:sql` (SQLFluff) before pushing.
- Use `supabase db push` (NO `--local` flag, NO local Docker).
- Run `supabase db diff` after push to verify no drift.
- Enable RLS on every table containing user or tenant data.

---

## Documentation Rule

- Only `README.md`, `WARP.md`, and `ROAD-MAP.md` belong in the project root.
- All other markdown goes in `docs/` subdirectories.
