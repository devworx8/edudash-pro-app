import { assertSupabase } from '@/lib/supabase';
import { assertQuotaForService } from '@/lib/ai/guards';

export interface DashGeneratedImage {
  id: string;
  bucket: string;
  path: string;
  signed_url: string;
  mime_type: string;
  prompt: string;
  width: number;
  height: number;
  provider: 'openai' | 'google';
  model: string;
  expires_at: string;
}

export type ImageCostMode = 'eco' | 'balanced' | 'premium';
export type ImageProviderPreference = 'auto' | 'openai' | 'imagen';

export interface GenerateDashImageParams {
  prompt: string;
  size?: '1024x1024' | '1536x1024' | '1024x1536';
  quality?: 'low' | 'medium' | 'high';
  style?: 'natural' | 'vivid';
  costMode?: ImageCostMode;
  providerPreference?: ImageProviderPreference;
  scope?: 'parent' | 'teacher' | 'principal' | 'student' | 'admin' | 'guest';
}

export interface GenerateDashImageResult {
  content: string;
  model: string;
  provider?: 'openai' | 'google';
  fallbackUsed?: boolean;
  fallbackReason?: string;
  generatedImages: DashGeneratedImage[];
}

export class DashImageGenerationError extends Error {
  code: string;
  status?: number;
  details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status?: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DashImageGenerationError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const parseInvokeError = async (error: any): Promise<DashImageGenerationError> => {
  const context = error?.context;
  if (context && typeof context === 'object') {
    try {
      const payload = await context.json();
      return new DashImageGenerationError(
        String(payload?.error || 'image_generation_failed'),
        String(payload?.message || error?.message || 'Image generation failed'),
        typeof context.status === 'number' ? context.status : undefined,
        payload || undefined,
      );
    } catch {
      // Fallback below.
    }
  }

  return new DashImageGenerationError(
    'image_generation_failed',
    String(error?.message || 'Image generation failed'),
    undefined,
  );
};

export async function generateDashImage(
  params: GenerateDashImageParams,
): Promise<GenerateDashImageResult> {
  const prompt = params.prompt.trim();
  if (!prompt) {
    throw new DashImageGenerationError('invalid_prompt', 'Please enter an image prompt.');
  }

  // §3.1: Quota pre-check before AI call
  const imgQuota = await assertQuotaForService('chat_message');
  if (!imgQuota.allowed) throw new DashImageGenerationError('quota_exceeded', 'AI quota exceeded — please upgrade or try again later.');

  const supabase = assertSupabase();
  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    body: {
      scope: params.scope || 'parent',
      service_type: 'image_generation',
      payload: {
        prompt,
        image_options: {
          size: params.size || '1024x1024',
          quality: params.quality || 'medium',
          style: params.style || 'vivid',
          cost_mode: params.costMode || 'balanced',
          provider_preference: params.providerPreference || 'auto',
        },
      },
      prefer_openai: params.providerPreference !== 'imagen',
      enable_tools: false,
      stream: false,
      metadata: {
        source: 'dash_image_studio',
        cost_mode: params.costMode || 'balanced',
        provider_preference: params.providerPreference || 'auto',
      },
    },
  });

  if (error) {
    throw await parseInvokeError(error);
  }

  const generatedImages = Array.isArray(data?.generated_images)
    ? (data.generated_images as DashGeneratedImage[])
    : [];

  if (generatedImages.length === 0) {
    throw new DashImageGenerationError(
      'empty_image_response',
      'Dash did not return a generated image. Please try again.',
    );
  }

  return {
    content: String(data?.content || 'Image generated'),
    model: String(data?.model || 'gpt-image-1'),
    provider: data?.provider === 'google' ? 'google' : data?.provider === 'openai' ? 'openai' : undefined,
    fallbackUsed: Boolean(data?.fallback_used),
    fallbackReason: typeof data?.fallback_reason === 'string' ? data.fallback_reason : undefined,
    generatedImages,
  };
}
