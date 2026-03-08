import type { POPStatus } from './pop-review.constants';

export const normalizePOPStatus = (status: unknown): POPStatus => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'approved' || normalized === 'rejected' || normalized === 'needs_revision') {
    return normalized;
  }
  return 'pending';
};

export const includesCaseInsensitive = (value: unknown, search: string): boolean =>
  String(value ?? '').toLowerCase().includes(search);

export const hasValidListId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const formatAmount = (amount?: number) => {
  if (!amount) return 'N/A';
  return `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
};

export const formatDate = (date?: string) => {
  if (!date) return 'N/A';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export const formatMonth = (date?: string) => {
  if (!date) return 'N/A';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleDateString('en-ZA', {
    month: 'short',
    year: 'numeric',
  });
};

export const getStatusColor = (status?: string) => {
  switch (normalizePOPStatus(status)) {
    case 'approved': return '#10B981';
    case 'rejected': return '#EF4444';
    case 'needs_revision': return '#F59E0B';
    default: return '#6366F1';
  }
};

export const getStatusIcon = (status?: string) => {
  switch (normalizePOPStatus(status)) {
    case 'approved': return 'checkmark-circle';
    case 'rejected': return 'close-circle';
    case 'needs_revision': return 'alert-circle';
    default: return 'time';
  }
};
