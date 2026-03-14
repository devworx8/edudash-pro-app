import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

type JsonRecord = Record<string, unknown>;

type ImagenErrorCode =
  | 'config_missing'
  | 'network_error'
  | 'provider_error'
  | 'rate_limited'
  | 'content_policy_violation'
  | 'invalid_request'
  | 'storage_error';

type ImagenProviderError = Error & {
  provider: 'google';
  code: ImagenErrorCode;
  status?: number;
  retryable: boolean;
  details?: JsonRecord;
};

export type ImagenImageOptions = {
  size?: '1024x1024' | '1536x1024' | '1024x1536';
  quality?: 'low' | 'medium' | 'high';
  style?: 'natural' | 'vivid';
  background?: 'auto' | 'transparent' | 'opaque';
  moderation?: 'auto' | 'low';
};

export type ImagenGeneratedImage = {
  id: string;
  bucket: string;
  path: string;
  signed_url: string;
  mime_type: string;
  prompt: string;
  width: number;
  height: number;
  provider: 'google';
  model: string;
  expires_at: string;
};

const IMAGE_BUCKET = 'dash-generated-images';
const IMAGE_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24; // 24 hours

function getEnv(name: string): string | null {
  const value = Deno.env.get(name);
  return value && value.length > 0 ? value : null;
}

function createImagenError(params: {
  code: ImagenErrorCode;
  message: string;
  status?: number;
  retryable?: boolean;
  details?: JsonRecord;
}): ImagenProviderError {
  const error = new Error(params.message) as ImagenProviderError;
  error.provider = 'google';
  error.code = params.code;
  if (typeof params.status === 'number') {
    error.status = params.status;
  }
  error.retryable = params.retryable === true;
  if (params.details) {
    error.details = params.details;
  }
  return error;
}

function parseImageSize(size?: string): { width: number; height: number } {
  const [wRaw, hRaw] = String(size || '1024x1024').split('x');
  const width = Number.parseInt(wRaw || '1024', 10);
  const height = Number.parseInt(hRaw || '1024', 10);
  return {
    width: Number.isFinite(width) ? width : 1024,
    height: Number.isFinite(height) ? height : 1024,
  };
}

function mapAspectRatio(size?: string): string {
  const dims = parseImageSize(size);
  if (dims.width === dims.height) return '1:1';
  return dims.width > dims.height ? '3:2' : '2:3';
}

