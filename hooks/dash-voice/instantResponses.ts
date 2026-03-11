import type { SupportedLanguage } from '@/components/super-admin/voice-orb/useVoiceSTT';

export type InstantVoiceResponseIntent =
  | 'wake_greeting'
  | 'wellbeing_check'
  | 'generic_homework_help';

export type InstantVoiceResponse = {
  intent: InstantVoiceResponseIntent;
  text: string;
  cacheKey: string;
};

const GENERIC_MATH_HELP_REGEX =
  /^(can you help me( with)?|help me( with)?|i need help( with)?)( my)? (math|maths|mathematics)( homework)?$/i;

const GENERIC_HOMEWORK_HELP_REGEX =
  /^(can you help me( with)?|help me( with)?|i need help( with)?)( my)? homework$/i;

const WAKE_GREETING_REGEX =
  /^(hey|hi|hello|sawubona|molo|thobela|dumela)( dash)?$/i;

const WELLBEING_REGEX =
  /^(how are you|how are you dash|hows it|hows it dash|are you there|are you there dash)$/i;

const normalizeText = (text: string): string =>
  String(text || '')
    .toLowerCase()
    .replace(/[?!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const hasSpecificMathSignal = (text: string): boolean =>
  /[0-9=+\-*/^%]/.test(text) ||
  /\b(fraction|fractions|algebra|geometry|decimal|decimals|ratio|ratios|equation|equations|percentage|percentages|word problem|word problems)\b/i.test(text);

const getLanguageBucket = (language: SupportedLanguage): 'en' | 'af' | 'zu' => {
  if (language.startsWith('af')) return 'af';
  if (language.startsWith('zu')) return 'zu';
  return 'en';
};

const RESPONSES: Record<
  'en' | 'af' | 'zu',
  Record<InstantVoiceResponseIntent, string>
> = {
  en: {
    wake_greeting: "Hi, I'm here. Tell me what you want help with.",
    wellbeing_check: "I'm good and ready to help. Tell me the exact question, topic, or send a photo.",
    generic_homework_help:
      'Yes. Tell me the exact maths question or topic, or send a photo. For example: fractions, algebra, or word problems.',
  },
  af: {
    wake_greeting: 'Hallo, ek is hier. Vertel my waarmee jy hulp nodig het.',
    wellbeing_check:
      "Dit gaan goed. Gee vir my die presiese vraag of onderwerp, of stuur 'n foto.",
    generic_homework_help:
      "Ja. Stuur die presiese Wiskunde-vraag of onderwerp, of stuur 'n foto. Byvoorbeeld: breuke, algebra of woordprobleme.",
  },
  zu: {
    wake_greeting: 'Sawubona, ngikhona. Ngitshele ukuthi ufuna usizo ngani.',
    wellbeing_check:
      'Ngikhona futhi ngikulungele ukusiza. Ngitshele umbuzo oqondile noma isihloko, noma uthumele isithombe.',
    generic_homework_help:
      'Yebo. Ngitshele umbuzo oqondile weMaths noma isihloko, noma uthumele isithombe. Isibonelo: fractions, algebra noma word problems.',
  },
};

export const getInstantVoiceResponse = (
  text: string,
  language: SupportedLanguage,
): InstantVoiceResponse | null => {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  const wordCount = normalized.split(' ').filter(Boolean).length;
  if (wordCount > 9) return null;

  let intent: InstantVoiceResponseIntent | null = null;

  if (WAKE_GREETING_REGEX.test(normalized)) {
    intent = 'wake_greeting';
  } else if (WELLBEING_REGEX.test(normalized)) {
    intent = 'wellbeing_check';
  } else if (
    (GENERIC_MATH_HELP_REGEX.test(normalized) || GENERIC_HOMEWORK_HELP_REGEX.test(normalized)) &&
    !hasSpecificMathSignal(normalized)
  ) {
    intent = 'generic_homework_help';
  }

  if (!intent) return null;

  const bucket = getLanguageBucket(language);
  return {
    intent,
    text: RESPONSES[bucket][intent],
    cacheKey: `${bucket}:${intent}`,
  };
};
