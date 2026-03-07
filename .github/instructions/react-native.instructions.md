---
applyTo: "components/**/*.{tsx,ts}"
---

# React Native Components Instructions

## File Size Limits
- Components: ≤400 lines (excluding StyleSheet)
- Screens: ≤500 lines (excluding StyleSheet)
- Hooks: ≤200 lines
- Type definitions: ≤300 lines (except auto-generated)
- StyleSheet: Use separate `styles.ts` for components >200 lines

## When to Split Components
Split immediately if ANY apply:
- File exceeds size limits
- File has 3+ distinct responsibilities
- StyleSheet exceeds 200 lines
- Component has 5+ render/helper functions
- Multiple developers frequently cause merge conflicts

## Code Organization
- Extract logic into custom hooks; keep UI components pure
- Place reusable UI patterns in `components/`
- Use Container/Presentational pattern

## Access Control
- Always use RBAC helpers from `lib/rbac/types.ts`; never hardcode role checks
- Example:
```typescript
import { roleHasPermission } from '@/lib/rbac/types';
if (roleHasPermission(user.role, 'manage_courses')) { /* ... */ }
```

## AI Integration
- Never call AI services directly from client
- Always use `ai-proxy` Edge Function for AI calls
