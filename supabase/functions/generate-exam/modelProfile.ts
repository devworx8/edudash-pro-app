export type ExamModelProfile = {
  code: 'starter_premium' | 'starter_standard' | 'default' | 'fallback';
  label: string;
  colorKey: 'success' | 'info' | 'warning';
  usage?: {
    used: number;
    limit: number;
    remaining: number;
  };
};

function normalizeModel(modelUsed: string): string {
  return String(modelUsed || '').trim().toLowerCase();
}

export function isFallbackModel(modelUsed: string): boolean {
  return normalizeModel(modelUsed).startsWith('fallback:');
}

export function isHighEndStarterModel(modelUsed: string): boolean {
  const normalized = normalizeModel(modelUsed);
  return normalized.length > 0 && !normalized.includes('haiku') && !normalized.startsWith('fallback:');
}

export function buildExamModelProfile(params: {
  modelUsed: string;
  isParentStarterTier: boolean;
  premiumUsed: number;
  premiumWindow: number;
}): ExamModelProfile {
  const { modelUsed, isParentStarterTier } = params;
  const premiumUsed = Math.max(0, Number(params.premiumUsed || 0));
  const premiumWindow = Math.max(0, Number(params.premiumWindow || 0));

  if (isFallbackModel(modelUsed)) {
    return {
      code: 'fallback',
      label: 'Fallback generation',
      colorKey: 'warning',
    };
  }

  if (!isParentStarterTier) {
    return {
      code: 'default',
      label: 'Standard model',
      colorKey: 'info',
    };
  }

  const remaining = Math.max(0, premiumWindow - premiumUsed);
  if (isHighEndStarterModel(modelUsed)) {
    return {
      code: 'starter_premium',
      label: 'Sonnet Boost',
      colorKey: 'success',
      usage: {
        used: premiumUsed,
        limit: premiumWindow,
        remaining,
      },
    };
  }

  return {
    code: 'starter_standard',
    label: 'Haiku 4x',
    colorKey: 'info',
    usage: {
      used: premiumUsed,
      limit: premiumWindow,
      remaining,
    },
  };
}

