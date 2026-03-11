import { Platform } from 'react-native';
import { track } from '@/lib/analytics';
import { areTestIdsOnly } from '@/lib/ads/gating';

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

// SecureStore adapter (preferred for iOS). Note: SecureStore has a ~2KB limit per item on Android.
const SecureStoreAdapter = SecureStore ? {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value, { keychainService: key }),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
} : null;

// AsyncStorage adapter (preferred for Android, no 2KB limit)
const AsyncStorageAdapter = AsyncStorage
  ? {
      getItem: (key: string) => AsyncStorage.getItem(key),
      setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
      removeItem: (key: string) => AsyncStorage.removeItem(key),
    }
  : null;

// In-memory fallback for tests or environments without the above storages
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
    // Web platform: use localStorage via AsyncStorage or memory fallback
    if (Platform?.OS === 'web') {
      if (AsyncStorageAdapter) return AsyncStorageAdapter;
      return MemoryStorageAdapter;
    }
    // Use AsyncStorage on Android to avoid SecureStore size limit warning/failures
    if (Platform?.OS === 'android' && AsyncStorageAdapter) return AsyncStorageAdapter;
    // iOS and other platforms: prefer SecureStore; fall back if unavailable
    if (SecureStoreAdapter) return SecureStoreAdapter;
    if (AsyncStorageAdapter) return AsyncStorageAdapter;
  } catch (e) {
    console.debug('chooseStorage unexpected error', e);
  }
  return MemoryStorageAdapter;
}

const storage = chooseStorage();

// Placements we support
export type InterstitialPlacement = 'homework_submitted' | 'lesson_saved_assigned' | 'events_tab_action';

function isAndroid() { return Platform.OS === 'android'; }
function adsEnabled() { return process.env.EXPO_PUBLIC_ENABLE_ADS !== '0'; }
function isWeb() { return Platform.OS === 'web'; }
function canUseLegacyTestInterstitials() {
  return __DEV__ || areTestIdsOnly();
}

const DAILY_LIMIT = 5;
const MIN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function todayKey(placement: string) {
  const d = new Date();
  const day = `${d.getUTCFullYear()}-${d.getUTCMonth()+1}-${d.getUTCDate()}`;
  return `ads:${placement}:${day}`;
}

async function canShow(placement: InterstitialPlacement) {
  if (isWeb() || !isAndroid() || !adsEnabled()) return false;
  const key = todayKey(placement);
  const raw = await storage.getItem(key);
  const now = Date.now();
  if (!raw) return true;
  try {
    const parsed = JSON.parse(raw) as { count: number; last: number };
    if (parsed.count >= DAILY_LIMIT) return false;
    if (now - parsed.last < MIN_INTERVAL_MS) return false;
    return true;
  } catch {
    return true;
  }
}

async function bump(placement: InterstitialPlacement) {
  const key = todayKey(placement);
  const raw = await storage.getItem(key);
  const now = Date.now();
  try {
    const parsed = raw ? (JSON.parse(raw) as { count: number; last: number }) : { count: 0, last: 0 };
    parsed.count += 1; parsed.last = now;
    await storage.setItem(key, JSON.stringify(parsed));
  } catch {
    await storage.setItem(key, JSON.stringify({ count: 1, last: now }));
  }
}

class Manager {
  private loaders: Map<InterstitialPlacement, any> = new Map();

  preload(placement: InterstitialPlacement) {
    if (isWeb() || !isAndroid() || !adsEnabled()) return;
    if (this.loaders.has(placement)) return;
    if (!canUseLegacyTestInterstitials()) return;
    
    try {
      const { InterstitialAd, TestIds } = require('react-native-google-mobile-ads');
      const ad = InterstitialAd.createForAdRequest(TestIds.INTERSTITIAL);
      ad.load();
      this.loaders.set(placement, ad);
    } catch (error) {
      console.warn('Failed to preload interstitial ad:', error);
    }
  }

  async showIfEligible(placement: InterstitialPlacement, role?: string, tier?: 'free'|'pro'|'enterprise') {
    if (tier && tier !== 'free') return false;
    if (!(await canShow(placement))) return false;
    if (!canUseLegacyTestInterstitials()) {
      track('ad_interstitial_blocked', {
        placement,
        role,
        reason: 'legacy_manager_disabled_in_production',
        tier,
      });
      return false;
    }

    try {
      const { InterstitialAd, AdEventType, TestIds } = require('react-native-google-mobile-ads');
      
      let ad = this.loaders.get(placement);
      if (!ad) {
        ad = InterstitialAd.createForAdRequest(TestIds.INTERSTITIAL);
        this.loaders.set(placement, ad);
      }

      return new Promise<boolean>((resolve) => {
        const unsubscribe = ad!.addAdEventListener(AdEventType.LOADED, async () => {
          track('ad_interstitial_loaded', { placement });
          ad!.show();
        });
        const closeUnsub = ad!.addAdEventListener(AdEventType.CLOSED, async () => {
          track('ad_interstitial_dismissed', { placement });
          await bump(placement);
          resolve(true);
        });
        const errorUnsub = ad!.addAdEventListener(AdEventType.ERROR, () => {
          resolve(false);
        });

        track('ad_interstitial_requested', { placement });
        ad!.load();

        // Safety timeout resolve after 10s
        setTimeout(() => {
          unsubscribe(); closeUnsub(); errorUnsub();
          resolve(false);
        }, 10000);
      });
    } catch (error) {
      console.warn('Failed to show interstitial ad:', error);
      return false;
    }
  }
}

export const InterstitialManager = new Manager();
