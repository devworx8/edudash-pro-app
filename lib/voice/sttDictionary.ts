/**
 * STT Dictionary — Domain-specific vocabulary for speech recognition
 *
 * Provides:
 * 1. `STT_CONTEXTUAL_STRINGS` — biasing hints for expo-speech-recognition
 *    (helps the recognizer prioritise EduDash-relevant words)
 * 2. `STT_CORRECTIONS` — post-hoc regex→string replacements for
 *    commonly misrecognised words and voice-dictation punctuation
 *
 * Shared between expoProvider.ts (contextual strings) and
 * formatTranscript.ts (corrections).
 *
 * Limit: ≤200 lines (WARP.md).
 */

// ── Contextual strings (speech recognizer vocabulary bias) ──────────
// Keep short phrases; Android 12+ / iOS supported.

export const STT_CONTEXTUAL_STRINGS: string[] = [
  // Brand
  'Dash',
  'EduDash',
  'EduDash Pro',
  'Dash AI',
  'Dash Tutor',
  'superadmin',
  'super admin',

  // App surfaces commonly spoken
  'dashboard',
  'principal',
  'principal dashboard',
  'parent dashboard',
  'teacher dashboard',
  'learner dashboard',
  'subscription',
  'notifications',
  'settings',

  // Commands users say to Dash
  'check',
  'explain',
  'help me',
  'homework',
  'practice',
  'quiz me',
  'test me',
  'mark my work',
  'did I get it right',
  'diagnose',
  'generate',
  'create a lesson',
  'grade this',
  'voice chunks',
  'chunking',
  'breaking up',
  'letter sound',
  'phoneme',

  // Educational
  'phonics',
  'blending',
  'segmenting',
  'rhyming',
  'CAPS',
  'STEM',
  'Grade R',
  'Grade 1',
  'Grade 2',
  'Grade 3',
  'Grade 4',
  'Grade 5',
  'Grade 6',
  'Grade 7',
  'worksheet',
  'lesson',
  'curriculum',
  'assessment',
  'rubric',
  'memorandum',

  // SA languages (frequently spoken in voice input)
  'isiZulu',
  'isiXhosa',
  'isiNdebele',
  'Sepedi',
  'Sesotho',
  'Setswana',
  'Tshivenda',
  'Xitsonga',
  'SiSwati',
  'Afrikaans',

  // SA greetings
  'Sawubona',
  'Molo',
  'Dumela',
  'Thobela',
  'Howzit',
];

// ── Post-hoc STT corrections ────────────────────────────────────────
// Order matters — more specific patterns first.

