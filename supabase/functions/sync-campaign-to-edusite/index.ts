/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-edudash-sync-signature, x-edudash-sync-timestamp',
};

const SIGNATURE_HEADER = 'x-edudash-sync-signature';
const TIMESTAMP_HEADER = 'x-edudash-sync-timestamp';
const SIGNATURE_TTL_MS = 5 * 60 * 1000;

type SyncOperation = 'INSERT' | 'UPDATE' | 'DELETE' | 'FULL_SYNC';

interface SyncPayload {
  operation?: SyncOperation;
  record?: Record<string, unknown> | null;
  old_record?: Record<string, unknown> | null;
  full_sync?: boolean;
}

const ALLOWED_FIELDS = new Set([
  'id',
  'organization_id',
  'name',
  'campaign_type',
  'description',
  'terms_conditions',
  'target_audience',
  'target_classes',
  'discount_type',
  'discount_value',
  'max_discount_amount',
  'promo_code',
  'max_redemptions',
  'current_redemptions',
  'min_purchase_amount',
  'start_date',
  'end_date',
  'auto_apply',
  'auto_apply_conditions',
  'active',
  'featured',
  'views_count',
  'conversions_count',
  'created_at',
  'updated_at',
  'discount_percentage',
  'discount_amount',
  'coupon_code',
]);

function pickCampaignFields(record: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (ALLOWED_FIELDS.has(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function sha256Hex(input: string): Promise<string> {
  const payload = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyRequestSignature(req: Request, rawBody: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sharedSecret = (Deno.env.get('EDUSITE_SYNC_SHARED_SECRET') || '').trim();
  if (!sharedSecret) {
    return { ok: true };
  }

  const signedAt = req.headers.get(TIMESTAMP_HEADER) || '';
  const signature = req.headers.get(SIGNATURE_HEADER) || '';

  if (!signedAt || !signature) {
    return { ok: false, error: 'Missing sync signature headers' };
  }

  const signedAtMs = Number.parseInt(signedAt, 10);
  if (!Number.isFinite(signedAtMs)) {
    return { ok: false, error: 'Invalid sync signature timestamp' };
  }

  if (Math.abs(Date.now() - signedAtMs) > SIGNATURE_TTL_MS) {
    return { ok: false, error: 'Expired sync signature timestamp' };
  }

  const expectedSignature = await sha256Hex(`${rawBody}:${signedAt}:${sharedSecret}`);
  if (!constantTimeEqual(signature, expectedSignature)) {
    return { ok: false, error: 'Invalid sync signature' };
  }

  return { ok: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      status: 'ok',
      service: 'sync-campaign-to-edusite',
      signature_required: Boolean((Deno.env.get('EDUSITE_SYNC_SHARED_SECRET') || '').trim()),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const rawBody = await req.text();
    const signatureCheck = await verifyRequestSignature(req, rawBody);
    if (!signatureCheck.ok) {
      return new Response(JSON.stringify({ error: signatureCheck.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const edusiteUrl = Deno.env.get('EDUSITE_SUPABASE_URL')
      || 'https://bppuzibjlxgfwrujzfsz.supabase.co';
    const edusiteKey = Deno.env.get('EDUSITE_SUPABASE_SERVICE_ROLE_KEY');

    if (!edusiteKey) {
      return new Response(JSON.stringify({ error: 'EduSitePro service key missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const edusite = createClient(edusiteUrl, edusiteKey);
    const payload = ((rawBody ? JSON.parse(rawBody) : {}) as SyncPayload);
    const operation = payload.operation || 'UPDATE';
    const isFullSync = operation === 'FULL_SYNC' || payload.full_sync === true;

    if (isFullSync) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      if (!supabaseUrl || !supabaseKey) {
        return new Response(JSON.stringify({ error: 'Supabase service role key missing for full sync' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase
        .from('marketing_campaigns')
        .select('*');

      if (error) throw error;

      const campaigns = (data || [])
        .map((row) => pickCampaignFields(row as Record<string, unknown>))
        .filter((row) => row.id);

      if (campaigns.length > 0) {
        const { error: upsertError } = await edusite
          .from('marketing_campaigns')
          .upsert(campaigns, { onConflict: 'id' });
        if (upsertError) throw upsertError;
      }

      let removed = 0;
      const orgIds = Array.from(new Set(
        campaigns
          .map((row) => row.organization_id as string | undefined)
          .filter((value): value is string => Boolean(value))
      ));

      if (orgIds.length > 0) {
        const { data: existing, error: existingError } = await edusite
          .from('marketing_campaigns')
          .select('id, organization_id')
          .in('organization_id', orgIds);

        if (existingError) throw existingError;

        const currentIds = new Set(campaigns.map((row) => row.id as string));
        const staleIds = (existing || [])
          .filter((row) => !currentIds.has(row.id as string))
          .map((row) => row.id as string);

        if (staleIds.length > 0) {
          const { error: deleteError } = await edusite
            .from('marketing_campaigns')
            .delete()
            .in('id', staleIds);
          if (deleteError) throw deleteError;
          removed = staleIds.length;
        }
      }

      return new Response(JSON.stringify({
        success: true,
        operation: 'FULL_SYNC',
        synced: campaigns.length,
        removed,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const record = payload.record || payload.old_record || null;

    if (!record) {
      return new Response(JSON.stringify({ error: 'Missing campaign record' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const campaignId = record.id as string | undefined;
    const promoCode = (record.promo_code as string | undefined) || null;

    if (operation === 'DELETE') {
      if (campaignId) {
        const { error } = await edusite
          .from('marketing_campaigns')
          .delete()
          .eq('id', campaignId);
        if (error) throw error;
      } else if (promoCode) {
        const { error } = await edusite
          .from('marketing_campaigns')
          .delete()
          .eq('promo_code', promoCode);
        if (error) throw error;
      }

      return new Response(JSON.stringify({ success: true, operation: 'DELETE' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const campaignPayload = pickCampaignFields(record);
    if (!campaignPayload.id) {
      return new Response(JSON.stringify({ error: 'Campaign id is required for sync' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error } = await edusite
      .from('marketing_campaigns')
      .upsert(campaignPayload, { onConflict: 'id' });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, operation }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[sync-campaign-to-edusite] Error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
