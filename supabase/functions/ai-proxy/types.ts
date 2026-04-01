// ── Shared types for ai-proxy ──────────────────────────────────────────────

export type JsonRecord = Record<string, unknown>;

export type ToolResult = {
  name: string;
  input: JsonRecord;
  output: JsonRecord;
  success: boolean;
};

export type GeneratedImage = {
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
};

export type ProviderResponse = {
  content: string;
  usage?: {
    tokens_in?: number;
    tokens_out?: number;
    cost?: number;
  };
  model?: string;
  tool_results?: ToolResult[];
  generated_images?: GeneratedImage[];
  provider?: 'openai' | 'google' | 'deepseek' | 'gemini';
  fallback_used?: boolean;
  fallback_reason?: string;
  /** Client-side tool calls that the AI requested but the server cannot execute */
  pending_tool_calls?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
};

export type ImageProvider = 'openai' | 'google';

export type ImageProviderErrorCode =
  | 'config_missing'
  | 'network_error'
  | 'provider_error'
  | 'rate_limited'
  | 'content_policy_violation'
  | 'invalid_request'
  | 'storage_error';

export type ImageProviderError = Error & {
  provider: ImageProvider;
  code: ImageProviderErrorCode;
  status?: number;
  retryable: boolean;
  details?: JsonRecord;
};