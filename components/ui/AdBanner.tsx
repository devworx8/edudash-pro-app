import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Platform, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { shouldShowAds } from '@/lib/ads/gating';
import { getAdUnitId } from '@/lib/ads/config';
import { PLACEMENT_KEYS } from '@/lib/ads/placements';
import { track } from '@/lib/analytics';
import * as Device from 'expo-device';
import { logger } from '@/lib/logger';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface AdBannerProps {
  placement?: string;
  style?: any;
  showFallback?: boolean;
}

export default function AdBanner({ 
  placement = PLACEMENT_KEYS.BANNER_PARENT_DASHBOARD,
  style,
  showFallback = true 
}: AdBannerProps) {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const [adLoaded, setAdLoaded] = useState(false);
  const [adFailed, setAdFailed] = useState(false);
  const [showAds, setShowAds] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [lastError, setLastError] = useState('');
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHuaweiNoGmsRiskDevice = Platform.OS === 'android'
    && (String(Device.brand || '').toLowerCase().includes('huawei')
      || String(Device.manufacturer || '').toLowerCase().includes('huawei'));

  // Check if ads should be shown
  useEffect(() => {
    const checkAdsEligibility = async () => {
      try {
        const eligible = await shouldShowAds(profile, 'free');
        setShowAds(eligible);
        
        if (eligible) {
          track('edudash.ad.banner_eligible', {
            placement,
            user_id: user?.id,
            platform: Platform.OS,
          });
        }
      } catch (error) {
        logger.warn('Error checking ads eligibility:', error);
        setShowAds(false);
      }
    };

    checkAdsEligibility();
  }, [placement, profile, user?.id]);

  const handleAdFailedToLoad = useCallback((error: any) => {
    setAdLoaded(false);
    const errorMsg = error?.message || error?.code || 'Unknown error';
    setLastError(errorMsg);
    
    const attempt = retryCountRef.current;
    track('edudash.ad.banner_failed', {
      placement,
      error: error?.message || 'Unknown error',
      user_id: user?.id,
      platform: Platform.OS,
      retry_attempt: attempt,
    });

    // Retry up to 3 times with exponential backoff (15s, 30s, 60s)
    if (attempt < 3) {
      const delay = 15_000 * Math.pow(2, attempt);
      retryTimerRef.current = setTimeout(() => {
        retryCountRef.current = attempt + 1;
        setAdFailed(false);
        setRetryKey((k) => k + 1);
      }, delay);
    } else {
      setAdFailed(true);
    }
  }, [placement, user?.id]);

  // Clean up retry timer on unmount
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  // Don't show anything if ads are not eligible
  if (!showAds) {
    return null;
  }

  // Explicitly exclude web platform to prevent bundling issues
  if (Platform.OS === 'web') return null;
  if (Platform.OS !== 'android') return null;
  if (isHuaweiNoGmsRiskDevice) return null;

  // Lazy-require the native module to avoid crashes if the dev client
  // wasn't built with react-native-google-mobile-ads.
  let BannerAd: any, BannerAdSize: any;
  try {
    const ads = require('react-native-google-mobile-ads');
    BannerAd = ads.BannerAd;
    BannerAdSize = ads.BannerAdSize;
  } catch (e) {
    // Native module not available in this build; show fallback if enabled
    track('edudash.ad.sdk_require_failed', {
      placement,
      error: e instanceof Error ? e.message : String(e),
      platform: Platform.OS,
    });
    return showFallback ? <FallbackBanner theme={theme} placement={placement} reason={`SDK require failed: ${e instanceof Error ? e.message : String(e)}`} /> : null;
  }

  const unitId = getAdUnitId(placement);
  if (!unitId) {
    track('edudash.ad.no_unit_id', {
      placement,
      platform: Platform.OS,
      test_mode: String(process.env.EXPO_PUBLIC_ADMOB_TEST_IDS_ONLY),
    });
    return showFallback ? <FallbackBanner theme={theme} placement={placement} reason={`No unit ID for ${placement} (TEST_IDS_ONLY=${process.env.EXPO_PUBLIC_ADMOB_TEST_IDS_ONLY})`} /> : null;
  }

  // Handle ad events
  const handleAdLoaded = () => {
    setAdLoaded(true);
    setAdFailed(false);
    
    track('edudash.ad.banner_loaded', {
      placement,
      ad_unit_id: unitId.slice(-8),
      user_id: user?.id,
      platform: Platform.OS,
    });
  };

  const handleAdOpened = () => {
    track('edudash.ad.banner_clicked', {
      placement,
      ad_unit_id: unitId.slice(-8),
      user_id: user?.id,
      platform: Platform.OS,
    });
  };

  // Show fallback if ad failed and fallback is enabled
  if (adFailed && showFallback) {
    return <FallbackBanner theme={theme} placement={placement} reason={`Load failed after ${retryCountRef.current} retries: ${lastError}`} />;
  }

  return (
    <View style={[styles.container, style]}>
      {!adLoaded && (
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="small" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading...</Text>
        </View>
      )}
      <BannerAd 
        key={retryKey}
        unitId={unitId} 
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdLoaded={handleAdLoaded}
        onAdFailedToLoad={handleAdFailedToLoad}
        onAdOpened={handleAdOpened}
      />
      {/* TODO: Remove debug line once ad serving is confirmed */}
      <Text style={{ fontSize: 8, color: theme.textSecondary, textAlign: 'center', marginTop: 1, opacity: 0.45 }}>
        {adLoaded ? `✓ ad:${unitId.slice(-10)}` : `⏳ ${unitId.slice(-10)} r:${retryCountRef.current}`}
        {lastError ? ` | ${lastError.slice(0, 50)}` : ''}
      </Text>
    </View>
  );
}

// Fallback banner component for when ads fail to load
// TODO: Remove `reason` debug overlay once ad serving is confirmed working
function FallbackBanner({ theme, placement, reason }: { theme: any; placement: string; reason?: string }) {
  const handleUpgradePress = () => {
    track('edudash.ad.fallback_clicked', {
      placement,
      type: 'upgrade_cta',
      platform: Platform.OS,
    });
    // TODO: Navigate to pricing/upgrade screen
    logger.info('Navigate to upgrade screen');
  };

  return (
    <View style={[styles.container, styles.fallbackContainer]}>
      <TouchableOpacity 
        style={styles.fallbackCard}
        onPress={handleUpgradePress}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={[theme.primary, theme.accent]}
          style={styles.fallbackGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <View style={styles.fallbackContent}>
            <View style={styles.fallbackIconContainer}>
              <Ionicons name="star" size={20} color="#FFFFFF" />
            </View>
            <View style={styles.fallbackTextContainer}>
              <Text style={styles.fallbackTitle}>Unlock Premium Features</Text>
              <Text style={styles.fallbackSubtitle}>Get unlimited AI help & remove ads</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="rgba(255, 255, 255, 0.8)" />
          </View>
          {/* TODO: Remove debug line once ad serving is confirmed */}
          {reason ? (
            <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.55)', textAlign: 'center', paddingBottom: 4 }}>
              Ad debug: {reason}
            </Text>
          ) : null}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 8,
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: '500',
  },
  fallbackContainer: {
    paddingVertical: 4,
  },
  fallbackCard: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 350,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  fallbackGradient: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  fallbackContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fallbackIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackTextContainer: {
    flex: 1,
  },
  fallbackTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  fallbackSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
  },
});
