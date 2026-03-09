/**
 * Dashboard Wallpaper Background Component
 * Renders the organization wallpaper as a background layer on any screen
 */
import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useOrganizationBranding } from '@/contexts/OrganizationBrandingContext';

interface DashboardWallpaperBackgroundProps {
  children: React.ReactNode;
  /** Override the opacity from organization settings */
  opacity?: number;
  /** Skip wallpaper rendering (useful for specific screens) */
  disabled?: boolean;
}

export function DashboardWallpaperBackground({ 
  children, 
  opacity: overrideOpacity,
  disabled = false,
}: DashboardWallpaperBackgroundProps) {
  const { settings } = useOrganizationBranding();
  
  const wallpaperUrl = settings?.wallpaper_url;
  const wallpaperOpacity = overrideOpacity ?? settings?.wallpaper_opacity ?? 0.15;

  const fallbackStarfield = (
    <View pointerEvents="none" style={styles.fallbackLayer}>
      <LinearGradient
        colors={['#050915', '#0d1430', '#131531']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.glowOrb, styles.glowOrbLeft]} />
      <View style={[styles.glowOrb, styles.glowOrbRight]} />
      {Array.from({ length: 18 }).map((_, index) => (
        <View
          key={`star-${index}`}
          style={[
            styles.star,
            {
              left: `${(index * 19) % 100}%`,
              top: `${(index * 13) % 78}%`,
              opacity: index % 3 === 0 ? 0.9 : 0.55,
            },
          ]}
        />
      ))}
    </View>
  );
  
  // No wallpaper set or disabled
  if (!wallpaperUrl || disabled) {
    return (
      <View style={styles.container}>
        {fallbackStarfield}
        <View style={styles.content}>{children}</View>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      {fallbackStarfield}
      {/* Wallpaper layer */}
      <Image
        key={wallpaperUrl}
        source={{ uri: wallpaperUrl }}
        style={[styles.wallpaper, { opacity: wallpaperOpacity }]}
        resizeMode="cover"
        blurRadius={2}
      />
      {/* Content layer */}
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
}

/**
 * Hook to get wallpaper settings for manual usage
 */
export function useWallpaperSettings() {
  const { settings } = useOrganizationBranding();
  
  return {
    wallpaperUrl: settings?.wallpaper_url || null,
    wallpaperOpacity: settings?.wallpaper_opacity ?? 0.15,
    customGreeting: settings?.custom_greeting || null,
    hasWallpaper: !!settings?.wallpaper_url,
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  wallpaper: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  fallbackLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  glowOrb: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    opacity: 0.18,
  },
  glowOrbLeft: {
    top: 40,
    left: -60,
    backgroundColor: '#06b6d4',
  },
  glowOrbRight: {
    right: -70,
    bottom: 120,
    backgroundColor: '#fcd34d',
  },
  star: {
    position: 'absolute',
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#e6f7ff',
  },
  content: {
    flex: 1,
  },
});
