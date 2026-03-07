'use client';

import { createClient } from '@/lib/supabase/client';

const AUTH_STORAGE_KEYS = [
  'edudash-auth-session',
  'edudash_session',
  'edudash_profile',
  'edudash_user_session',
  'edudash_user_profile',
  'edudash_active_child_id',
];

export async function signOutEverywhere(options?: { timeoutMs?: number }) {
  const supabase = createClient();
  const timeoutMs = options?.timeoutMs ?? 2500;

  try {
    await Promise.race([
      supabase.auth.signOut(),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {
    // Ignore sign-out errors; we'll enforce local cleanup next
  }

  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // Ignore local sign-out errors
  }

  try {
    await fetch('/auth/signout', { method: 'POST' });
  } catch {
    // Ignore server sign-out errors
  }

  if (typeof window !== 'undefined') {
    try {
      AUTH_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch {
      // Ignore storage cleanup errors
    }
  }
}
