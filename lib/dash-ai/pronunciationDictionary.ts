/**
 * Pronunciation Dictionary for Dash TTS.
 *
 * Provides SSML `<sub>` aliases and `<phoneme>` overrides so Azure Neural
 * voices pronounce brand names, SA language names, educational terms, and
 * common abbreviations correctly.
 *
 * Used by both `ttsNormalize.ts` (client-side text prep) and
 * `tts-proxy/index.ts` (Edge Function SSML construction).
 *
 * @module pronunciationDictionary
 * @see ttsNormalize.ts — text normalization pipeline
 * @see phonics.ts — letter-level IPA maps
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PronunciationEntry {
  /** Regex to match in running text (case-insensitive) */
  pattern: RegExp;
  /**
   * SSML `<sub>` alias — Azure reads this text instead of the matched token.
   * Use for brand names and compound words the engine splits incorrectly.
   */
  alias?: string;
  /**
   * IPA phoneme string for `<phoneme alphabet="ipa">`.
   * Takes priority over `alias` when building SSML.
   */
  ipa?: string;
  /**
   * BCP-47 language tag for wrapping in `<lang xml:lang="...">`.
   * Tells Azure to switch voice/phonology mid-utterance.
   */
  lang?: string;
  /** Human-readable note (not used at runtime). */
  note?: string;
}

// ---------------------------------------------------------------------------
// Brand & Platform Names
// ---------------------------------------------------------------------------

const BRAND_NAMES: PronunciationEntry[] = [
  {
    pattern: /\bEduDash\s*Pro\b/gi,
    alias: 'Edyoo-dash Pro',
    ipa: 'ˌɛdjuːˈdæʃ proʊ',
    note: 'SA pronunciation: "ed-yoo-dash pro" — single compound name',
  },
  {
    pattern: /\bEduDash\b/gi,
    alias: 'Edyoo-dash',
    ipa: 'ˌɛdjuːˈdæʃ',
    note: 'SA pronunciation: "ed-yoo-dash" — without "Pro" suffix',
  },
  {
    pattern: /\bDash\s*AI\b/gi,
    alias: 'Dash A.I.',
    note: 'Spell out AI',
  },
  {
    pattern: /\bSupabase\b/gi,
    alias: 'Soopa-base',
    note: 'Common mispronunciation: "supper-base"',
  },
];

// ---------------------------------------------------------------------------
// South African Language Names
// ---------------------------------------------------------------------------

const SA_LANGUAGE_NAMES: PronunciationEntry[] = [
  {
    pattern: /\bisiZulu\b/gi,
    ipa: 'ˌiːsiˈzuːluː',
    lang: 'zu-ZA',
    note: 'One word, stress on "zu"',
  },
  {
    pattern: /\bisiXhosa\b/gi,
    ipa: 'ˌiːsiˈǁʰoːsa',
    lang: 'xh-ZA',
    note: 'One word, click consonant',
  },
  {
    pattern: /\bisiNdebele\b/gi,
    ipa: 'ˌiːsindeˈbeːle',
    note: 'One word',
  },
  {
    pattern: /\bSepedi\b/gi,
    ipa: 'seˈpeːdi',
    lang: 'nso-ZA',
    note: 'Also called Sesotho sa Leboa / Northern Sotho',
  },
  {
    pattern: /\bSesotho\b/gi,
    ipa: 'seˈsuːtʰuː',
    note: 'Southern Sotho',
  },
  {
    pattern: /\bSetswana\b/gi,
    ipa: 'seˈtswɑːnɑ',
    note: 'One word',
  },
  {
    pattern: /\bTshivenda\b/gi,
    ipa: 'tʃɪˈvɛndɑ',
    note: 'Also Tshivenḓa',
  },
  {
    pattern: /\bXitsonga\b/gi,
    ipa: 'ʃɪˈtsɔŋɡɑ',
    note: 'One word',
  },
  {
    pattern: /\bAfrikaans\b/gi,
    ipa: 'ɑːfrɪˈkɑːns',
    lang: 'af-ZA',
    note: 'Stress on second syllable',
  },
  {
    pattern: /\bSiSwati\b/gi,
    ipa: 'siˈswɑːti',
    note: 'Also spelled siSwati',
  },
];

// ---------------------------------------------------------------------------
// Educational / Curriculum Terms
// ---------------------------------------------------------------------------

