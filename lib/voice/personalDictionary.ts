/**
 * PersonalDictionaryService — User-level STT correction learning.
 *
 * Spoken-form → canonical-form mappings that layer on top of the global
 * STT_CORRECTIONS in sttDictionary.ts. User corrections are fetched once
 * per session and applied after global corrections during transcript fmt.
 *
 * @module lib/voice/personalDictionary
 */

import { assertSupabase } from '@/lib/supabase';

export interface DictionaryEntry {
  id: string;
  spoken_form: string;
  canonical_form: string;
  language: string;
  source: string;
  use_count: number;
}

let cachedEntries: DictionaryEntry[] | null = null;
let cacheUserId: string | null = null;
let compiledPatterns: Array<{ entry: DictionaryEntry; regex: RegExp }> | null = null;

/** Fetch active dictionary entries for the current user (cached). */
export async function getUserDictionary(userId: string): Promise<DictionaryEntry[]> {
  if (cachedEntries && cacheUserId === userId) return cachedEntries;

  const supabase = assertSupabase();
  const { data, error } = await supabase
    .from('user_voice_dictionary')
    .select('id, spoken_form, canonical_form, language, source, use_count')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('use_count', { ascending: false })
    .limit(500);

  if (error) {
    console.error('[PersonalDict] fetch failed:', error.message);
    return cachedEntries || [];
  }

  cachedEntries = (data || []) as DictionaryEntry[];
  cacheUserId = userId;
  compiledPatterns = null; // Invalidate compiled patterns
  return cachedEntries;
}

/** Invalidate the dictionary cache. */
export function invalidateDictionaryCache(): void {
  cachedEntries = null;
  cacheUserId = null;
  compiledPatterns = null;
}

/** Save a user correction as a personal dictionary entry. */
export async function learnCorrection(
  userId: string,
  spokenForm: string,
  canonicalForm: string,
  language = 'en',
  source: 'manual' | 'correction' = 'correction',
): Promise<DictionaryEntry | null> {
  const supabase = assertSupabase();
  const { data, error } = await supabase
    .from('user_voice_dictionary')
    .upsert(
      {
        user_id: userId,
        spoken_form: spokenForm.trim().toLowerCase(),
        canonical_form: canonicalForm.trim(),
        language,
        source,
      },
      { onConflict: 'user_id,spoken_form,language' },
    )
    .select()
    .single();

  if (error) {
    console.error('[PersonalDict] learnCorrection failed:', error.message);
    return null;
  }

  invalidateDictionaryCache();
  return data as DictionaryEntry;
}

/** Delete a dictionary entry. */
export async function deleteDictionaryEntry(entryId: string): Promise<boolean> {
  const supabase = assertSupabase();
  const { error } = await supabase
    .from('user_voice_dictionary')
    .delete()
    .eq('id', entryId);

  if (error) {
    console.error('[PersonalDict] delete failed:', error.message);
    return false;
  }

  invalidateDictionaryCache();
  return true;
}

/**
 * Apply personal dictionary corrections to a transcript.
 *
 * Runs after the global STT_CORRECTIONS from sttDictionary.ts.
 * Uses pre-compiled regex patterns for performance.
 */
export function applyPersonalDictionary(
  text: string,
  entries: DictionaryEntry[],
): string {
  if (!entries.length || !text.trim()) return text;

  // Compile patterns lazily and cache
  if (!compiledPatterns || compiledPatterns.length !== entries.length) {
    compiledPatterns = entries.map((entry) => {
      const escaped = entry.spoken_form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return {
        entry,
        regex: new RegExp(`\\b${escaped}\\b`, 'gi'),
      };
    });
  }

  let result = text;
  for (const { regex, entry } of compiledPatterns) {
    result = result.replace(regex, entry.canonical_form);
  }

  return result;
}
