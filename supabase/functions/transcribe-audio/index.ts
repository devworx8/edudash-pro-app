/**
 * Transcribe Audio Edge Function
 * 
 * Transcribes audio using OpenAI Whisper API.
 * Used for voice note processing and voice-to-text features.
 * 
 * Expected body: { audio_url?: string, audio_base64?: string, language?: string }
 * Auth: Bearer token required
 * 
 * Returns: { text: string, language: string }
 */

import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const WHISPER_PROMPT_BASE =
  'Transcribe school voice notes with accurate punctuation and capitalization. ' +
  'Prefer these spellings: EduDash, Dash AI, superadmin, principal, CAPS, Grade R, PDF, worksheet, rubric, memorandum, phonics, letter sound, isiZulu, isiXhosa, isiNdebele, Sepedi, Sesotho, Setswana, SiSwati, Tshivenda, Xitsonga.';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

function normalizeWhisperLanguage(input: unknown): string | null {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw || raw === 'auto') return null;
  const base = raw.split('-')[0];
  return /^[a-z]{2,3}$/.test(base) ? base : null;
}

function buildWhisperPrompt(input: unknown): string {
  const custom = typeof input === 'string' ? input.trim() : '';
  const merged = custom
    ? `${WHISPER_PROMPT_BASE} ${custom}`
    : WHISPER_PROMPT_BASE;
  // whisper-1 prompt guidance only uses the tail; keep this concise.
  return merged.slice(0, 700);
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY!);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Quota check — prevent free-tier abuse
    const environment = Deno.env.get('ENVIRONMENT') || 'production';
    const devBypass = Deno.env.get('AI_QUOTA_BYPASS') === 'true' &&
                      (environment === 'development' || environment === 'local');

    if (!devBypass) {
      const quota = await supabase.rpc('check_ai_usage_limit', {
        p_user_id: user.id,
        p_request_type: 'stt',
      });

      if (quota.error) {
        console.error('[transcribe-audio] check_ai_usage_limit failed:', quota.error);
        return new Response(JSON.stringify({
          error: 'quota_check_failed',
          message: 'AI service is temporarily unavailable. Please try again in a few minutes.',
        }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const quotaData = quota.data as Record<string, unknown> | null;
      if (quotaData && typeof quotaData.allowed === 'boolean' && !quotaData.allowed) {
        return new Response(JSON.stringify({
          error: 'quota_exceeded',
          message: "You've reached your AI usage limit for this period. Upgrade for more.",
          details: quotaData,
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Transcription service not configured' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = await req.json();
    const { audio_url, audio_base64, audio_content_type, language, prompt } = body;

    if (!audio_url && !audio_base64) {
      return new Response(
        JSON.stringify({ error: 'Missing audio_url or audio_base64' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Resolve MIME type and file extension from client hint or sensible defaults.
    // Whisper-1 auto-detects format, but correct metadata avoids future breakage.
    const MIME_TO_EXT: Record<string, string> = {
      'audio/webm': 'webm',
      'audio/mp4': 'm4a',
      'audio/x-m4a': 'm4a',
      'audio/m4a': 'm4a',
      'audio/aac': 'aac',
      'audio/mpeg': 'mp3',
      'audio/ogg': 'ogg',
      'audio/wav': 'wav',
      'audio/flac': 'flac',
    };
    const resolvedMime = (typeof audio_content_type === 'string' && MIME_TO_EXT[audio_content_type])
      ? audio_content_type
      : 'audio/webm';
    const resolvedExt = MIME_TO_EXT[resolvedMime] || 'webm';

    // Get the audio data
    let audioBlob: Blob;
    if (audio_base64) {
      const binaryStr = atob(audio_base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      audioBlob = new Blob([bytes], { type: resolvedMime });
    } else {
      // Validate URL to prevent SSRF — only allow Supabase Storage signed URLs
      const supabaseHost = new URL(SUPABASE_URL).host;
      let audioUrlObj: URL;
      try {
        audioUrlObj = new URL(audio_url);
      } catch {
        return new Response(
          JSON.stringify({ error: 'Invalid audio_url' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      if (audioUrlObj.host !== supabaseHost) {
        return new Response(
          JSON.stringify({ error: 'audio_url must point to project storage' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const audioResp = await fetch(audio_url);
      if (!audioResp.ok) {
        throw new Error('Failed to download audio');
      }
      audioBlob = await audioResp.blob();
    }

    // Call OpenAI Whisper API
    const formData = new FormData();
    formData.append('file', audioBlob, `audio.${resolvedExt}`);
    formData.append('model', 'whisper-1');
    const whisperLanguage = normalizeWhisperLanguage(language);
    if (whisperLanguage) {
      formData.append('language', whisperLanguage);
    }
    formData.append('response_format', 'json');
    formData.append('temperature', '0.0');
    formData.append('prompt', buildWhisperPrompt(prompt));

    const whisperResp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!whisperResp.ok) {
      const errText = await whisperResp.text();
      console.error('[transcribe-audio] Whisper error:', whisperResp.status, errText);
      throw new Error('Transcription failed');
    }

    const result = await whisperResp.json();

    // Record usage (non-fatal) — audit log + quota counter
    try {
      await supabase.rpc('record_ai_usage', {
        p_user_id: user.id,
        p_feature_used: 'stt',
        p_model_used: 'whisper-1',
        p_tokens_used: 0,
        p_request_tokens: 0,
        p_response_tokens: 0,
        p_success: true,
        p_metadata: {
          scope: 'transcribe_audio',
          language: result.language || whisperLanguage || language || 'en',
          text_length: (result.text || '').length,
        },
      });
      await supabase.rpc('increment_ai_usage', {
        p_user_id: user.id,
        p_request_type: 'stt',
        p_status: 'success',
        p_metadata: { scope: 'transcribe_audio' },
      });
    } catch (usageErr) {
      console.warn('[transcribe-audio] usage recording failed (non-fatal):', usageErr);
    }

    return new Response(
      JSON.stringify({
        text: result.text || '',
        language: result.language || whisperLanguage || language || 'en',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[transcribe-audio] Error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
