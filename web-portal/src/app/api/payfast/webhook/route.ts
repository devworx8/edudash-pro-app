import { NextRequest, NextResponse } from 'next/server';

/**
 * Public PayFast ITN endpoint (web).
 *
 * Supabase Edge Functions are behind an API gateway that requires an Authorization header.
 * PayFast ITN cannot send custom headers, so direct notify_url to Supabase returns:
 *   {"code":401,"message":"Missing authorization header"}
 *
 * This endpoint is safe to call publicly and proxies the raw ITN body to the Supabase
 * Edge Function `payfast-webhook` with the required headers.
 */

function getSupabaseConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!url || !anonKey) {
    throw new Error('Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)');
  }
  return { url, anonKey };
}

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'payfast-webhook-proxy' });
}

export async function POST(request: NextRequest) {
  try {
    const { url, anonKey } = getSupabaseConfig();
    const rawBody = await request.text(); // preserve raw body exactly
    const contentType = request.headers.get('content-type') || 'application/x-www-form-urlencoded';

    const targetUrl = `${url.replace(/\/$/, '')}/functions/v1/payfast-webhook`;
    const resp = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      body: rawBody,
    });

    const text = await resp.text();
    return new NextResponse(text || 'OK', {
      status: resp.status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[PayFast Webhook Proxy] Error:', msg);
    return new NextResponse('Server error', { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse('ok', {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
