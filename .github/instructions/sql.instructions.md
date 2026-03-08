---
applyTo: "**/*.sql"
---

# SQL and Database Instructions

## Migration Standards
- Use `supabase migration new` for all schema changes
- Lint SQL with SQLFluff before push (`npm run lint:sql`)
- Use `supabase db push` (no --local flag) to apply migrations
- Verify no drift with `supabase db diff` after push
- Never execute SQL directly via Supabase Dashboard
- Never use `supabase start` or local Docker instances

## Row-Level Security (RLS)
- Always enable RLS on tables containing user or tenant data
- Maintain tenant isolation in all RLS policies
- Test policies with different user roles before deployment
- Reference existing RLS patterns in `supabase/migrations/`

## Naming Conventions
- Use snake_case for table and column names
- Prefix tenant-scoped tables appropriately
- Use descriptive names that reflect the data's purpose

## Schema Organization
- Security and educational schemas are separated
- Follow migration order in `scripts/README.md`
- SuperAdmin must exist before running enhancement scripts
