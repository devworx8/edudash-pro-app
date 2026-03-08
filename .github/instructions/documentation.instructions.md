---
applyTo: "**/*.md"
---

# Documentation Instructions

## Documentation Organization
- Only `README.md`, `WARP.md`, and `ROAD-MAP.md` in project root
- All other markdown in `docs/` subdirectories:
  - `docs/deployment/` - Build guides, CI/CD, environment config
  - `docs/features/` - Feature specs, implementation guides
  - `docs/security/` - RLS policies, authentication, RBAC
  - `docs/database/` - Migration guides, schema docs
  - `docs/governance/` - Development standards, workflows
  - `docs/OBSOLETE/` - Archived documentation

## Writing Standards
- Use clear, concise language
- Include code examples where appropriate
- Keep documentation up-to-date with code changes
- Use headings and bullet points for readability

## Key Documentation References
- RBAC: `lib/rbac/README.md`
- Database: `scripts/README.md`
- Supabase: `supabase/README.md`
