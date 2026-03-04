export function toUserFacingGenerationWarning(reason: string): string {
  const raw = String(reason || '').trim();
  const lower = raw.toLowerCase();

  if (!raw) return '';
  if (lower.includes('failed language/comprehension checks')) {
    return 'Quality checks found issues in the first draft, so Dash used a safer CAPS-aligned exam version.';
  }
  if (lower.includes('freemium plan limit reached')) {
    return 'You have reached your premium exam generation limit for this cycle, so a basic CAPS fallback was used.';
  }
  if (lower.includes('credits are currently depleted') || lower.includes('providers are currently unavailable')) {
    return 'AI provider capacity is temporarily limited, so Dash used a fallback exam version.';
  }
  if (lower.includes('malformed exam json')) {
    return 'The first draft could not be parsed correctly, so Dash used a fallback exam version.';
  }
  return raw;
}
