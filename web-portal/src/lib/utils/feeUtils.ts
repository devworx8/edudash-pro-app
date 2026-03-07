export const isUniformFee = (
  feeType?: string | null,
  name?: string | null,
  description?: string | null
): boolean => {
  const text = `${feeType ?? ''} ${name ?? ''} ${description ?? ''}`.toLowerCase();
  return text.includes('uniform');
};

export const getUniformItemType = (
  feeType?: string | null,
  name?: string | null,
  description?: string | null
): 'set' | 'tshirt' | 'shorts' | null => {
  const text = `${feeType ?? ''} ${name ?? ''} ${description ?? ''}`.toLowerCase();
  const normalizedFeeType = (feeType ?? '').toLowerCase();

  if (/t[\s-]?shirt|tee|top/.test(text)) {
    return 'tshirt';
  }
  if (/shorts?\b/.test(text)) {
    return 'shorts';
  }
  if (
    normalizedFeeType === 'uniform' ||
    /\b(full|complete)\b.*\b(set|uniform)\b/.test(text) ||
    /\buniform\s*set\b/.test(text) ||
    /\bfull\s*set\b/.test(text)
  ) {
    return 'set';
  }
  if (text.includes('uniform')) {
    return 'set';
  }
  return null;
};
