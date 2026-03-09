---
applyTo: "supabase/migrations/**/*.sql"
---

# Supabase Migrations Instructions

## Creating Migrations
```bash
# Create migration
supabase migration new add_new_feature

# Lint SQL
npm run lint:sql

# Push to remote
supabase db push

# Verify no drift
supabase db diff
```

## Migration Standards
- Never use `supabase start` or local Docker instances
- Never execute SQL directly via Supabase Dashboard
- Always lint SQL with SQLFluff before push
- Always verify no drift after push

## RLS Requirements
- Enable RLS on all tables containing sensitive data
- Maintain tenant isolation in all policies
- Reference existing RLS patterns in the migrations directory

## Schema Changes
- Security and educational schemas are separated
- Telemetry tables: `ai_events`, `ai_feedback`, `ai_task_runs`
- AI quotas and feature flags managed in DB (`user_ai_tiers`, `feature_flags`)

## SuperAdmin
- SuperAdmin must exist before running enhancement migrations
- Always ensure `superadmin@edudashpro.org.za` exists with 2FA enabled
