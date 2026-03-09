import { TIME_TOKEN_PATTERN } from './weeklyProgramCopilot.constants';

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const minutesToTime = (value: number): string => {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(value)));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const parseFlexibleTimeToMinutes = (value: string): number | null => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;

  const hm = raw.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
  if (hm) {
    let hours = Number(hm[1]);
    const minutes = Number(hm[2]);
    const meridian = hm[3]?.toLowerCase();
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes < 0 || minutes > 59) return null;
    if (meridian) {
      if (hours < 1 || hours > 12) return null;
      if (meridian === 'pm' && hours !== 12) hours += 12;
      if (meridian === 'am' && hours === 12) hours = 0;
    } else if (hours < 0 || hours > 23) {
      return null;
    }
    return hours * 60 + minutes;
  }

  const hOnly = raw.match(/^(\d{1,2})\s*(am|pm)$/i);
  if (hOnly) {
    let hours = Number(hOnly[1]);
    if (!Number.isFinite(hours) || hours < 1 || hours > 12) return null;
    const meridian = hOnly[2].toLowerCase();
    if (meridian === 'pm' && hours !== 12) hours += 12;
    if (meridian === 'am' && hours === 12) hours = 0;
    return hours * 60;
  }

  return null;
};

export const findAnchorTimeInSource = (source: string, phrases: string[]): string | null => {
  let best: { index: number; minutes: number } | null = null;
  const timePrefix = '(?:at|@|from|start\\s+at)\\s*';
  for (const phrase of phrases) {
    const escaped = escapeRegExp(phrase);
    const beforeTime = new RegExp(
      `${escaped}[^\\n\\r\\.,;]{0,48}?${timePrefix}(${TIME_TOKEN_PATTERN})`,
      'ig',
    );
    const afterTime = new RegExp(
      `${timePrefix}(${TIME_TOKEN_PATTERN})[^\\n\\r\\.,;]{0,32}${escaped}`,
      'ig',
    );
    const adjacentTime = new RegExp(`${escaped}[^\\n\\r\\.,;]{0,24}?(${TIME_TOKEN_PATTERN})`, 'ig');

    for (const pattern of [beforeTime, afterTime, adjacentTime]) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        const minutes = parseFlexibleTimeToMinutes(match[1]);
        if (minutes == null) continue;
        const index = match.index;
        if (!best || index < best.index) {
          best = { index, minutes };
        }
      }
    }
  }

  return best ? minutesToTime(best.minutes) : null;
};

/** Parse "HH:MM" to minutes since midnight, or null if invalid */
export const parseTimeToMinutes = (time: string | null | undefined): number | null => {
  if (!time) return null;
  const m = String(time).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};