const EDUCATIONAL_TERMS: PronunciationEntry[] = [
  {
    pattern: /\bCAPS\b/g,
    alias: 'caps',
    note: 'Curriculum Assessment Policy Statements — say as word, not letters',
  },
  {
    pattern: /\bSTEM\b/g,
    alias: 'stem',
    note: 'Science, Technology, Engineering, Math — say as word',
  },
  {
    pattern: /\bECD\b/g,
    alias: 'E.C.D.',
    note: 'Early Childhood Development — spell out',
  },
  {
    pattern: /\bDBE\b/g,
    alias: 'D.B.E.',
    note: 'Department of Basic Education — spell out',
  },
  {
    pattern: /\bFET\b/g,
    alias: 'F.E.T.',
    note: 'Further Education and Training — spell out',
  },
  {
    pattern: /\bGET\b(?=\s+(phase|band|level))/gi,
    alias: 'G.E.T.',
    note: 'General Education and Training — spell out (only before "phase/band/level")',
  },
  {
    pattern: /\bNSC\b/g,
    alias: 'N.S.C.',
    note: 'National Senior Certificate',
  },
  {
    pattern: /\bANA\b(?=\s)/g,
    alias: 'A.N.A.',
    note: 'Annual National Assessment',
  },
  {
    pattern: /\bGrade\s+R\b/gi,
    alias: 'Grade R',
    note: 'Reception year — "R" said as letter',
  },
];

// ---------------------------------------------------------------------------
// Tech Abbreviations (TTS should spell out)
// ---------------------------------------------------------------------------

const TECH_ABBREVIATIONS: PronunciationEntry[] = [
  { pattern: /\bAPI\b/g, alias: 'A.P.I.' },
  { pattern: /\bHTTP\b/g, alias: 'H.T.T.P.' },
  { pattern: /\bJSON\b/g, alias: 'J.S.O.N.' },
  { pattern: /\bSQL\b/g, alias: 'S.Q.L.' },
  { pattern: /\bRLS\b/g, alias: 'R.L.S.' },
  { pattern: /\bRBAC\b/g, alias: 'R.B.A.C.' },
  { pattern: /\bSTT\b/g, alias: 'speech to text' },
  { pattern: /\bTTS\b/g, alias: 'text to speech' },
  { pattern: /\bAI\b/g, alias: 'A.I.' },
  { pattern: /\bURL\b/g, alias: 'U.R.L.' },
  { pattern: /\bPDF\b/g, alias: 'PDF' },
  { pattern: /\bOTP\b/g, alias: 'O.T.P.' },
];

// ---------------------------------------------------------------------------
// South African Common Words & Place Names
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// SA English Letter Pronunciations
// ---------------------------------------------------------------------------

const SA_LETTER_PRONUNCIATIONS: PronunciationEntry[] = [
  {
    pattern: /\bthe letter Z\b/gi,
    alias: 'the letter zed',
    note: 'SA English: Z is always "zed", never "zee"',
  },
  {
    pattern: /\bletter "?Z"?\b/gi,
    alias: 'letter zed',
    note: 'SA English: Z is "zed"',
  },
  {
    pattern: /(?<=,\s|\band\s|or\s)"?Z"?(?=[.!?,\s]|$)/g,
    alias: 'zed',
    note: 'SA English: standalone Z in lists (A, B, ... Z) reads as "zed"',
  },
];

// ---------------------------------------------------------------------------
// South African Common Words & Place Names
// ---------------------------------------------------------------------------

const SA_COMMON_WORDS: PronunciationEntry[] = [
  {
    pattern: /\bSawubona\b/gi,
    ipa: 'sɑːwuˈboːnɑ',
    lang: 'zu-ZA',
    note: 'isiZulu greeting: "I see you"',
  },
  {
    pattern: /\bMolo\b/gi,
    ipa: 'ˈmoːlo',
    lang: 'xh-ZA',
    note: 'isiXhosa greeting (singular)',
  },
  {
    pattern: /\bDumela\b/gi,
    ipa: 'duˈmeːlɑ',
    note: 'Sesotho/Setswana greeting',
  },
  {
    pattern: /\bUbuntu\b/gi,
    ipa: 'ʊˈbʊntʊ',
    lang: 'zu-ZA',
    note: '"I am because we are"',
  },
  {
    pattern: /\bNkosi\b/gi,
    ipa: 'ˈŋkoːsi',
    lang: 'zu-ZA',
    note: 'Lord / Chief',
  },
  {
    pattern: /\bGogo\b/gi,
    ipa: 'ˈɡoːɡo',
    lang: 'zu-ZA',
    note: 'Grandmother',
  },
  {
    pattern: /\bMadiba\b/gi,
    ipa: 'mɑˈdiːbɑ',
    note: 'Clan name of Nelson Mandela',
  },
  {
    pattern: /\bRand\b/gi,
    alias: 'Rand',
    note: 'South African currency — single syllable',
  },
  {
    pattern: /\boranges\b/gi,
    alias: 'or-in-jiz',
    ipa: 'ˈɔːrɪndʒɪz',
    note: 'Stabilize plural pronunciation in K-12 math word problems',
  },
  {
    pattern: /\borange\b/gi,
    alias: 'or-inj',
    ipa: 'ˈɔːrɪndʒ',
    note: 'Stabilize singular pronunciation in K-12 vocabulary and examples',
  },
];