function toPngBytes(base64Image: string): Uint8Array {
  const payload = base64Image.startsWith('data:') ? base64Image.split(',', 2)[1] : base64Image;
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toBase64Url(value: string): string {
  return btoa(value).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

type GoogleServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
  project_id?: string;
};

function getGoogleServiceAccount(): GoogleServiceAccount | null {
  const raw = getEnv('GOOGLE_SERVICE_ACCOUNT_JSON') || getEnv('GOOGLE_SERVICE_ACCOUNT_KEY');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GoogleServiceAccount;
    if (!parsed?.client_email || !parsed?.private_key) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isImagenConfigured(): boolean {
  const serviceAccount = getGoogleServiceAccount();
  const projectId = getEnv('GOOGLE_CLOUD_PROJECT_ID') || serviceAccount?.project_id;
  return !!(serviceAccount && projectId);
}

async function getGoogleAccessToken(serviceAccount: GoogleServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: serviceAccount.token_uri || 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const unsignedToken = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsignedToken));
  const signedToken = `${unsignedToken}.${btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')}`;

  const tokenResponse = await fetch(serviceAccount.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedToken}`,
  });

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text();
    throw createImagenError({
      code: 'config_missing',
      message: `Google OAuth token exchange failed: ${tokenResponse.status} ${text}`,
      status: tokenResponse.status,
      retryable: tokenResponse.status >= 500 || tokenResponse.status === 429,
      details: { raw_error: text },
    });
  }

  const tokenPayload = (await tokenResponse.json()) as JsonRecord;
  const accessToken = typeof tokenPayload.access_token === 'string' ? tokenPayload.access_token : null;
  if (!accessToken) {
    throw createImagenError({
      code: 'config_missing',
      message: 'Google OAuth token response missing access_token',
      retryable: false,
    });
  }
  return accessToken;
}

function pickBase64Image(prediction: JsonRecord): string | null {
  const directCandidates = [
    prediction.bytesBase64Encoded,
    prediction.bytes_base64_encoded,
    prediction.b64_json,
    prediction.imageBytes,
    prediction.image_bytes,
  ];
  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.length > 50) {
      return candidate;
    }
  }

  const nestedImage = prediction.image;
  if (nestedImage && typeof nestedImage === 'object') {
    const nested = nestedImage as JsonRecord;
    const nestedCandidates = [
      nested.bytesBase64Encoded,
      nested.bytes_base64_encoded,
      nested.b64_json,
      nested.imageBytes,
      nested.image_bytes,
    ];
    for (const candidate of nestedCandidates) {
      if (typeof candidate === 'string' && candidate.length > 50) {
        return candidate;
      }
    }
  }

  return null;
}

export async function callImagenImageGeneration(params: {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  prompt: string;
  options?: ImagenImageOptions;
  requestedModel?: string | null;
}): Promise<{
  content: string;
  model: string;
  generated_images: ImagenGeneratedImage[];
  provider: 'google';
}> {
  const { supabase, userId, prompt, options, requestedModel } = params;
  const serviceAccount = getGoogleServiceAccount();
  const projectId = getEnv('GOOGLE_CLOUD_PROJECT_ID') || serviceAccount?.project_id || null;
  const location = getEnv('GOOGLE_CLOUD_LOCATION') || 'us-central1';
  const model = requestedModel || getEnv('IMAGEN_MODEL') || 'imagen-4-generate-001';

  if (!serviceAccount || !projectId) {
    throw createImagenError({
      code: 'config_missing',
      message: 'Imagen fallback is not configured. Missing GOOGLE_SERVICE_ACCOUNT_JSON and/or GOOGLE_CLOUD_PROJECT_ID.',
      status: 503,
      retryable: true,
    });
  }

  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken(serviceAccount);
  } catch (error) {
    if (error && typeof error === 'object' && 'provider' in (error as JsonRecord)) {
      throw error;
    }
    throw createImagenError({
      code: 'config_missing',
      message: `Failed to obtain Google access token: ${error instanceof Error ? error.message : String(error)}`,
      retryable: true,
    });
  }

  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;
  const requestBody = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio: mapAspectRatio(options?.size),
      personGeneration: 'allow_adult',
      safetyFilterLevel: 'block_medium_and_above',
    },
  };

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    throw createImagenError({
      code: 'network_error',
      message: `Imagen request failed: ${error instanceof Error ? error.message : String(error)}`,
      retryable: true,
    });
  }

  if (!response.ok) {
    const text = await response.text();
    const lower = text.toLowerCase();
    const isContentPolicy = response.status === 400 &&
      (lower.includes('safety') || lower.includes('policy') || lower.includes('blocked'));
    throw createImagenError({
      code: isContentPolicy
        ? 'content_policy_violation'
        : response.status === 429
          ? 'rate_limited'
          : response.status === 401 || response.status === 403
            ? 'config_missing'
            : response.status >= 500
              ? 'provider_error'
              : 'invalid_request',
      message: `Imagen generation error: ${response.status} ${text}`,
      status: response.status,
      retryable: !isContentPolicy && (response.status === 429 || response.status >= 500 || response.status === 401 || response.status === 403),
      details: { raw_error: text },
    });
  }

  const result = (await response.json()) as JsonRecord;
  const predictions = Array.isArray(result.predictions) ? result.predictions : [];
  if (predictions.length === 0) {
    throw createImagenError({
      code: 'provider_error',
      message: 'Imagen returned no predictions',
      retryable: true,
    });
  }

  const dims = parseImageSize(options?.size);
  const now = new Date();
  const generatedImages: ImagenGeneratedImage[] = [];
  for (let i = 0; i < predictions.length; i += 1) {
    const prediction = predictions[i];
    if (!prediction || typeof prediction !== 'object') continue;
    const b64 = pickBase64Image(prediction as JsonRecord);
    if (!b64) continue;

    const bytes = toPngBytes(b64);
    const imageId = crypto.randomUUID();
    const path = `${userId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${imageId}.png`;

    const upload = await supabase.storage.from(IMAGE_BUCKET).upload(path, bytes, {
      upsert: false,
      contentType: 'image/png',
      cacheControl: '3600',
    });
    if (upload.error) {
      throw createImagenError({
        code: 'storage_error',
        message: `Failed to store Imagen output: ${upload.error.message}`,
        retryable: false,
      });
    }

    const signed = await supabase.storage.from(IMAGE_BUCKET).createSignedUrl(path, IMAGE_SIGNED_URL_TTL_SECONDS);
    if (signed.error || !signed.data?.signedUrl) {
      throw createImagenError({
        code: 'storage_error',
        message: `Failed to sign Imagen URL: ${signed.error?.message || 'Unknown error'}`,
        retryable: false,
      });
    }

    generatedImages.push({
      id: imageId,
      bucket: IMAGE_BUCKET,
      path,
      signed_url: signed.data.signedUrl,
      mime_type: 'image/png',
      prompt,
      width: dims.width,
      height: dims.height,
      provider: 'google',
      model,
      expires_at: new Date(Date.now() + IMAGE_SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
    });
  }

  if (generatedImages.length === 0) {
    throw createImagenError({
      code: 'provider_error',
      message: 'Imagen response did not include renderable image bytes',
      retryable: true,
    });
  }

  return {
    content: 'Image generated successfully.',
    model,
    generated_images: generatedImages,
    provider: 'google',
  };
}
