/**
 * Pure utility helpers for the registrations hook.
 */

import { assertSupabase } from '@/lib/supabase';
import type { Registration, PostgrestErrorLike } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STUDENT_ID_SEQUENCE_LENGTH = 4;
export const STUDENT_ID_MAX_ATTEMPTS = 6;
export const EDUDASH_COMMUNITY_SCHOOL_ID = '00000000-0000-0000-0000-000000000001';
export const EDUDASH_MAIN_SCHOOL_ID = '00000000-0000-0000-0000-000000000003';

// ---------------------------------------------------------------------------
// Student-ID generation
// ---------------------------------------------------------------------------

export const normalizeOrgCode = (value: string | null | undefined): string => {
  const cleaned = (value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
  if (cleaned.length >= 3) return cleaned.slice(0, 3);
  if (cleaned.length > 0) return cleaned.padEnd(3, 'X');
  return 'STU';
};

export const getStudentIdPrefix = (orgName: string | null | undefined): string => {
  const year = new Date().getFullYear().toString().slice(-2);
  return `${normalizeOrgCode(orgName)}-${year}-`;
};

export const parseStudentSequence = (studentId: string, prefix: string): number | null => {
  if (!studentId.startsWith(prefix)) return null;
  const suffix = studentId.slice(prefix.length);
  const parsed = Number.parseInt(suffix, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

export const isDuplicateStudentIdError = (error: PostgrestErrorLike | null): boolean => {
  if (!error || error.code !== '23505') return false;
  return (error.message || error.details || '').includes('students_student_id_key');
};

export type SupabaseClient = ReturnType<typeof assertSupabase>;

export const getLastStudentSequence = async (
  supabase: SupabaseClient,
  prefix: string,
): Promise<number> => {
  const { data: lastStudent } = await supabase
    .from('students')
    .select('student_id')
    .like('student_id', `${prefix}%`)
    .order('student_id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastStudent?.student_id) {
    const parsed = parseStudentSequence(lastStudent.student_id, prefix);
    if (parsed !== null) return parsed;
  }

  const { count } = await supabase
    .from('students')
    .select('id', { count: 'exact', head: true })
    .like('student_id', `${prefix}%`);

  return count ?? 0;
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const hasValidPopUrl = (value?: string | null): boolean => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (['pending', 'n/a', 'na', 'none', 'null', 'undefined'].includes(normalized)) {
    return false;
  }
  return true;
};

export const canApprove = (item: Registration): boolean => {
  const hasFee = (item.registration_fee_amount || 0) > 0;
  const hasPop = hasValidPopUrl(item.proof_of_payment_url);

  if (item.status !== 'pending') return false;

  if (item.source === 'aftercare') {
    if (hasFee) return !!item.payment_verified || hasPop;
    return true;
  }

  if (item.source === 'edusite') {
    if (!hasFee) return true;
    return !!item.payment_verified;
  }

  // In-app
  if (hasFee) return !!item.payment_verified || hasPop;
  return true;
};

// ---------------------------------------------------------------------------
// Date / URL helpers
// ---------------------------------------------------------------------------

export const getStartMonthIso = (offset: number): string => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  // Use local date parts to avoid UTC-offset shifting the date (e.g. UTC+2 → previous day)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
};

export const buildPopUploadLink = (
  registrationId: string,
  recipientEmail?: string,
): string => {
  const baseUrl =
    process.env.EXPO_PUBLIC_WEBSITE_URL ||
    process.env.EXPO_PUBLIC_WEB_URL ||
    'https://www.edudashpro.org.za';
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  const emailParam = recipientEmail
    ? `&email=${encodeURIComponent(recipientEmail)}`
    : '';
  return `${cleanBaseUrl}/registration/pop-upload?registration_id=${encodeURIComponent(registrationId)}${emailParam}`;
};
