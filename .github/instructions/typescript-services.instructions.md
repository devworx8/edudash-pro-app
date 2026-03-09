---
applyTo: "services/**/*.ts"
---

# TypeScript Services Instructions

## File Size Limits
- Services/Utilities: ≤500 lines
- Split immediately if file exceeds limits or has 3+ distinct responsibilities

## Supabase Storage Best Practices

### Private Bucket File References
When storing references to files in private Supabase Storage buckets:

**ALWAYS store the storage path, NEVER store signed URLs:**
```typescript
// ✅ CORRECT - Store the path
await sendMessage({
  voiceUrl: result.storagePath,  // e.g., "user-id/voice_123.m4a"
});

// ❌ WRONG - Signed URLs expire (typically 1 hour)
await sendMessage({
  voiceUrl: result.publicUrl,  // Signed URL - will break after expiry!
});
```

**Generate signed URLs on-demand for playback:**
```typescript
// When playing/displaying the file:
const { data } = await supabase.storage
  .from('bucket_name')
  .createSignedUrl(storagePath, 3600); // 1 hour validity

const playableUrl = data.signedUrl;
```

**Why this matters:**
- Signed URLs expire (default 1 hour)
- Storing expired URLs causes 400 errors on playback
- Storage paths are permanent references
- Fresh signed URLs can always be generated for authenticated users

### Detecting URL Type
```typescript
const isStoragePath = (url: string): boolean => {
  return !url.startsWith('http') && !url.startsWith('blob:');
};
```

## Agent Tool Development
- Register all agent tools in `services/modules/DashToolRegistry.ts`
- Tools must specify risk level and input schema
- All agent actions must use registered tools; avoid direct external service calls
- Wrap external services as tools in the registry

## Agent Architecture
- Core agent logic is in `services/AgentOrchestrator.ts` (Plan-Act-Reflect loop)
- All agent actions and decisions are tracked via telemetry in Supabase (`ai_events`, `ai_feedback`, `ai_task_runs`)
- Use `DashToolRegistry` for tool execution

## Code Organization Patterns
- Extract logic into custom hooks; keep UI components pure
- Isolate all API calls in service files
- Centralize related types in type files, split by domain if needed
- Use Container/Presentational pattern for separation of concerns
