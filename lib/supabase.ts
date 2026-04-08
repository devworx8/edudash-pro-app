import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { logger } from './logger';
import { storage } from './storage';

const TAG = 'Supabase';

// Get environment variables from Expo Constants (works across all platforms)
const expoConfig = Constants.expoConfig?.extra || {};
const url = expoConfig.EXPO_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const anon = expoConfig.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
export const supabaseUrl = url;
export const supabaseAnonKey = anon;
const isTestEnvironment = process.env.NODE_ENV === 'test';
const isDevelopment = typeof __DEV__ !== 'undefined' && __DEV__ && !isTestEnvironment;
const enableSupabaseDebug = isDevelopment && process.env.EXPO_PUBLIC_DEBUG_SUPABASE === 'true';
const envName = process.env.EXPO_PUBLIC_ENVIRONMENT || process.env.NODE_ENV || 'unknown';

function buildSupabaseEnvMeta() {
  return {
    env: envName,
    hasExpoConfigUrl: Boolean(expoConfig.EXPO_PUBLIC_SUPABASE_URL),
    hasExpoConfigAnon: Boolean(expoConfig.EXPO_PUBLIC_SUPABASE_ANON_KEY),
    hasProcessEnvUrl: Boolean(process.env.EXPO_PUBLIC_SUPABASE_URL),
    hasProcessEnvAnon: Boolean(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
    hasUrl: Boolean(url),
    hasAnon: Boolean(anon),
    urlLength: url.length,
    anonLength: anon.length,
    urlPreview: url ? `${url.substring(0, 25)}...` : 'MISSING',
  };
}

function shouldSuppressSupabaseDebug(message: string): boolean {
  return (
    message.includes('GoTrueClient@') &&
    (
      message.includes('#_acquireLock') ||
      message.includes('#__loadSession()') ||
      message.includes('#_useSession') ||
      message.includes('#getSession() session from storage')
    )
  );
}

function logSupabaseDebug(message: string, ...args: any[]) {
  if (shouldSuppressSupabaseDebug(message)) {
    return;
  }
  logger.debug(TAG, message, ...args);
}

// Debug logging to diagnose environment variable loading
if (isDevelopment) {
  logger.debug(TAG, 'Init environment sources', buildSupabaseEnvMeta());
}

// Enhanced debugging for environment variable loading
try {
  if (isDevelopment) {
    logger.debug(TAG, 'Env summary', buildSupabaseEnvMeta());
  }
} catch (error) {
  try {
    logger.error(TAG, 'Debug bootstrap failed', error);
  } catch {
    /* Logger unavailable */
  }
}

// Use unified storage adapter (handles web/native automatically)
// Web: localStorage, Native: AsyncStorage
const storageAdapter = {
  getItem: (key: string) => storage.getItem(key),
  setItem: (key: string, value: string) => storage.setItem(key, value),
  removeItem: (key: string) => storage.removeItem(key),
};

let client: SupabaseClient | null = null;
if (url && anon) {
  const isWeb = Platform?.OS === 'web';
  
  client = createClient(url, anon, {
    auth: {
      storage: storageAdapter as any,
      // Enable auto-refresh on all platforms — web sessions were silently
      // expiring after 1 hour when this was disabled.
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: isWeb, // Allow URL detection on web for OAuth callbacks
      storageKey: 'edudash-auth-session',
      flowType: 'pkce', // Use PKCE flow for better security
      debug: enableSupabaseDebug ? logSupabaseDebug : false,
    },
  });

  if (client && isDevelopment) {
    logger.info(TAG, 'Client initialized successfully');
  }

  // NOTE: Module-level onAuthStateChange listener was removed.
  // Storage cleanup on SIGNED_OUT is handled by AuthContext's SIGNED_OUT handler
  // and the unified performSignOut function. Having a separate listener here
  // caused race conditions where storage was cleared before AuthContext saw the event.
}

// Helper function to assert supabase client exists
export function assertSupabase(): SupabaseClient {
  if (!client) {
    const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
    const isTest = process.env.NODE_ENV === 'test';
    
    if (isDev || isTest) {
      // Development/test environment - show detailed debugging info
      const resolvedUrl = url;
      const resolvedAnon = anon;
      
      let errorMsg = 'Supabase client not initialized.\n';
      
      if (!resolvedUrl && !resolvedAnon) {
        errorMsg += 'BOTH environment variables are missing:\n';
        errorMsg += '- EXPO_PUBLIC_SUPABASE_URL\n';
        errorMsg += '- EXPO_PUBLIC_SUPABASE_ANON_KEY\n';
      } else if (!resolvedUrl) {
        errorMsg += 'Missing: EXPO_PUBLIC_SUPABASE_URL\n';
      } else if (!resolvedAnon) {
        errorMsg += 'Missing: EXPO_PUBLIC_SUPABASE_ANON_KEY\n';
      } else {
        errorMsg += 'Environment variables are present but client failed to initialize.\n';
        errorMsg += `URL length: ${resolvedUrl.length}, Key length: ${resolvedAnon.length}\n`;
      }
      
      errorMsg += '\nTo fix:\n';
      errorMsg += '1. Check that your .env file exists in the project root\n';
      errorMsg += '2. Restart your development server (Metro/Expo)\n';
      errorMsg += '3. Clear cache: npx expo start --clear\n';
      
      throw new Error(errorMsg);
    } else {
      // Production environment - show user-friendly message
      throw new Error('Unable to connect to the service. Please check your internet connection and try again.');
    }
  }
  return client;
}

export const supabase = client as unknown as SupabaseClient;
