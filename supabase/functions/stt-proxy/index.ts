import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import {
  formatSttProxyResponse,
  normalizeSttProxyRequest,
} from './sttProxyUtils.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const TRANSCRIBE_AUDIO_ENDPOINT = `${SUPABASE_URL}/functions/v1/transcribe-audio`;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
    }

    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ error: 'Invalid session' }, 401, corsHeaders);
    }

    const body = (await req.json()) as Record<string, unknown>;
    const normalized = normalizeSttProxyRequest(body);

    let audioUrl = normalized.audioUrl || '';
    if (normalized.source === 'storage_path') {
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from(normalized.storageBucket)
        .createSignedUrl(String(normalized.storagePath || ''), 10 * 60);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        return jsonResponse(
          {
            error: 'Could not resolve storage_path',
            details: signedUrlError?.message || 'Signed URL generation failed',
          },
          400,
          corsHeaders,
        );
      }

      audioUrl = signedUrlData.signedUrl;
    }

    const transcribePayload: Record<string, unknown> = {
      language: normalized.language,
    };

    if (normalized.prompt) {
      transcribePayload.prompt = normalized.prompt;
    }
    if (normalized.audioContentType) {
      transcribePayload.audio_content_type = normalized.audioContentType;
    }
    if (normalized.source === 'audio_base64' && normalized.audioBase64) {
      transcribePayload.audio_base64 = normalized.audioBase64;
    } else if (audioUrl) {
      transcribePayload.audio_url = audioUrl;
    }

    const transcribeResp = await fetch(TRANSCRIBE_AUDIO_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify(transcribePayload),
    });

    const rawText = await transcribeResp.text();
    let transcribeData: Record<string, unknown> = {};

    try {
      transcribeData = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch {
      transcribeData = {};
    }

    if (!transcribeResp.ok) {
      return jsonResponse(
        {
          error: String(transcribeData.error || 'Transcription failed'),
          message: String(transcribeData.message || ''),
          details: transcribeData.details || null,
        },
        transcribeResp.status,
        corsHeaders,
      );
    }

    const response = formatSttProxyResponse({
      text: transcribeData.text || transcribeData.transcript || '',
      language: transcribeData.language || normalized.language,
      provider: transcribeData.provider || 'whisper-1',
      source: normalized.source,
    });

    return jsonResponse(response as unknown as Record<string, unknown>, 200, corsHeaders);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      500,
      corsHeaders,
    );
  }
});

