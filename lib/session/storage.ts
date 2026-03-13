/**
 * Session Manager — Storage Layer
 * 
 * Handles platform-specific storage (SecureStore, AsyncStorage, Memory),
 * session/profile persistence, and the password recovery flag.
 */

import { Platform } from 'react-native';
import { reportError } from '@/lib/monitoring';
import { storage as supabaseStorage } from '@/lib/storage';
import { authDebug } from '@/lib/authDebug';
import type { UserSession, UserProfile, Session } from './types';
import {
  SESSION_STORAGE_KEY,
  PROFILE_STORAGE_KEY,
  LEGACY_SESSION_KEYS,
  ACTIVE_CHILD_KEYS,
  ACTIVE_ORG_KEYS,
} from './types';

// ============================================================================
// GLOBAL PASSWORD RECOVERY FLAG
// ============================================================================
let _isPasswordRecoveryInProgress = false;

export function isPasswordRecoveryInProgress(): boolean {
  return _isPasswordRecoveryInProgress;
}

export function setPasswordRecoveryInProgress(value: boolean): void {
  console.log('[SessionManager] setPasswordRecoveryInProgress:', value);
  _isPasswordRecoveryInProgress = value;
}

export function resetPasswordRecoveryFlag(): void {
  _isPasswordRecoveryInProgress = false;
}

// ============================================================================
// Storage Adapters
// ============================================================================

// Dynamically import SecureStore to avoid web issues
let SecureStore: any = null;
try {
  if (Platform.OS !== 'web') {
    SecureStore = require('expo-secure-store');
  }
} catch (e) {
  console.debug('SecureStore import failed (web or unsupported platform)', e);
}

// Dynamically require AsyncStorage to avoid web/test issues
let AsyncStorage: any = null;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch (e) {
  console.debug('AsyncStorage import failed (non-React Native env?)', e);
  // Web fallback using localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    AsyncStorage = {
      getItem: async (key: string) => {
        try {
          return window.localStorage.getItem(key);
        } catch {
          return null;
        }
      },
      setItem: async (key: string, value: string) => {
        try {
          window.localStorage.setItem(key, value);
        } catch {
          // ignore
        }
      },
      removeItem: async (key: string) => {
        try {
          window.localStorage.removeItem(key);
        } catch {
          // ignore
        }
      },
    };
  }
}

const SecureStoreAdapter = SecureStore ? {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value, { keychainService: key }),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
} : null;

const AsyncStorageAdapter = AsyncStorage
  ? {
      getItem: (key: string) => AsyncStorage.getItem(key),
      setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
      removeItem: (key: string) => AsyncStorage.removeItem(key),
    }
  : null;

const MemoryStorageAdapter = {
  _map: new Map<string, string>(),
  getItem: async (key: string) => (MemoryStorageAdapter._map.has(key) ? MemoryStorageAdapter._map.get(key)! : null),
  setItem: async (key: string, value: string) => {
    MemoryStorageAdapter._map.set(key, value);
  },
  removeItem: async (key: string) => {
    MemoryStorageAdapter._map.delete(key);
  },
};

function chooseStorage() {
  try {
    if (Platform?.OS === 'web') {
      if (AsyncStorageAdapter) return AsyncStorageAdapter;
      return MemoryStorageAdapter;
    }
    if (Platform?.OS === 'android' && AsyncStorageAdapter) return AsyncStorageAdapter;
    if (SecureStoreAdapter) return SecureStoreAdapter;
    if (AsyncStorageAdapter) return AsyncStorageAdapter;
  } catch (e) {
    console.debug('chooseStorage unexpected error', e);
  }
  return MemoryStorageAdapter;
}

const storage = chooseStorage();

function isValidStoredSession(value: any): value is UserSession {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof value.access_token === 'string' &&
    typeof value.refresh_token === 'string' &&
    typeof value.user_id === 'string' &&
    Number.isFinite(Number(value.expires_at))
  );
}

function isValidStoredProfile(value: any): value is UserProfile {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.role === 'string'
  );
}

// ============================================================================
// Session CRUD
// ============================================================================

export async function storeSession(session: UserSession): Promise<void> {
  try {
    await storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    reportError(new Error('Failed to store session'), { error });
    throw error;
  }
}