export const STT_CORRECTIONS: Array<[RegExp, string]> = [
  // ── Voice-dictation punctuation ──
  [/\bsend comma\b/gi, 'send,'],
  [/\bnew line\b/gi, '. '],
  [/\bfull stop\b/gi, '.'],
  [/\bquestion mark\b/gi, '?'],
  [/\bexclamation mark\b/gi, '!'],
  [/\bopen bracket\b/gi, '('],
  [/\bclose bracket\b/gi, ')'],
  [/\bcomma\b/gi, ','],

  // ── Acronym stabilization (avoid fragmented letter sequences) ──
  [/\bp[\s.\-]*d[\s.\-]*f\b/gi, 'PDF'],
  [/\bs[\s.\-]*t[\s.\-]*t\b/gi, 'STT'],
  [/\bt[\s.\-]*t[\s.\-]*s\b/gi, 'TTS'],
  [/\bc[\s.\-]*a[\s.\-]*p[\s.\-]*s\b/gi, 'CAPS'],

  // ── Generic misrecognitions ──
  [/\bit socks\b/gi, "it's socks"],
  [/\bfonics\b/gi, 'phonics'],
  [/\bpho?nics\b/gi, 'phonics'],
  [/\bsummeriz(e|ing|ed|er)\b/gi, 'summarize$1'],
  [/\bbreaking up junks\b/gi, 'breaking up chunks'],
  [/\bjunks\b/gi, 'chunks'],
  [/\bhi dish\b/gi, 'Hi Dash'],
  [/\bhey dish\b/gi, 'Hey Dash'],
  [/\bfootball station\b/gi, 'football stadium'],
  [/\bf\s*n\s*b\b/gi, 'FNB'],
  [/\bonges\b/gi, 'oranges'],
  [/\bstadiums?\s+at\s+fnb\b/gi, 'stadium at FNB'],

  // ── Common grammar/homophone STT errors ──
  [/\bwhat are meant\b/gi, 'what I meant'],
  [/\bwhat are mean\b/gi, 'what I mean'],
  [/\bwhat is meant was\b/gi, 'what I meant was'],
  [/\bthere she's still there\b/gi, "there, she's still there"],
  [/\bthat is not impossible but impossible\b/gi, 'that is not impossible but possible'],
  [/\bnot impossible but impossible\b/gi, 'not impossible but possible'],
  [/\bimpossible but impossible\b/gi, 'impossible but possible'],
  [/\bhe don't\b/gi, "he doesn't"],
  [/\bshe don't\b/gi, "she doesn't"],
  [/\bit don't\b/gi, "it doesn't"],
  [/\bthey was\b/gi, 'they were'],
  [/\bwe was\b/gi, 'we were'],
  [/\bi says\b/gi, 'I say'],
  [/\byou was\b/gi, 'you were'],
  [/\bcould of\b/gi, 'could have'],
  [/\bwould of\b/gi, 'would have'],
  [/\bshould of\b/gi, 'should have'],
  [/\bmust of\b/gi, 'must have'],
  [/\bsuppose to\b/gi, 'supposed to'],
  [/\buse to\b/gi, 'used to'],
  [/\ba lot of\b/gi, 'a lot of'],
  [/\balot\b/gi, 'a lot'],
  [/\bdefiantly\b/gi, 'definitely'],
  [/\bpacifically\b/gi, 'specifically'],

  // ── "superadmin" — the #1 misrecognised domain term ──
  [/\bsuper\s*8[\s-]*mon\b/gi, 'superadmin'],
  [/\bsuper\s*admin\b/gi, 'superadmin'],
  [/\bsuper\s+at\s*mon\b/gi, 'superadmin'],
  [/\bsuper\s*atm[io]n\b/gi, 'superadmin'],
  [/\bsuper\s*add?\s*min\b/gi, 'superadmin'],
  [/\bsuper\s*aid\s*men\b/gi, 'superadmin'],
  [/\bsuper\s*at?\s*men\b/gi, 'superadmin'],
  [/\bsuper\s*admit\b/gi, 'superadmin'],

  // ── "dashboard" ──
  [/\bdash\s*board\b/gi, 'dashboard'],
  [/\bdash\s*bolt\b/gi, 'dashboard'],
  [/\bdash\s*bored\b/gi, 'dashboard'],
  [/\bdust\s*board\b/gi, 'dashboard'],

  // ── "principal" ──
  [/\bprincip[ae]l?\b/gi, 'principal'],
  [/\bprincipal's\b/gi, "principal's"],

  // ── "subscription" ──
  [/\bsubscript\b/gi, 'subscription'],
  [/\bsub\s*scription\b/gi, 'subscription'],

  // ── "curriculum" ──
  [/\bcurricul[ae]m?\b/gi, 'curriculum'],

  // ── EduDash brand ──
  [/\bdestruct\b/gi, 'Dash check'],
  [/\bdash\s*check\b/gi, 'Dash check'],
  [/\bedge?\s*dash\b/gi, 'EduDash'],
  [/\bedu\s+dash\b/gi, 'EduDash'],
  [/\bedu\s*-?\s*dash\s+pro\b/gi, 'EduDash Pro'],
  [/\bedu\s*-?\s*dash\s*prow?\b/gi, 'EduDash Pro'],
  [/\bany\s*dash\b/gi, 'EduDash'],

  // ── SA language names ──
  [/\bissy?\s*zulu\b/gi, 'isiZulu'],
  [/\bissy?\s*cosa\b/gi, 'isiXhosa'],
  [/\bissy?\s*n?debele\b/gi, 'isiNdebele'],
  [/\bsay?\s*pedy?\b/gi, 'Sepedi'],
  [/\bsay?\s*sotho?\b/gi, 'Sesotho'],
  [/\bset?\s*swana\b/gi, 'Setswana'],
  [/\bsee?\s*swat[ie]\b/gi, 'SiSwati'],
  [/\btshi?\s*venda\b/gi, 'Tshivenda'],
  [/\bsit?\s*songa\b/gi, 'Xitsonga'],

  // ── SA greetings ──
  [/\bsaw?\s*you?\s*bona\b/gi, 'Sawubona'],
  [/\bdo?\s*mela\b/gi, 'Dumela'],
  [/\btho?\s*bela\b/gi, 'Thobela'],

  // ── Educational terms ──
  [/\bcaps\b/g, 'CAPS'],
  [/\bgrade\s*are\b/gi, 'Grade R'],
  [/\bgrade\s*our\b/gi, 'Grade R'],
  [/\bmemorandum\b/gi, 'memorandum'],
  [/\brubric\b/gi, 'rubric'],
  [/\bassessment\b/gi, 'assessment'],

  // ── Additional common STT misrecognitions ──
  [/\bi\s*mean\s*to\s*say\b/gi, 'I meant to say'],
  [/\bgon\s*na\b/gi, 'going to'],
  [/\bgot\s*ta\b/gi, 'got to'],
  [/\bwant\s*ta\b/gi, 'want to'],
  [/\bdon\s*ta\b/gi, 'do not'],
  [/\bcannot\s*wait\b/gi, "can't wait"],
  [/\bkind\s*of\s*a\b/gi, 'kind of'],
  [/\bsort\s*of\s*a\b/gi, 'sort of'],
  [/\bin\s*the\s*morning\b/gi, 'in the morning'],
  [/\bin\s*the\s*afternoon\b/gi, 'in the afternoon'],
  [/\bin\s*the\s*evening\b/gi, 'in the evening'],

  // ── Math and numbers ──
  [/\btimes\s*table\b/gi, 'times table'],
  [/\bmultiplication\s*table\b/gi, 'multiplication table'],
  [/\baddition\s*and\s*subtraction\b/gi, 'addition and subtraction'],
  [/\bplus\s*minus\b/gi, 'plus minus'],
  [/\bsquare\s*root\b/gi, 'square root'],
  [/\bpower\s*of\b/gi, 'power of'],
  [/\bto\s*the\s*power\b/gi, 'to the power'],

  // ── School subjects ──
  [/\bmath\s*lit\b/gi, 'Mathematical Literacy'],
  [/\bmeth\s*lit\b/gi, 'Mathematical Literacy'],
  [/\blife\s*orientation\b/gi, 'Life Orientation'],
  [/\blife\s*sciences?\b/gi, 'Life Sciences'],
  [/\bnatural\s*sciences?\b/gi, 'Natural Sciences'],
  [/\bsocial\s*sciences?\b/gi, 'Social Sciences'],
  [/\bphysical\s*sciences?\b/gi, 'Physical Sciences'],
  [/\baccounting\b/gi, 'Accounting'],
  [/\bbusiness\s*studies?\b/gi, 'Business Studies'],
  [/\beconomics\b/gi, 'Economics'],
  [/\bgeography\b/gi, 'Geography'],
  [/\bhistory\b/gi, 'History'],
  [/\benglish\b/gi, 'English'],
  [/\bafrikaans\b/gi, 'Afrikaans'],

  // ── Common South African terms ──
  [/\bmatric\b/gi, 'matric'],
  [/\bmatriculation\b/gi, 'matriculation'],
  [/\bnsce?\b/gi, 'NSC'],
  [/\bnational\s*senior\s*certificate\b/gi, 'National Senior Certificate'],
  [/\bieb\b/gi, 'IEB'],
  [/\bschool\s*fees?\b/gi, 'school fees'],
  [/\bhome\s*work\b/gi, 'homework'],
  [/\bhome\s*work\b/gi, 'homework'],
];

// ── Lightweight partial correction ─────────────────────────────────
// Applied to live partial results for immediate visual correction.
// Must be fast — only domain-specific replacements, no filler removal.

export function applyPartialCorrections(text: string): string {
  if (!text) return text;
  let result = text;
  for (const [pattern, replacement] of STT_CORRECTIONS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
