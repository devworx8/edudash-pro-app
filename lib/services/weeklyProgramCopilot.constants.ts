export const WEATHER_KEYWORDS = [
  'weather',
  'forecast',
  'season',
  'temperature',
  'climate',
  'sunny',
  'rain',
  'cloud',
];

export const WEEKDAY_SEQUENCE = [1, 2, 3, 4, 5] as const;

export const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
};

export const MIN_BLOCKS_PER_WEEKDAY = 6;
export const MAX_BLOCKS_PER_WEEKDAY = 10;

export const CAPS_HOME_LANGUAGE_KEYWORDS = [
  'home language',
  'language',
  'phonics',
  'story',
  'vocabulary',
  'read',
  'speaking',
  'listening',
  'rhyme',
];

export const CAPS_MATHEMATICS_KEYWORDS = [
  'mathematics',
  'math',
  'number',
  'count',
  'shape',
  'pattern',
  'measurement',
  'sorting',
];

export const CAPS_LIFE_SKILLS_KEYWORDS = [
  'life skills',
  'social',
  'emotional',
  'self-help',
  'hygiene',
  'movement',
  'outdoor',
  'wellness',
  'creative arts',
];

export const TOILET_KEYWORDS = ['toilet', 'bathroom', 'washroom', 'restroom', 'potty'];
export const BREAKFAST_KEYWORDS = ['breakfast'];
export const LUNCH_KEYWORDS = ['lunch'];
export const NAP_KEYWORDS = ['nap', 'quiet time', 'rest time', 'rest block'];

export const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

type PreflightAnchorDefinition = {
  key: 'morning_prayer' | 'circle_time' | 'breakfast' | 'lunch' | 'nap';
  label: string;
  keywords: string[];
  blockType: DailyProgramBlockType;
  defaultDurationMinutes: number;
};

export const PREFLIGHT_ANCHOR_DEFINITIONS: PreflightAnchorDefinition[] = [
  {
    key: 'morning_prayer',
    label: 'Morning Prayer',
    keywords: ['morning prayer', 'prayer'],
    blockType: 'circle_time',
    defaultDurationMinutes: 10,
  },
  {
    key: 'circle_time',
    label: 'Circle Time',
    keywords: ['circle time', 'morning circle', 'circle'],
    blockType: 'circle_time',
    defaultDurationMinutes: 20,
  },
  {
    key: 'breakfast',
    label: 'Breakfast',
    keywords: ['breakfast'],
    blockType: 'meal',
    defaultDurationMinutes: 30,
  },
  {
    key: 'lunch',
    label: 'Lunch',
    keywords: ['lunch'],
    blockType: 'meal',
    defaultDurationMinutes: 30,
  },
  {
    key: 'nap',
    label: 'Nap / Quiet Time',
    keywords: ['nap', 'quiet time', 'rest time', 'rest block'],
    blockType: 'nap',
    defaultDurationMinutes: 60,
  },
];

export const TIME_TOKEN_PATTERN =
  '(?:[01]?\\d|2[0-3]):[0-5]\\d(?:\\s?(?:am|pm))?|(?:0?[1-9]|1[0-2])\\s?(?:am|pm)';

export const MIN_DAY_END_MINUTES = 810; // 13:30
import type { DailyProgramBlockType } from '@/types/ecd-planning';