export async function getStoredSession(): Promise<UserSession | null> {
  try {
    const sessionData = await storage.getItem(SESSION_STORAGE_KEY);
    if (!sessionData) return null;
    const parsed = JSON.parse(sessionData);
    if (!isValidStoredSession(parsed)) {
      console.warn('[SessionManager] Invalid stored session payload detected, clearing it');
      await storage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch (error) {
    console.error('Failed to retrieve session:', error);
    try {
      await storage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore cleanup failures
    }
    return null;
  }
}

export async function storeProfile(profile: UserProfile): Promise<void> {
  try {
    await storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch (error) {
    console.error('Failed to store profile:', error);
  }
}

export async function getStoredProfile(): Promise<UserProfile | null> {
  try {
    const profileData = await storage.getItem(PROFILE_STORAGE_KEY);
    if (!profileData) return null;
    const parsed = JSON.parse(profileData);
    if (!isValidStoredProfile(parsed)) {
      console.warn('[SessionManager] Invalid stored profile payload detected, clearing it');
      await storage.removeItem(PROFILE_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch (error) {
    console.error('Failed to retrieve profile:', error);
    try {
      await storage.removeItem(PROFILE_STORAGE_KEY);
    } catch {
      // ignore cleanup failures
    }
    return null;
  }
}

export async function getStoredProfileForUser(userId?: string): Promise<UserProfile | null> {
  try {
    const [storedProfile, storedSession] = await Promise.all([
      getStoredProfile(),
      getStoredSession(),
    ]);
    if (!storedProfile) return null;

    const storedEmail = storedProfile.email?.toLowerCase();
    const sessionEmail = storedSession?.email?.toLowerCase();

    if (userId) {
      if (storedProfile.id === userId) return storedProfile;
      if (storedSession?.user_id === userId) return storedProfile;
      if (storedEmail && sessionEmail && storedEmail === sessionEmail) return storedProfile;
      return null;
    }

    if (storedSession?.user_id && storedProfile.id === storedSession.user_id) return storedProfile;
    if (storedEmail && sessionEmail && storedEmail === sessionEmail) return storedProfile;
    return storedProfile;
  } catch (error) {
    console.warn('[SessionManager] getStoredProfileForUser failed (non-fatal):', error);
    return null;
  }
}

export async function updateStoredProfile(partial: Partial<UserProfile> & { id?: string; email?: string }): Promise<void> {
  try {
    const existing = await getStoredProfile();
    const merged = { ...(existing || {}), ...(partial || {}) } as UserProfile;
    if (!merged.id || !merged.role) {
      return;
    }
    await storeProfile(merged);
  } catch (error) {
    console.warn('[SessionManager] updateStoredProfile failed (non-fatal):', error);
  }
}

// ============================================================================
// Clear / Cleanup
// ============================================================================

export async function clearStoredData(): Promise<void> {
  try {
    authDebug('clearStoredData.start');
    console.log('[SessionManager] Clearing all stored data...');
    await Promise.all([
      storage.removeItem(SESSION_STORAGE_KEY),
      storage.removeItem(PROFILE_STORAGE_KEY),
    ]);

    if (AsyncStorage) {
      try {
        await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
        await AsyncStorage.removeItem(PROFILE_STORAGE_KEY);
        await Promise.all(ACTIVE_ORG_KEYS.map((key: string) => AsyncStorage.removeItem(key)));
      } catch (e) {
        console.debug('AsyncStorage clear skipped:', e);
      }
    }

    // Clear legacy keys. Do NOT clear SUPABASE_STORAGE_KEY — see original comment.
    const extraKeys = [
      ...LEGACY_SESSION_KEYS,
      ...ACTIVE_CHILD_KEYS,
      ...ACTIVE_ORG_KEYS,
    ];
    await Promise.all(extraKeys.map((key) => supabaseStorage.removeItem(key)));

    console.log('[SessionManager] All stored data cleared successfully');
    authDebug('clearStoredData.done');
  } catch (error) {
    console.error('Failed to clear stored data:', error);
  }
}

export async function clearStoredAuthData(): Promise<void> {
  await clearStoredData();
}

export async function syncSessionFromSupabase(session: Session | null): Promise<void> {
  try {
    if (!session?.user?.id) {
      await clearStoredData();
      return;
    }

    const userSession: UserSession = {
      access_token: session.access_token,
      refresh_token: session.refresh_token || '',
      expires_at: session.expires_at || Math.floor(Date.now() / 1000) + 3600,
      user_id: session.user.id,
      email: session.user.email || undefined,
    };

    await storeSession(userSession);
  } catch (error) {
    console.warn('[SessionManager] syncSessionFromSupabase failed (non-fatal):', error);
  }
}

/**
 * Clear only app-level session keys (used before sign-in attempts)
 */
export async function clearAppSessionKeys(): Promise<void> {
  await Promise.all([
    storage.removeItem(SESSION_STORAGE_KEY),
    storage.removeItem(PROFILE_STORAGE_KEY),
  ]);
}
