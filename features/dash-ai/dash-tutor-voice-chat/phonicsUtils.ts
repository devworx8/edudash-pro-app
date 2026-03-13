import { detectPhonicsIntent } from '@/lib/dash-ai/phonicsDetection';

export const PHONICS_TARGET_STALE_MS = 20 * 60 * 1000;
export const CHAT_HISTORY_KEY = '@dash_tutor_voice_history';
export const MAX_STORED_MESSAGES = 50;

export type PendingPhonicsTarget = {
  referenceText: string;
  targetPhoneme: string;
  updatedAt: number;
  source: 'assistant' | 'learner';
};

export function extractPhonicsTarget(
  text: string,
  source: 'assistant' | 'learner',
): PendingPhonicsTarget | null {
  const value = String(text || '').trim().toLowerCase();
  if (!value || !detectPhonicsIntent(value)) return null;

  const slashMatch = value.match(/\/([a-z]{1,3})\//i);
  const blendMatch = value.match(/\b([a-z](?:-[a-z]){1,7})\b/i);
  const guidedWordMatch = value.match(
    /\b(?:say|repeat|read|sound out|blend)\s+["'"]?([a-z]{1,24})["'"]?/i,
  );

  let referenceText = '';
  if (guidedWordMatch?.[1]) {
    referenceText = guidedWordMatch[1].toLowerCase();
  } else if (blendMatch?.[1]) {
    referenceText = blendMatch[1].replace(/-/g, '').toLowerCase();
  } else if (slashMatch?.[1]) {
    referenceText = slashMatch[1].toLowerCase();
  }

  if (!referenceText) return null;
  const targetPhoneme = String(
    slashMatch?.[1] || referenceText[0] || 'unknown',
  ).toLowerCase();

  return { referenceText, targetPhoneme, updatedAt: Date.now(), source };
}

export function extractOrbCardContent(content: string): {
  title: string | null;
  body: string;
} {
  const stripped = content
    .replace(/\[WHITEBOARD\][\s\S]*?\[\/WHITEBOARD\]/gi, '')
    .trim();
  const lines = stripped
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { title: null, body: stripped };
  const firstClean = lines[0]
    .replace(/^#+\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .trim();
  if (
    firstClean.length < 70 &&
    !firstClean.endsWith('.') &&
    !firstClean.endsWith('?') &&
    lines.length > 1
  ) {
    return {
      title: firstClean,
      body: lines
        .slice(1)
        .join(' ')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/^[-•]\s*/gm, ''),
    };
  }
  return {
    title: null,
    body: stripped.replace(/\*\*/g, '').replace(/\*/g, ''),
  };
}