import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Platform, Dimensions, AccessibilityInfo } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { track } from '@/lib/analytics';
import { shouldShowAds } from '@/lib/ads/gating';
import { getAdUnitId } from '@/lib/ads/config';
import { PLACEMENT_KEYS } from '@/lib/ads/placements';
import { router } from 'expo-router';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface NativeAdProps {
  placement?: string;
  onClose?: () => void;
  style?: any;
  itemIndex?: number; // For feed positioning logic
  showFallback?: boolean;
}

// Educational fallback content for when native ads aren't available
const EDUCATIONAL_CONTENT = [
  {
    id: 'reading-tips',
    title: 'Daily Reading Tips',
    description: 'Build your child\'s literacy with 15 minutes of reading daily',
    sponsor: 'EduDash Pro',
    cta: 'Learn More',
    icon: 'book',
    color: ['#4F46E5', '#7C3AED'],
    action: () => console.log('Navigate to reading tips'),
  },
  {
    id: 'math-practice',
    title: 'Fun Math Practice',
    description: 'Make numbers exciting with games and activities',
    sponsor: 'EduDash Pro',
    cta: 'Try Now',
    icon: 'calculator',
    color: ['#059669', '#10B981'],
    action: () => console.log('Navigate to math activities'),
  },
  {
    id: 'communication',
    title: 'Talk to Teachers',
    description: 'Stay connected with your child\'s learning progress',
    sponsor: 'EduDash Pro',
    cta: 'Message Now',
    icon: 'chatbubble',
    color: ['#F59E0B', '#D97706'],
    action: () => router.push('/messages'),
  },
  {
    id: 'progress-tracking',
    title: 'Track Progress',
    description: 'Monitor your child\'s academic development',
    sponsor: 'EduDash Pro',
    cta: 'View Progress',
    icon: 'trending-up',
    color: ['#DC2626', '#B91C1C'],
    action: () => router.push('/progress'),
  },
];

export const NativeAdCard: React.FC<NativeAdProps> = ({ 
  placement = PLACEMENT_KEYS.NATIVE_PARENT_FEED, 
  onClose, 
  style,
  itemIndex = 0,
  showFallback = true,
}) => {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const [showAds, setShowAds] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [nativeAdLoaded, setNativeAdLoaded] = useState(false);
  const [nativeAdFailed, setNativeAdFailed] = useState(false);
  const [fallbackContent, setFallbackContent] = useState<any>(null);

  // Check if ads should be shown
  useEffect(() => {
    const checkAdsEligibility = async () => {
      try {
        const eligible = await shouldShowAds(profile, 'free');
        setShowAds(eligible);
        
        if (eligible) {
          track('edudash.ad.native_eligible', {
            placement,
            item_index: itemIndex,
            user_id: user?.id,
            platform: Platform.OS,
          });
        }
        
        // Select fallback content regardless of ad eligibility
        const randomContent = EDUCATIONAL_CONTENT[Math.floor(Math.random() * EDUCATIONAL_CONTENT.length)];
        setFallbackContent(randomContent);
      } catch (error) {
        console.warn('Error checking native ad eligibility:', error);
        setShowAds(false);
      }
    };

    checkAdsEligibility();
  }, [placement, profile, user?.id, itemIndex]);

  // Don't show if dismissed
  if (dismissed) return null;

  // If ads not eligible and no fallback, don't show anything
  if (!showAds && !showFallback) return null;

  // Show fallback if ads not eligible or failed
  const shouldShowFallback = !showAds || (showAds && nativeAdFailed);
  if (shouldShowFallback && showFallback && fallbackContent) {
    return (
      <FallbackNativeCard
        content={fallbackContent}
        theme={theme}
        onClose={() => {
          setDismissed(true);
          onClose?.();
        }}
        style={style}
      />
    );
  }

  // Don't proceed with native ads if not eligible
  if (!showAds) return null;

  // Platform checks for native ads
  if (Platform.OS === 'web') return null;
  if (Platform.OS !== 'android') return null;

  // Try to load native ad component
  let NativeAd: any, NativeAdView: any;
  try {
    const ads = require('react-native-google-mobile-ads');
    // Note: Native ads might not be available in current setup
    // This is a placeholder for when native ads are properly configured
    NativeAd = ads.NativeAd || null;
    NativeAdView = ads.NativeAdView || null;
  } catch (error) {
    console.debug('Native ads module not available:', error);
    // Show fallback instead
    return showFallback && fallbackContent ? (
      <FallbackNativeCard
        content={fallbackContent}
        theme={theme}
        onClose={() => {
          setDismissed(true);
          onClose?.();
        }}
        style={style}
      />
    ) : null;
  }

  // If native ads not supported, show fallback
  if (!NativeAd || !NativeAdView) {
    return showFallback && fallbackContent ? (
      <FallbackNativeCard
        content={fallbackContent}
        theme={theme}
        onClose={() => {
          setDismissed(true);
          onClose?.();
        }}
        style={style}
      />
    ) : null;
  }

  const unitId = getAdUnitId(placement);
  if (!unitId) {
    return showFallback && fallbackContent ? (
      <FallbackNativeCard
        content={fallbackContent}
        theme={theme}
        onClose={() => {
          setDismissed(true);
          onClose?.();
        }}
        style={style}
      />
    ) : null;
  }

  // Native ad event handlers
  const handleNativeAdLoaded = () => {
    setNativeAdLoaded(true);
    setNativeAdFailed(false);
    
    track('edudash.ad.native_loaded', {
      placement,
      ad_unit_id: unitId.slice(-8),
      item_index: itemIndex,
      user_id: user?.id,
      platform: Platform.OS,
    });
  };

  const handleNativeAdFailed = (error: any) => {
    setNativeAdFailed(true);
    setNativeAdLoaded(false);
    
    track('edudash.ad.native_failed', {
      placement,
      error: error?.message || 'Unknown error',
      item_index: itemIndex,
      user_id: user?.id,
      platform: Platform.OS,
    });
  };

  const handleNativeAdClicked = () => {
    track('edudash.ad.native_clicked', {
      placement,
      ad_unit_id: unitId.slice(-8),
      item_index: itemIndex,
      user_id: user?.id,
      platform: Platform.OS,
    });
  };

  return (
    <View style={[styles.container, style]} accessibilityLabel="Sponsored content">
      {/* Loading state */}
      {!nativeAdLoaded && !nativeAdFailed && (
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="small" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading ad...</Text>
        </View>
      )}
      
      {/* Placeholder for actual native ad implementation */}
      <View style={styles.nativeAdPlaceholder}>
        <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
          Native Ad Placeholder\n(Real implementation would go here)
        </Text>
        <Text style={[styles.placeholderSubtext, { color: theme.textTertiary }]}>
          Unit ID: {unitId.slice(-8)}...\nPlacement: {placement}
        </Text>
      </View>
      
      {/* Ad disclosure */}
      <Text style={[styles.disclosure, { color: theme.textTertiary }]}>
        Sponsored content
      </Text>
    </View>
  );
};

