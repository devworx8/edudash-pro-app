import React, { useState, useEffect } from 'react';
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
        console.warn('Error checking ads eligibility:', error);
        setShowAds(false);
      }
    };

    checkAdsEligibility();
  }, [placement, profile, user?.id]);

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
  } catch {
    // Native module not available in this build; show fallback if enabled
    return showFallback ? <FallbackBanner theme={theme} placement={placement} /> : null;
  }

  const unitId = getAdUnitId(placement);
  if (!unitId) {
    return showFallback ? <FallbackBanner theme={theme} placement={placement} /> : null;
  }

  // Handle ad events
  const handleAdLoaded = () => {
    setAdLoaded(true);
    setAdFailed(false);
    
    track('edudash.ad.banner_loaded', {
      placement,
      ad_unit_id: unitId.slice(-8), // Last 8 chars for tracking
      user_id: user?.id,
      platform: Platform.OS,
    });
  };

  const handleAdFailedToLoad = (error: any) => {
    setAdFailed(true);
    setAdLoaded(false);
    
    track('edudash.ad.banner_failed', {
      placement,
      error: error?.message || 'Unknown error',
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
    return <FallbackBanner theme={theme} placement={placement} />;
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
        unitId={unitId} 
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={handleAdLoaded}
        onAdFailedToLoad={handleAdFailedToLoad}
        onAdOpened={handleAdOpened}
      />
    </View>
  );
}

// Fallback banner component for when ads fail to load
function FallbackBanner({ theme, placement }: { theme: any; placement: string }) {
  const handleUpgradePress = () => {
    track('edudash.ad.fallback_clicked', {
      placement,
      type: 'upgrade_cta',
      platform: Platform.OS,
    });
    // TODO: Navigate to pricing/upgrade screen
    console.log('Navigate to upgrade screen');
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
