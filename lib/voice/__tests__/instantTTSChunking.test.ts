import { splitIntoSpeechChunks } from '../instantTTS';

describe('splitIntoSpeechChunks', () => {
  it('returns empty array for empty input', () => {
    expect(splitIntoSpeechChunks('')).toEqual([]);
    expect(splitIntoSpeechChunks('   ')).toEqual([]);
  });

  it('returns single chunk for short text', () => {
    const text = 'Hello, how are you?';
    const chunks = splitIntoSpeechChunks(text);
    expect(chunks).toEqual([text]);
  });

  it('splits at sentence boundaries', () => {
    const text =
      'This is a first sentence that is long enough to fill the first chunk easily. This is a second sentence with more words. And this is a third one that adds more content for testing purposes. Plus a fourth sentence here.';
    const chunks = splitIntoSpeechChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    const rejoined = chunks.join(' ');
    expect(rejoined).toBe(text);
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(0);
    }
  });

  it('first chunk is small for fast time-to-first-audio', () => {
    const text =
      'First sentence here. Second sentence that is a bit longer. Third sentence with even more content to ensure we have enough text to trigger multiple chunks in the output. Fourth sentence. Fifth sentence.';
    const chunks = splitIntoSpeechChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].length).toBeLessThanOrEqual(130);
  });

  it('handles text with no sentence endings gracefully', () => {
    const words = Array(60).fill('word').join(' ');
    const chunks = splitIntoSpeechChunks(words);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks.join(' ')).toBe(words);
  });

  it('preserves all text without loss across chunks', () => {
    const text =
      'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump. The five boxing wizards jump quickly.';
    const chunks = splitIntoSpeechChunks(text);
    expect(chunks.join(' ')).toBe(text);
  });

  it('handles very long single sentence', () => {
    const longSentence = Array(100).fill('longword').join(' ');
    const chunks = splitIntoSpeechChunks(longSentence);
    expect(chunks.length).toBeGreaterThan(1);
    const rejoined = chunks.join(' ').trim();
    expect(rejoined).toBe(longSentence);
  });
});
