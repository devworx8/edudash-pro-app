/**
 * Voice composer layout constants and helpers.
 * Shared by dash-voice screen and useDashVoiceHandlers.
 */
import { Dimensions, Platform } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const VOICE_COMPOSER_COMPACT_HEIGHT = 44;
export const VOICE_COMPOSER_GROW_THRESHOLD = 60;
export const VOICE_COMPOSER_MAX_HEIGHT = 124;

const VOICE_COMPOSER_LINE_HEIGHT = 20;
const VOICE_COMPOSER_WEB_CHARS_PER_LINE = Math.max(
  22,
  Math.floor((SCREEN_WIDTH - 152) / 8),
);

const estimateWrappedLineCount = (text: string, charsPerLine: number): number =>
  String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .reduce(
      (total, line) => total + Math.max(1, Math.ceil(Math.max(line.length, 1) / charsPerLine)),
      0,
    );

export const getWebComposerHeight = (text: string): number => {
  const lineCount = estimateWrappedLineCount(text, VOICE_COMPOSER_WEB_CHARS_PER_LINE);
  if (lineCount <= 1) return VOICE_COMPOSER_COMPACT_HEIGHT;
  return Math.min(
    VOICE_COMPOSER_COMPACT_HEIGHT + (lineCount - 1) * VOICE_COMPOSER_LINE_HEIGHT,
    VOICE_COMPOSER_MAX_HEIGHT,
  );
};
