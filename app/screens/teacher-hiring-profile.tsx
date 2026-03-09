import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Switch, Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type ThemeColors } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { TeacherReputationService } from '@/lib/services/TeacherReputationService';
import { TeacherMarketProfileUpdateSchema } from '@/types/teacher-reputation';
import type { TeacherMarketProfileUpdate } from '@/types/teacher-reputation';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
type ExpoLocationModule = typeof import('expo-location');

const loadExpoLocation = (): ExpoLocationModule | null => {
  try {
    return require('expo-location') as ExpoLocationModule;
  } catch (_error) {
    return null;
  }
};

export default function TeacherHiringProfileScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { showAlert, alertProps } = useAlertModal();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [radiusKm, setRadiusKm] = useState('25');
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLng, setLocationLng] = useState<number | null>(null);
  const [locationSource, setLocationSource] = useState<'gps' | 'manual' | null>(null);
  const supportsGpsLookup = Platform.OS === 'ios';

  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const profile = await TeacherReputationService.getMarketProfile(user.id);
      if (profile) {
        setIsPublic(profile.is_public);
        setCity(profile.location_city || '');
        setProvince(profile.location_province || '');
        setRadiusKm(profile.preferred_radius_km ? String(profile.preferred_radius_km) : '25');
        setLocationLat(profile.location_lat ?? null);
        setLocationLng(profile.location_lng ?? null);
        setLocationSource(profile.location_source ?? null);
      }
    } catch (_e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleUseGps = useCallback(async () => {
    if (!supportsGpsLookup) {
      showAlert({
        title: 'Manual location only',
        message: 'GPS matching is currently available on iPhone and iPad builds only. Please enter your city and province manually on this device.',
        type: 'warning',
      });
      return;
    }

    const Location = loadExpoLocation();
    if (!Location) {
      showAlert({
        title: 'GPS unavailable',
        message: 'Location services are not available in this build yet. Please update the app or enter your location manually.',
        type: 'warning',
      });
      return;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showAlert({ title: 'Permission needed', message: 'Allow location access to use GPS.', type: 'warning' });
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocationLat(position.coords.latitude);
      setLocationLng(position.coords.longitude);
      setLocationSource('gps');

      const reverse = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      const best = reverse?.[0];
      if (best) {
        setCity(best.city || best.subregion || city);
        setProvince(best.region || province);
      }
    } catch (_e) {
      showAlert({ title: 'GPS error', message: 'Could not access your location. Please enter it manually.', type: 'error' });
    }
  }, [city, province, showAlert, supportsGpsLookup]);

  const handleSave = useCallback(async () => {
    if (!user?.id) return;
    setSaving(true);

    const parsedRadius = Number(radiusKm);
    const safeRadius = Number.isFinite(parsedRadius) && parsedRadius > 0 ? parsedRadius : 25;

    const hasManualLocation = Boolean(city.trim() || province.trim());
    const resolvedSource = locationSource === 'gps' ? 'gps' : hasManualLocation ? 'manual' : null;

    const payload: TeacherMarketProfileUpdate = {
      is_public: isPublic,
      location_city: city.trim() || null,
      location_province: province.trim() || null,
      location_lat: resolvedSource === 'gps' ? locationLat : null,
      location_lng: resolvedSource === 'gps' ? locationLng : null,
      location_source: resolvedSource,
      preferred_radius_km: safeRadius,
      location_updated_at: new Date().toISOString(),
    };

    try {
      const validated = TeacherMarketProfileUpdateSchema.safeParse(payload);
      if (!validated.success) {
        const message = validated.error.issues[0]?.message || 'Check your location details and try again.';
        showAlert({ title: 'Invalid details', message, type: 'warning' });
        return;
      }
      await TeacherReputationService.upsertMarketProfile(user.id, validated.data);
      showAlert({ title: 'Saved', message: 'Your hiring profile has been updated.', type: 'success' });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save profile.';
      showAlert({ title: 'Error', message, type: 'error' });
    } finally {
      setSaving(false);
    }
  }, [user?.id, isPublic, city, province, radiusKm, locationSource, locationLat, locationLng]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hiring Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Visible to Schools</Text>
            <Switch value={isPublic} onValueChange={setIsPublic} />
          </View>
          <Text style={styles.cardHint}>
            Turn this on to appear in the Hiring Hub for principals in your region.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Location</Text>
          <Text style={styles.cardHint}>
            {supportsGpsLookup
              ? 'Use GPS for precise matching, or enter your area manually.'
              : 'Enter your city and province manually on this device. GPS matching is available on supported iPhone and iPad builds.'}
          </Text>

          <TouchableOpacity
            style={[styles.gpsButton, !supportsGpsLookup && styles.gpsButtonDisabled]}
            onPress={handleUseGps}
            disabled={!supportsGpsLookup}
          >
            <Ionicons name="navigate-outline" size={16} color={theme.primary} />
            <Text style={styles.gpsButtonText}>
              {supportsGpsLookup ? 'Use Current Location' : 'Manual Entry Required'}
            </Text>
          </TouchableOpacity>

          <View style={styles.formGroup}>
            <Text style={styles.label}>City / Area</Text>
            <TextInput
              style={styles.input}
              value={city}
              onChangeText={(value) => {
                setCity(value);
                setLocationSource('manual');
              }}
              placeholder="e.g. Johannesburg"
              placeholderTextColor={theme.textSecondary}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Province</Text>
            <TextInput
              style={styles.input}
              value={province}
              onChangeText={(value) => {
                setProvince(value);
                setLocationSource('manual');
              }}
              placeholder="e.g. Gauteng"
              placeholderTextColor={theme.textSecondary}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Preferred Radius (km)</Text>
            <TextInput
              style={styles.input}
              value={radiusKm}
              onChangeText={setRadiusKm}
              placeholder="25"
              keyboardType="numeric"
              placeholderTextColor={theme.textSecondary}
            />
          </View>

          {locationLat && locationLng ? (
            <Text style={styles.locationInfo}>
              GPS set: {locationLat.toFixed(4)}, {locationLng.toFixed(4)}
            </Text>
          ) : null}
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
          {saving ? <EduDashSpinner color={theme.onPrimary} /> : <Text style={styles.saveButtonText}>Save Profile</Text>}
        </TouchableOpacity>
      </ScrollView>
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const createStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    backButton: {
      padding: 8,
      borderRadius: 999,
      backgroundColor: theme.surface,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.text,
    },
    content: {
      paddingHorizontal: 16,
      paddingBottom: 24,
      gap: 16,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      padding: 16,
      gap: 12,
    },
    cardTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.text,
    },
    cardHint: {
      fontSize: 12,
      color: theme.textSecondary,
    },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    gpsButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      alignSelf: 'flex-start',
      backgroundColor: theme.primary + '15',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
    },
    gpsButtonDisabled: {
      opacity: 0.5,
    },
    gpsButtonText: {
      color: theme.primary,
      fontWeight: '600',
      fontSize: 12,
    },
    formGroup: {
      gap: 6,
    },
    label: {
      color: theme.text,
      fontWeight: '600',
      fontSize: 12,
    },
    input: {
      backgroundColor: theme.background,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.border,
      color: theme.text,
      fontSize: 13,
    },
    locationInfo: {
      fontSize: 12,
      color: theme.textSecondary,
    },
    saveButton: {
      backgroundColor: theme.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    saveButtonText: {
      color: theme.onPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    loadingText: {
      color: theme.textSecondary,
      fontSize: 14,
    },
  });