// Fallback native card component
function FallbackNativeCard({ 
  content, 
  theme, 
  onClose, 
  style 
}: { 
  content: any; 
  theme: any; 
  onClose: () => void; 
  style?: any;
}) {
  const handleContentPress = () => {
    track('edudash.ad.fallback_native_clicked', {
      content_id: content.id,
      platform: Platform.OS,
    });
    
    if (content.action) {
      content.action();
    }
  };

  const { width } = Dimensions.get('window');
  const cardWidth = Math.min(width - 32, 350);

  return (
    <View style={[styles.container, { width: cardWidth }, style]}>
      <TouchableOpacity 
        style={styles.adCard}
        onPress={handleContentPress}
        activeOpacity={0.9}
        accessibilityLabel="Educational tip"
        accessibilityHint="Tap to learn more"
      >
        <LinearGradient
          colors={content.color}
          style={styles.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {/* Educational Label */}
          <View style={styles.sponsoredLabel}>
            <Text style={styles.sponsoredText}>Educational Tip</Text>
          </View>

          {/* Close Button */}
          <TouchableOpacity 
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Close"
            accessibilityHint="Dismiss this card"
          >
            <Ionicons name="close" size={16} color="rgba(255, 255, 255, 0.8)" />
          </TouchableOpacity>

          {/* Content */}
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <Ionicons name={content.icon as any} size={24} color="#FFFFFF" />
            </View>

            <Text style={styles.title} numberOfLines={2}>
              {content.title}
            </Text>

            <Text style={styles.description} numberOfLines={3}>
              {content.description}
            </Text>

            <View style={styles.footer}>
              <Text style={styles.sponsor}>
                by {content.sponsor}
              </Text>
              <View style={styles.ctaButton}>
                <Text style={styles.ctaText}>{content.cta}</Text>
                <Ionicons name="arrow-forward" size={12} color="#FFFFFF" />
              </View>
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>

      {/* Educational Disclosure */}
      <Text style={[styles.disclosure, { color: theme.textTertiary }]}>
        Educational content from EduDash Pro
      </Text>
    </View>
  );
}

export default NativeAdCard;

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  adCard: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  gradient: {
    padding: 16,
    minHeight: 140,
    position: 'relative',
  },
  sponsoredLabel: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  sponsoredText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    marginTop: 24,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    lineHeight: 20,
  },
  description: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 18,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sponsor: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    flex: 1,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  ctaText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    marginRight: 4,
  },
  disclosure: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
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
  nativeAdPlaceholder: {
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
    borderWidth: 1,
    borderColor: 'rgba(128, 128, 128, 0.2)',
    borderStyle: 'dashed',
  },
  placeholderText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
  },
  placeholderSubtext: {
    fontSize: 12,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
});
