import { PII_PATTERNS } from './config.ts';
import type { JsonRecord } from './types.ts';

export function getEnv(name: string): string | null {
  const value = Deno.env.get(name);
  return value && value.length > 0 ? value : null;
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

export function decodeBase64Url(value: string): string | null {
  if (!value) return null;
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = `${normalized}${'='.repeat(padLength)}`;
  try {
    return atob(padded);
  } catch {
    return null;
  }
}

export function inferJwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const payloadText = decodeBase64Url(parts[1]);
  if (!payloadText) return null;
  try {
    const payload = JSON.parse(payloadText) as Record<string, unknown>;
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

export function getBooleanFlag(name: string, fallback = true): boolean {
  const raw = (getEnv(name) || getEnv(`EXPO_PUBLIC_${name}`) || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  return fallback;
}

export function getAnthropicApiKey(): string | null {
  return (
    getEnv('ANTHROPIC_API_KEY') ||
    getEnv('SERVER_ANTHROPIC_API_KEY') ||
    getEnv('ANTHROPIC_API_KEY_2') ||
    getEnv('ANTHROPIC_API_KEY_SECONDARY')
  );
}

export function getOpenAIApiKey(): string | null {
  return (
    getEnv('OPENAI_API_KEY') ||
    getEnv('SERVER_OPENAI_API_KEY') ||
    getEnv('OPENAI_API_KEY_2')
  );
}

export function redactPII(text: string): string {
  if (!text || typeof text !== 'string') return text;
  let redacted = text;
  for (const { pattern, replacement } of PII_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
}

export function redactMessagesForProvider(messages: Array<JsonRecord>): Array<JsonRecord> {
  return messages.map((msg) => {
    const content = msg.content;
    if (typeof content === 'string') {
      return { ...msg, content: redactPII(content) };
    }
    if (Array.isArray(content)) {
      return {
        ...msg,
        content: content.map((part: any) => {
          if (part?.type === 'text' && typeof part.text === 'string') {
            return { ...part, text: redactPII(part.text) };
          }
          return part;
        }),
      };
    }
    return msg;
  });
}