/**
 * VoiceSnippetService — CRUD + expansion for user-defined voice snippets.
 *
 * Snippets are trigger-phrase → expansion-text mappings that fire during
 * transcript finalization. Example: "homework note" expands to a full
 * template paragraph.
 *
 * All data is user-scoped via RLS on voice_snippets table.
 *
 * @module lib/voice/snippetService
 */

import { assertSupabase } from '@/lib/supabase';

export interface VoiceSnippet {
  id: string;
  trigger_phrase: string;
  expansion_text: string;
  language: string;
  is_active: boolean;
  use_count: number;
}

let cachedSnippets: VoiceSnippet[] | null = null;
let cacheUserId: string | null = null;

/** Fetch active snippets for the current user (cached). */
export async function getUserSnippets(userId: string): Promise<VoiceSnippet[]> {
  if (cachedSnippets && cacheUserId === userId) return cachedSnippets;

  const supabase = assertSupabase();
  const { data, error } = await supabase
    .from('voice_snippets')
    .select('id, trigger_phrase, expansion_text, language, is_active, use_count')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('use_count', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[VoiceSnippetService] fetch failed:', error.message);
    return cachedSnippets || [];
  }

  cachedSnippets = (data || []) as VoiceSnippet[];
  cacheUserId = userId;
  return cachedSnippets;
}

/** Invalidate the snippet cache (call after mutations). */
export function invalidateSnippetCache(): void {
  cachedSnippets = null;
  cacheUserId = null;
}

/** Create a new snippet. */
export async function createSnippet(
  userId: string,
  triggerPhrase: string,
  expansionText: string,
  language = 'en',
): Promise<VoiceSnippet | null> {
  const supabase = assertSupabase();
  const { data, error } = await supabase
    .from('voice_snippets')
    .insert({
      user_id: userId,
      trigger_phrase: triggerPhrase.trim().toLowerCase(),
      expansion_text: expansionText.trim(),
      language,
    })
    .select()
    .single();

  if (error) {
    console.error('[VoiceSnippetService] create failed:', error.message);
    return null;
  }

  invalidateSnippetCache();
  return data as VoiceSnippet;
}

/** Delete a snippet by ID. */
export async function deleteSnippet(snippetId: string): Promise<boolean> {
  const supabase = assertSupabase();
  const { error } = await supabase
    .from('voice_snippets')
    .delete()
    .eq('id', snippetId);

  if (error) {
    console.error('[VoiceSnippetService] delete failed:', error.message);
    return false;
  }

  invalidateSnippetCache();
  return true;
}

/** Increment use_count for a snippet (fire-and-forget). */
async function bumpUseCount(snippetId: string): Promise<void> {
  try {
    const supabase = assertSupabase();
    await supabase.rpc('increment_snippet_use_count', { p_snippet_id: snippetId });
  } catch {
    // Non-fatal — RPC may not exist yet
  }
}

/**
 * Apply snippet expansion to a transcript.
 *
 * Performs case-insensitive whole-word matching of trigger phrases.
 * Returns the expanded text and the list of snippets that fired.
 */
export function applySnippets(
  transcript: string,
  snippets: VoiceSnippet[],
): { text: string; applied: VoiceSnippet[] } {
  if (!snippets.length || !transcript.trim()) {
    return { text: transcript, applied: [] };
  }

  const applied: VoiceSnippet[] = [];
  let result = transcript;

  for (const snippet of snippets) {
    // Build a word-boundary regex for the trigger phrase
    const escaped = snippet.trigger_phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`, 'gi');

    if (pattern.test(result)) {
      result = result.replace(pattern, snippet.expansion_text);
      applied.push(snippet);
      // Fire-and-forget usage tracking
      void bumpUseCount(snippet.id);
    }
  }

  return { text: result, applied };
}
