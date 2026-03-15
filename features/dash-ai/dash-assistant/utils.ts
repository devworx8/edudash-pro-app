export const COMPOSER_FLOAT_GAP = 6;
export const COMPOSER_OVERLAY_MIN_HEIGHT = 64;
export const COMPOSER_ANDROID_NAV_LIFT = 14;

export const splitSpeechSegments = (content: string): string[] => {
  const cleaned = String(content || '').trim();
  if (!cleaned) return [];
  // Strip markdown syntax (headings, bold, bullets, backticks) before splitting,
  // so TTS doesn't read `##` or `**` aloud.
  const stripped = cleaned
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\$\$[\s\S]*?\$\$/g, '')
    .replace(/\$[^$\n]+?\$/g, '')
    .trim();
  if (!stripped) return [cleaned]; // fallback to original if everything was stripped
  // Split on sentence boundaries OR paragraph breaks (blank lines / heading lines).
  return stripped
    .split(/(?<=[.?!])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
};

export const getBottomThinkingLabel = (
  loadingStatus: 'uploading' | 'analyzing' | 'thinking' | 'responding' | null,
): string => {
  switch (loadingStatus) {
    case 'uploading':   return 'Dash is uploading your files...';
    case 'analyzing':   return 'Dash is analyzing your content...';
    case 'responding':  return 'Dash is preparing the final response...';
    case 'thinking':
    default:            return 'Dash is thinking...';
  }
};