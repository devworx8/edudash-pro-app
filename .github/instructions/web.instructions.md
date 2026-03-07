---
applyTo: "web/**/*.{ts,tsx}"
---

# Web (Next.js) Instructions

## File Size Limits
- Components: ≤400 lines (excluding styles)
- Services/Utilities: ≤500 lines
- Hooks: ≤200 lines
- Type definitions: ≤300 lines (except auto-generated)

## AI Integration
- Never call AI services directly from client
- Always use `ai-proxy` Edge Function for AI calls
- Quota-controlled AI features tied to user roles/tiers in DB
- Reference `web/src/lib/ai/capabilities.ts` for tier/capability matrix

## Prompt Handling
- Use `getUserEditablePrompt` and utilities in `web/src/lib/utils/prompt-filter.ts`
- System instructions are prepended to user prompts

## Security
- Never expose service role keys client-side
- Maintain RLS policies for tenant isolation
- Never modify authentication without approvals

## PDF Generation
- Reference `web/src/lib/utils/pdf-export.ts` for agent-driven PDF generation
