---
applyTo: "lib/**/*.ts"
---

# Library (lib/) Instructions

## File Size Limits
- Services/Utilities: ≤500 lines
- Hooks: ≤200 lines
- Type definitions: ≤300 lines (except auto-generated)

## RBAC System
- Permissions and roles defined in `lib/rbac/roles-permissions.json`
- TypeScript helpers in `lib/rbac/types.ts`
- Always use RBAC helpers; never hardcode role checks
- Run validation: `npx tsx lib/rbac/validate.ts`

## AI Capabilities
- Quota-controlled AI tied to user roles/tiers
- Reference `lib/ai/capabilities.ts` for tier/capability matrix
- Feature flags and AI quotas managed in DB (`user_ai_tiers`, `feature_flags`)

## Security
- Never expose service role keys client-side
- Never call AI services directly from client
- Use `ai-proxy` Edge Function for AI calls
- Maintain RLS policies for tenant isolation

## Code Organization
- Isolate API calls in service files
- Centralize related types in type files, split by domain if needed
- Extract complex state/effects to custom hooks
