import { normalizeForTTS, normalizeForTTSPhonics } from '../ttsNormalize';

describe('ttsNormalize', () => {
  it('expands contractions to reduce pronunciation drift', () => {
    const out = normalizeForTTS("I'm Dash and I can't wait");
    expect(out).toContain('I am Dash');
    expect(out).toContain('cannot');
  });

  it('converts spaced repeated consonants to sustained sounds', () => {
    const out = normalizeForTTS('say s s s then m m m now');
    expect(out).toContain('sss');
    expect(out).toContain('mmm');
    expect(out).not.toContain('s s s');
    expect(out).not.toContain('m m m');
  });

  it('converts repeated letter cues to phoneme markers in phonics mode', () => {
    const out = normalizeForTTS('say s s s, then m-m-m', {
      phonicsMode: true,
      preservePhonicsMarkers: true,
    });
    expect(out).toContain('/s/');
    expect(out).toContain('/m/');
    expect(out).not.toContain('s s s');
    expect(out).not.toContain('m-m-m');
  });

  it('converts continuous sustained sounds in phonics mode', () => {
    const out = normalizeForTTS('Say ssss then mmmm', {
      phonicsMode: true,
      preservePhonicsMarkers: true,
    });
    expect(out).toContain('/s/');
    expect(out).toContain('/m/');
    expect(out).not.toContain('ssss');
    expect(out).not.toContain('mmmm');
  });

  it('converts repeated digraph sounds in phonics mode', () => {
    const out = normalizeForTTS('Say sh sh sh and th-th-th', {
      phonicsMode: true,
      preservePhonicsMarkers: true,
    });
    expect(out).toContain('/sh/');
    expect(out).toContain('/th/');
  });

  it('preserves phonics markers in phonics mode', () => {
    const out = normalizeForTTS('/b/ and [c] and c-a-t', {
      phonicsMode: true,
      preservePhonicsMarkers: true,
    });
    expect(out).toContain('/b/');
    expect(out).toContain('[c]');
    expect(out).toContain('c-a-t');
  });

  it('phonics helper keeps marker punctuation', () => {
    const out = normalizeForTTSPhonics('blend c-a-t with /b/');
    expect(out).toContain('c-a-t');
    expect(out).toContain('/b/');
  });

  it('strips slash markers in non-phonics output so TTS does not read "/"', () => {
    const out = normalizeForTTS('Say /s/ then /m/ for me.', {
      phonicsMode: false,
      preservePhonicsMarkers: false,
    });
    expect(out).toContain('s');
    expect(out).toContain('m');
    expect(out).not.toContain('/');
  });

  it('fixes common contraction typo: "It socks" -> "It\'s socks"', () => {
    const out = normalizeForTTS('It socks.');
    expect(out).toContain("It's socks");
  });

  it('keeps multiple-choice labels explicit in phonics mode', () => {
    const out = normalizeForTTS('A)42 B) 17 C) apple', {
      phonicsMode: true,
      preservePhonicsMarkers: true,
    });
    expect(out).toContain('Option A. 42');
    expect(out).toContain('Option B. 17');
    expect(out).toContain('Option C. apple');
    expect(out).not.toContain('/a/');
  });

  it('normalizes EduDash brand variants into one speakable product name', () => {
    const out = normalizeForTTS('Welcome to E D U DashPro platform.');
    expect(out).toContain('Edyoo-dash Pro');
    expect(out).not.toContain('E D U');
  });

  it('keeps PDF acronym compact for natural speech pacing', () => {
    const out = normalizeForTTS('Please open P. D. F. now and then share the PDF link.');
    expect(out).toContain('open PDF now');
    expect(out).toContain('share the PDF link');
    expect(out).not.toContain('P. D. F.');
    expect(out).not.toContain('P.D.F.');
  });

  it('strips token usage footer lines from spoken output', () => {
    const out = normalizeForTTS('Great plan.\n📊 2,561 tokens used');
    expect(out).toContain('Great plan');
    expect(out.toLowerCase()).not.toContain('tokens used');
  });

  it('strips bold markdown (**text**) from spoken output', () => {
    const out = normalizeForTTS('This is **important** information');
    expect(out).toContain('This is important information');
    expect(out).not.toContain('**');
  });

  it('strips bold+italic markdown (***text***) from spoken output', () => {
    const out = normalizeForTTS('This is ***very important*** to know');
    expect(out).toContain('very important');
    expect(out).not.toContain('***');
    expect(out).not.toContain('**');
  });

  it('strips header markers (## Heading) from spoken output', () => {
    const out = normalizeForTTS('## Important Topic\nHere is some content');
    expect(out).toContain('Important Topic');
    expect(out).not.toContain('##');
  });

  it('strips header markers without trailing space (##Heading)', () => {
    const out = normalizeForTTS('##Heading\nContent follows');
    expect(out).toContain('Heading');
    expect(out).not.toContain('##');
  });

  it('strips unclosed bold markers (**text without closing)', () => {
    const out = normalizeForTTS('Here is **important information about learning');
    expect(out).toContain('important information');
    expect(out).not.toContain('**');
  });

  it('strips multiple markdown elements in a single response', () => {
    const out = normalizeForTTS('## Topic\n\n**Key points:**\n- First item\n- *Second* item');
    expect(out).toContain('Topic');
    expect(out).toContain('Key points:');
    expect(out).toContain('First item');
    expect(out).toContain('Second item');
    expect(out).not.toContain('##');
    expect(out).not.toContain('**');
    expect(out).not.toContain('*');
  });
});
