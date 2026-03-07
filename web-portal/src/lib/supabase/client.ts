'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { AuthChangeEvent } from '@supabase/supabase-js';

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  browserClient = createBrowserClient(url, anon, {
    auth: {
      storageKey: 'edudash-auth-session',
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      debug: process.env.NEXT_PUBLIC_DEBUG_SUPABASE === 'true',
    },
  });

  // Minimal safe debugging (no secrets)
  if (process.env.NODE_ENV !== 'production') {
    try {
      const meta = {
        hasUrl: !!url,
        hasAnon: !!anon,
        urlLength: url?.length || 0,
        anonLength: anon?.length || 0,
      };
      console.log('[Supabase] Web client initialized', meta);
    } catch { /* noop */ }
  }

  // Global auth events
  try {
    browserClient.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === 'SIGNED_OUT') {
        try {
          const keysToClear = [
            'edudash-auth-session',
            'edudash_session',
            'edudash_profile',
            'edudash_user_session',
            'edudash_user_profile',
            'edudash_active_child_id',
          ];
          keysToClear.forEach((key) => localStorage.removeItem(key));
        } catch { /* noop */ }
      }
    });
  } catch { /* noop */ }

  return browserClient;
}

/**
 * Helper function to get a Supabase client instance with guaranteed availability.
 * Throws an error if the client cannot be initialized.
 */
export function assertSupabase() {
  const client = createClient();
  if (!client) {
    throw new Error('Supabase client not initialized');
  }
  return client;
}
