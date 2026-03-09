/** Core approval routing for registration-detail (in-app + EduSite flows) */
import { assertSupabase } from '@/lib/supabase';
import type { Registration } from './types';
import { approveInApp } from './approveRegistration.inApp';
import { approveEduSite } from './approveRegistration.eduSite';

export async function approveRegistrationCore(
  registration: Registration,
  userId: string | undefined,
  startDateIso: string,
): Promise<{ studentIdCode: string }> {
  const supabase = assertSupabase();
  const enrollmentDate = startDateIso || new Date().toISOString().split('T')[0];

  if (registration.source === 'in-app') {
    return approveInApp(supabase, registration, userId, enrollmentDate);
  }
  return approveEduSite(supabase, registration, userId, enrollmentDate);
}
