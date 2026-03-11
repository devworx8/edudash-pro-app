const TRANSIENT_SUPABASE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function normalizeMessage(error: unknown): string {
  const parts = [
    (error as any)?.message,
    (error as any)?.details,
    (error as any)?.hint,
    (error as any)?.error_description,
    String(error || ''),
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return parts.join(' | ');
}

export function isTransientSupabaseReadError(error: unknown): boolean {
  const numericCode = Number((error as any)?.status || (error as any)?.code || 0);
  if (TRANSIENT_SUPABASE_STATUS_CODES.has(numericCode)) {
    return true;
  }

  const message = normalizeMessage(error);
  return (
    message.includes('http_response_incomplete') ||
    message.includes('failed to fetch') ||
    message.includes('network request failed') ||
    message.includes('network error') ||
    message.includes('fetch failed') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('proxy')
  );
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retrySupabaseRead<T>(
  operation: () => PromiseLike<{ data: T | null; error: any }>,
  options?: {
    attempts?: number;
    delayMs?: number;
  }
): Promise<{ data: T | null; error: any }> {
  const attempts = Math.max(1, options?.attempts ?? 3);
  const delayMs = Math.max(50, options?.delayMs ?? 150);

  let lastError: any = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await Promise.resolve(operation());
      if (!result?.error) {
        return result;
      }

      lastError = result.error;
      if (!isTransientSupabaseReadError(result.error) || attempt === attempts - 1) {
        return result;
      }
    } catch (error) {
      lastError = error;
      if (!isTransientSupabaseReadError(error) || attempt === attempts - 1) {
        return { data: null, error };
      }
    }

    await wait(delayMs * (attempt + 1));
  }

  return { data: null, error: lastError };
}
