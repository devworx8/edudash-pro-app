import { shouldSuppressDashSpeechForStructuredContent } from './speechContentPolicy';

const SPELLING_BLOCK_REGEX = /```spelling\s*[\s\S]*?```/i;

export const isLearnerRole = (role?: string | null): boolean => {
  const normalized = String(role || '').trim().toLowerCase();
  return normalized === 'student' || normalized === 'learner';
};

export const containsSpellingBlock = (text?: string | null): boolean =>
  SPELLING_BLOCK_REGEX.test(String(text || ''));

export const resolveAutoSpeakPreference = (params: {
  role?: string | null;
  explicitAutoSpeak?: boolean | null;
  hasExplicitPreference: boolean;
}): boolean => {
  if (params.hasExplicitPreference && typeof params.explicitAutoSpeak === 'boolean') {
    return params.explicitAutoSpeak;
  }
  return !isLearnerRole(params.role);
};

export const shouldAutoSpeak = (params: {
  role?: string | null;
  voiceEnabled: boolean;
  autoSpeakEnabled: boolean;
  responseText?: string | null;
}): boolean => {
  if (!params.voiceEnabled) return false;
  if (!params.autoSpeakEnabled) return false;
  if (containsSpellingBlock(params.responseText)) return false;
  if (shouldSuppressDashSpeechForStructuredContent(params.responseText)) return false;
  return true;
};
