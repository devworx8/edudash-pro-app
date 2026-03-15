import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization') || '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl) {
    return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json();
  const payload = body && typeof body === 'object' ? body : {};

  // Determine service type — map legacy aliases
  const action = payload.action || payload.service_type || 'dash_conversation';
  const isVision = action === 'vision_analysis' || action === 'image_analysis';
  const isImageGeneration = action === 'image_generation' || action === 'generate_image';
  const serviceType = isVision ? 'image_analysis' : isImageGeneration ? 'image_generation' : action;

  // Build images array for vision requests
  const images = isVision && payload.image_base64
    ? [{ data: payload.image_base64, media_type: payload.media_type || 'image/jpeg' }]
    : undefined;

  // Normalize ai-gateway payload shape to ai-proxy
  const proxyBody = {
    scope: payload.scope || 'parent',
    service_type: serviceType,
    payload: {
      prompt: payload.prompt || payload.userInput || payload.submission || '',
      messages: payload.messages || undefined,
      context: payload.context || undefined,
      model: payload.model || undefined,
      images,
      image_options: payload.image_options || payload.options || undefined,
    },
    enable_tools: payload.enable_tools ?? true,
    prefer_openai: isVision ? false : isImageGeneration ? true : (payload.prefer_openai ?? true),
    stream: payload.stream ?? false,
    metadata: payload.metadata || {},
  };

  const proxyResponse = await fetch(`${supabaseUrl}/functions/v1/ai-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify(proxyBody),
  });

  // Pass SSE stream directly — do not buffer, do not coerce to JSON
  if (payload.stream === true) {
    return new Response(proxyResponse.body, {
      status: proxyResponse.status,
      headers: {
        'Content-Type': proxyResponse.headers.get('Content-Type') ?? 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  const proxyText = await proxyResponse.text();
  return new Response(proxyText, {
    status: proxyResponse.status,
    headers: { 'Content-Type': 'application/json' },
  });
});
