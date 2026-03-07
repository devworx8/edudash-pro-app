export type PhonicsClipId =
  | 'letter_a'
  | 'letter_e'
  | 'letter_i'
  | 'letter_o'
  | 'letter_u'
  | 'blend_sh'
  | 'blend_ch'
  | 'blend_th'
  | 'viseme_open_vowel'
  | 'viseme_lip_round';

export type PhonicsClipGroup = 'letters' | 'blends' | 'visemes';

export type NativePhonicsAssetKey =
  | 'letter-a'
  | 'letter-e'
  | 'letter-i'
  | 'letter-o'
  | 'letter-u'
  | 'blend-sh'
  | 'blend-ch'
  | 'blend-th'
  | 'viseme-open-vowel'
  | 'viseme-lip-round';

export interface PhonicsClipDefinition {
  id: PhonicsClipId;
  label: string;
  cue: string;
  group: PhonicsClipGroup;
  webPath: string;
  nativeAssetKey: NativePhonicsAssetKey;
}

export const PHONICS_CLIP_CATALOG: PhonicsClipDefinition[] = [
  {
    id: 'letter_a',
    label: 'Letter A',
    cue: 'Say /a/ with open mouth',
    group: 'letters',
    webPath: '/phonics/en-ZA/letter-a.mp3',
    nativeAssetKey: 'letter-a',
  },
  {
    id: 'letter_e',
    label: 'Letter E',
    cue: 'Say /e/ short and clear',
    group: 'letters',
    webPath: '/phonics/en-ZA/letter-e.mp3',
    nativeAssetKey: 'letter-e',
  },
  {
    id: 'letter_i',
    label: 'Letter I',
    cue: 'Say /i/ with smile lips',
    group: 'letters',
    webPath: '/phonics/en-ZA/letter-i.mp3',
    nativeAssetKey: 'letter-i',
  },
  {
    id: 'letter_o',
    label: 'Letter O',
    cue: 'Say /o/ round and smooth',
    group: 'letters',
    webPath: '/phonics/en-ZA/letter-o.mp3',
    nativeAssetKey: 'letter-o',
  },
  {
    id: 'letter_u',
    label: 'Letter U',
    cue: 'Say /u/ from back of mouth',
    group: 'letters',
    webPath: '/phonics/en-ZA/letter-u.mp3',
    nativeAssetKey: 'letter-u',
  },
  {
    id: 'blend_sh',
    label: 'Blend SH',
    cue: 'Lips forward, quiet airflow',
    group: 'blends',
    webPath: '/phonics/en-ZA/blend-sh.mp3',
    nativeAssetKey: 'blend-sh',
  },
  {
    id: 'blend_ch',
    label: 'Blend CH',
    cue: 'Tap then release sound',
    group: 'blends',
    webPath: '/phonics/en-ZA/blend-ch.mp3',
    nativeAssetKey: 'blend-ch',
  },
  {
    id: 'blend_th',
    label: 'Blend TH',
    cue: 'Tongue between teeth gently',
    group: 'blends',
    webPath: '/phonics/en-ZA/blend-th.mp3',
    nativeAssetKey: 'blend-th',
  },
  {
    id: 'viseme_open_vowel',
    label: 'Viseme Open Vowel',
    cue: 'Watch open jaw movement',
    group: 'visemes',
    webPath: '/phonics/en-ZA/viseme-open-vowel.mp3',
    nativeAssetKey: 'viseme-open-vowel',
  },
  {
    id: 'viseme_lip_round',
    label: 'Viseme Lip Round',
    cue: 'Round lips for o/u sounds',
    group: 'visemes',
    webPath: '/phonics/en-ZA/viseme-lip-round.mp3',
    nativeAssetKey: 'viseme-lip-round',
  },
];

export const PHONICS_CLIP_MAP = Object.fromEntries(
  PHONICS_CLIP_CATALOG.map((item) => [item.id, item]),
) as Record<PhonicsClipId, PhonicsClipDefinition>;
