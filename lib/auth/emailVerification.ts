import type { User } from '@supabase/supabase-js';

type EmailVerificationUser = Pick<User, 'confirmed_at' | 'email_confirmed_at'>;

export function isEmailVerified(user: EmailVerificationUser | null | undefined): boolean {
  return Boolean(user?.email_confirmed_at || user?.confirmed_at);
}