// ---------------------------------------------------------------------------
// SA Slang / Encouragement Words (used by Dash for coaching)
// ---------------------------------------------------------------------------

const SA_SLANG: PronunciationEntry[] = [
  {
    pattern: /\bLekker\b/gi,
    ipa: 'ˈlɛkər',
    lang: 'af-ZA',
    note: 'Afrikaans: awesome / great / delicious',
  },
  {
    pattern: /\bSharp\s*sharp\b/gi,
    alias: 'Sharp sharp',
    note: 'SA slang: cool / all good / goodbye — two syllables',
  },
  {
    pattern: /\bAwethu\b/gi,
    ipa: 'ɑˈwɛtʰu',
    lang: 'zu-ZA',
    note: 'isiZulu: ours / power to us',
  },
  {
    pattern: /\bEish\b/gi,
    ipa: 'eɪʃ',
    note: 'SA exclamation of surprise',
  },
  {
    pattern: /\bHowzit\b/gi,
    alias: 'How-zit',
    note: 'SA greeting: how is it / hello',
  },
  {
    pattern: /\bBaie\s*dankie\b/gi,
    ipa: 'ˈbɑːjə ˈdɑŋki',
    lang: 'af-ZA',
    note: 'Afrikaans: thank you very much',
  },
  {
    pattern: /\bAnna?tjie\b/gi,
    alias: 'Anakie',
    ipa: 'ɑˈnɑːki',
    lang: 'af-ZA',
    note: 'Afrikaans name pronunciation: sounds like "Ah-nah-key"',
  },
  {
    pattern: /\bSiyabonga\b/gi,
    ipa: 'sijɑˈboŋɡɑ',
    lang: 'zu-ZA',
    note: 'isiZulu: we thank you',
  },
  {
    pattern: /\bNè\b/gi,
    ipa: 'nɛ',
    lang: 'af-ZA',
    note: 'Afrikaans: right? / isn\'t it?',
  },
];

// ---------------------------------------------------------------------------
// South African Personal Names
// ---------------------------------------------------------------------------

