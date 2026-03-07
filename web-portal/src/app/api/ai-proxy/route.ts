import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const supabase = await createClient();
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (sessionError || !accessToken) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Please sign in again and retry.' },
        { status: 401 }
      );
    }

    const { data, error } = await supabase.functions.invoke('ai-proxy', {
      body,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (error) {
      const status = Number((error as any)?.context?.status) || 500;
      return NextResponse.json(
        { error: (error as any)?.name || 'ai_proxy_error', message: error.message },
        { status }
      );
    }

    return NextResponse.json(data ?? {});
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
