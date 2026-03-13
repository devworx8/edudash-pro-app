export const COMPOSER_FLOAT_GAP = 0;
export const COMPOSER_OVERLAY_MIN_HEIGHT = 64;
export const COMPOSER_ANDROID_NAV_LIFT = 14;

export const splitSpeechSegments = (content: string): string[] => {
  const cleaned = String(content || '').trim();
  if (!cleaned) return [];
  return cleaned
    .split(/(?<=[.?!])\s+/)
    .map((segment) => segment.trim())
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