const SA_PERSONAL_NAMES: PronunciationEntry[] = [
  // Zulu / Nguni names
  { pattern: /\bThabo\b/gi, ipa: 'tʰɑˈboː', lang: 'zu-ZA', note: 'Common SA male name' },
  { pattern: /\bSipho\b/gi, ipa: 'ˈsiːpʰo', lang: 'zu-ZA', note: 'isiZulu male name: gift' },
  { pattern: /\bZanele\b/gi, ipa: 'zɑˈneːle', lang: 'zu-ZA', note: 'isiZulu female name' },
  { pattern: /\bNomsa\b/gi, ipa: 'ˈnɔmsɑ', lang: 'zu-ZA', note: 'isiZulu female name: kindness' },
  { pattern: /\bBongani\b/gi, ipa: 'bɔŋˈɡɑːni', lang: 'zu-ZA', note: 'isiZulu male name: be thankful' },
  { pattern: /\bLerato\b/gi, ipa: 'leˈrɑːto', note: 'Sesotho: love' },
  { pattern: /\bNaledi\b/gi, ipa: 'nɑˈleːdi', note: 'Sesotho/Setswana: star' },
  { pattern: /\bMandla\b/gi, ipa: 'ˈmɑndlɑ', lang: 'zu-ZA', note: 'isiZulu male name: power' },
  { pattern: /\bNokuthula\b/gi, ipa: 'nɔkuˈtʰuːlɑ', lang: 'zu-ZA', note: 'isiZulu female name: peace' },
  { pattern: /\bNkosazana\b/gi, ipa: 'ŋkɔsɑˈzɑːnɑ', lang: 'zu-ZA', note: 'isiZulu: princess' },
  { pattern: /\bTshepo\b/gi, ipa: 'ˈtsʰɛpɔ', note: 'Sesotho/Setswana: hope' },
  { pattern: /\bMpho\b/gi, ipa: 'ˈmpʰo', note: 'Sesotho: gift' },
  { pattern: /\bLupfuno\b/gi, ipa: 'luˈpfuno', lang: 've-ZA', note: 'Tshivenda name' },
  { pattern: /\bMukhesa\b/gi, ipa: 'muˈkʰesɑ', lang: 've-ZA', note: 'Tshivenda surname' },
  { pattern: /\bThabang\b/gi, ipa: 'tʰɑˈbɑŋ', note: 'Sesotho male name: be happy' },
  { pattern: /\bKagiso\b/gi, ipa: 'kɑˈɡiːso', note: 'Setswana: peace' },
  { pattern: /\bNthabiseng\b/gi, ipa: 'ntʰɑbiˈsɛŋ', note: 'Sesotho female name' },
  { pattern: /\bSiyanda\b/gi, ipa: 'sijɑˈndɑ', lang: 'zu-ZA', note: 'isiZulu: we are growing' },
  { pattern: /\bAnele\b/gi, ipa: 'ɑˈneːle', lang: 'zu-ZA', note: 'isiZulu: enough' },
  { pattern: /\bLindiwe\b/gi, ipa: 'linˈdiːwe', lang: 'zu-ZA', note: 'isiZulu female name: waited for' },
  { pattern: /\bSbusiso\b/gi, ipa: 'sbuˈsiːso', lang: 'zu-ZA', note: 'isiZulu male name: blessing' },
  { pattern: /\bNhlanhla\b/gi, ipa: 'ŋɬɑˈŋɬɑ', lang: 'zu-ZA', note: 'isiZulu: luck (lateral fricative)' },
  { pattern: /\bPhumzile\b/gi, ipa: 'pʰumˈziːle', lang: 'zu-ZA', note: 'isiZulu female name: rest' },
  { pattern: /\bThandeka\b/gi, ipa: 'tʰɑnˈdeːkɑ', lang: 'zu-ZA', note: 'isiZulu female name: loved one' },
  { pattern: /\bMakunyane\b/gi, alias: 'Mah koo nya neh', note: 'Common SA surname — keep vowel spacing clear for TTS' },
  { pattern: /\bMakhunyane\b/gi, alias: 'Mah khoo nya neh', note: 'Common SA surname — aspirated kh sound' },
  // Afrikaans names
  { pattern: /\bPieter\b/gi, ipa: 'ˈpiːtər', lang: 'af-ZA', note: 'Afrikaans male name' },
  { pattern: /\bJohannes\b/gi, ipa: 'juˈɦɑnəs', lang: 'af-ZA', note: 'Afrikaans male name' },
  { pattern: /\bMarietjie\b/gi, ipa: 'mɑˈriːki', lang: 'af-ZA', note: 'Afrikaans female name' },
  { pattern: /\bJannie\b/gi, ipa: 'ˈjɑni', lang: 'af-ZA', note: 'Afrikaans male name' },
  { pattern: /\bHendrik\b/gi, ipa: 'ˈɦɛndrɪk', lang: 'af-ZA', note: 'Afrikaans male name' },
];

// ---------------------------------------------------------------------------
// South African Place Names
// ---------------------------------------------------------------------------

const SA_PLACE_NAMES: PronunciationEntry[] = [
  { pattern: /\bTshwane\b/gi, ipa: 'ˈtʃwɑːne', note: 'Capital city (Pretoria metro)' },
  { pattern: /\bGauteng\b/gi, ipa: 'xɑʊˈtɛŋ', note: 'Province — guttural "g"' },
  { pattern: /\bKwaZulu[\s-]?Natal\b/gi, ipa: 'kwɑˈzuːlu nɑˈtɑːl', lang: 'zu-ZA', note: 'Province' },
  { pattern: /\bMpumalanga\b/gi, ipa: 'mpumɑˈlɑŋɡɑ', note: 'Province: where the sun rises' },
  { pattern: /\bLimpopo\b/gi, ipa: 'lɪmˈpoːpo', note: 'Province and river' },
  { pattern: /\bSoweto\b/gi, ipa: 'sɔˈweːto', lang: 'zu-ZA', note: 'SOuth WEstern TOwnships' },
  { pattern: /\bJohannesburg\b/gi, ipa: 'dʒoʊˈhænɪsbɜːrɡ', note: 'Largest SA city' },
  { pattern: /\bDurban\b/gi, ipa: 'ˈdɜːrbən', note: 'City in KZN' },
  { pattern: /\bCape\s+Town\b/gi, alias: 'Cape Town', note: 'Default English pronunciation is fine' },
  { pattern: /\bPolokwane\b/gi, ipa: 'pɔlɔˈkwɑːne', note: 'Limpopo capital' },
  { pattern: /\bBloemfontein\b/gi, ipa: 'ˈblumfɔnteɪn', lang: 'af-ZA', note: 'Free State capital' },
  { pattern: /\bPietermaritzburg\b/gi, ipa: 'ˌpiːtərˈmɑrɪtsbɜːrɡ', note: 'KZN capital' },
  { pattern: /\bMamelodi\b/gi, ipa: 'mɑmeˈloːdi', note: 'Township in Tshwane' },
  { pattern: /\bKhayelitsha\b/gi, ipa: 'kɑjeˈlitʃɑ', lang: 'xh-ZA', note: 'Cape Town township' },
];

// ---------------------------------------------------------------------------
// Master Dictionary (order matters — more specific patterns first)
// ---------------------------------------------------------------------------

export const PRONUNCIATION_DICTIONARY: PronunciationEntry[] = [
  ...BRAND_NAMES,
  ...SA_LANGUAGE_NAMES,
  ...EDUCATIONAL_TERMS,
  ...SA_LETTER_PRONUNCIATIONS, // Before common words so "letter Z" matches before generic Z
  ...SA_PERSONAL_NAMES,
  ...SA_PLACE_NAMES,
  ...SA_COMMON_WORDS,
  ...SA_SLANG,
  ...TECH_ABBREVIATIONS, // Last so "AI" doesn't override "Dash AI"
];

// ---------------------------------------------------------------------------
// Lookup Helpers
// ---------------------------------------------------------------------------

/**
 * Find the first matching pronunciation entry for a given token.
 */
export function findPronunciation(text: string): PronunciationEntry | null {
  for (const entry of PRONUNCIATION_DICTIONARY) {
    if (entry.pattern.test(text)) {
      // Reset lastIndex for global regexes
      entry.pattern.lastIndex = 0;
      return entry;
    }
  }
  return null;
}

/**
 * Apply all pronunciation substitutions to plain text.
 * Returns text with SSML `<sub>` tags inserted for aliases.
 * Use this when building SSML for Azure TTS.
 */
export function applyPronunciationSSML(text: string): string {
  let result = text;

  for (const entry of PRONUNCIATION_DICTIONARY) {
    if (!entry.alias && !entry.ipa) continue;

    result = result.replace(entry.pattern, (matched) => {
      // Prefer IPA phoneme if available
      if (entry.ipa) {
        const langOpen = entry.lang ? `<lang xml:lang="${entry.lang}">` : '';
        const langClose = entry.lang ? '</lang>' : '';
        return `${langOpen}<phoneme alphabet="ipa" ph="${entry.ipa}">${matched}</phoneme>${langClose}`;
      }
      // Fall back to sub alias
      if (entry.alias) {
        return `<sub alias="${entry.alias}">${matched}</sub>`;
      }
      return matched;
    });

    // Reset lastIndex for global regexes
    entry.pattern.lastIndex = 0;
  }

  return result;
}

/**
 * Apply pronunciation substitutions as plain text (no SSML tags).
 * Used by `normalizeForTTS()` when the output is plain text
 * (e.g., for device-native TTS that doesn't support SSML).
 */
export function applyPronunciationPlainText(text: string): string {
  let result = text;

  for (const entry of PRONUNCIATION_DICTIONARY) {
    if (!entry.alias) continue;

    result = result.replace(entry.pattern, entry.alias);
    entry.pattern.lastIndex = 0;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Language inline switching helper
// ---------------------------------------------------------------------------

/**
 * Wrap a text segment in SSML `<lang>` tags for inline language switching.
 * Azure Neural voices can switch pronunciation models mid-utterance.
 *
 * @example
 * wrapInLangTag('Sawubona', 'zu-ZA')
 * // → '<lang xml:lang="zu-ZA">Sawubona</lang>'
 */
export function wrapInLangTag(text: string, bcp47: string): string {
  return `<lang xml:lang="${bcp47}">${text}</lang>`;
}

/**
 * Auto-detect and wrap known SA words/phrases with appropriate `<lang>` tags.
 * Scans text for entries in the dictionary that have a `lang` property and
 * wraps them in SSML `<lang>` elements.
 */
export function applyInlineLangSwitching(text: string): string {
  let result = text;

  for (const entry of PRONUNCIATION_DICTIONARY) {
    if (!entry.lang) continue;

    result = result.replace(entry.pattern, (matched) => {
      return `<lang xml:lang="${entry.lang}">${matched}</lang>`;
    });

    entry.pattern.lastIndex = 0;
  }

  return result;
}
