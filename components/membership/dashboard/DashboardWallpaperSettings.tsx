/**
 * Dashboard Wallpaper Settings Component
 * Allows CEO to set custom wallpaper for organization dashboards
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Image, Alert, TextInput, Modal, ScrollView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ensureImageLibraryPermission } from '@/lib/utils/mediaLibrary';
import { assertSupabase } from '@/lib/supabase';
import Slider from '@react-native-community/slider';
import type { DashboardSettings } from './types';
import { wallpaperSettingsStyles as styles } from './WallpaperSettingsStyles';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface DashboardWallpaperSettingsProps {
  organizationId: string;
  currentSettings?: DashboardSettings;
  theme: any;
  onSettingsUpdate?: (settings: DashboardSettings) => void;
  /** External visibility control (optional) */
  visible?: boolean;
  /** Called when modal should close (optional) */
  onClose?: () => void;
  /** Hide the trigger button when using external control */
  showTriggerButton?: boolean;
}

export function DashboardWallpaperSettings({ 
  organizationId, 
  currentSettings,
  theme,
  onSettingsUpdate,
  visible: externalVisible,
  onClose,
  showTriggerButton = true,
}: DashboardWallpaperSettingsProps) {
  const [internalVisible, setInternalVisible] = useState(false);
  const isModalVisible = externalVisible ?? internalVisible;
  const [wallpaperUrl, setWallpaperUrl] = useState(currentSettings?.wallpaper_url || '');
  const [opacity, setOpacity] = useState(currentSettings?.wallpaper_opacity || 0.15);
  const [customGreeting, setCustomGreeting] = useState(currentSettings?.custom_greeting || '');
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      setInternalVisible(false);
    }
  };

  const handleOpen = () => {
    setInternalVisible(true);
  };

  useEffect(() => {
    if (currentSettings) {
      setWallpaperUrl(currentSettings.wallpaper_url || '');
      setOpacity(currentSettings.wallpaper_opacity || 0.15);
      setCustomGreeting(currentSettings.custom_greeting || '');
    }
  }, [currentSettings]);

  const pickImage = async () => {
    try {
      const hasPermission = await ensureImageLibraryPermission();
      if (!hasPermission) {
        Alert.alert('Permission Required', 'Please allow access to your photo library to upload a wallpaper.');
        return;
      }

      // First, pick image without editing
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        // Show the selected image for preview before setting
        setSelectedImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const cropAndSetImage = async () => {
    if (!selectedImageUri) return;
    
    try {
      // Allow user to crop the selected image
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error cropping image:', error);
      Alert.alert('Error', 'Failed to crop image');
    }
  };

  const setWallpaperFromSelected = async () => {
    if (!selectedImageUri) return;
    await uploadWallpaper(selectedImageUri);
    setSelectedImageUri(null);
  };

  const cancelImageSelection = () => {
    setSelectedImageUri(null);
  };

  const uploadWallpaper = async (uri: string) => {
    try {
      setIsUploading(true);
      const supabase = assertSupabase();
      
      // Get the file extension
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `wallpaper_${organizationId}_${Date.now()}.${ext}`;
      
      // For React Native, we need to use FormData approach
      const formData = new FormData();
      formData.append('file', {
        uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri,
        name: fileName,
        type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      } as any);

      // Try uploading with fetch approach for better mobile compatibility
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const uploadUrl = `${supabaseUrl}/storage/v1/object/organization-assets/wallpapers/${fileName}`;
      
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'x-upsert': 'true',
        },
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error('Upload error response:', errorText);
        
        // If bucket doesn't exist, provide helpful message
        if (uploadResponse.status === 404 || errorText.includes('not found')) {
          throw new Error('Storage bucket not configured. Please contact administrator.');
        }
        throw new Error(`Upload failed: ${uploadResponse.status}`);
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('organization-assets')
        .getPublicUrl(`wallpapers/${fileName}`);

      setWallpaperUrl(publicUrl);
      Alert.alert('Success', 'Wallpaper uploaded successfully');
    } catch (error: any) {
      console.error('Error uploading wallpaper:', error);
      Alert.alert(
        'Upload Failed', 
        error.message || 'Failed to upload wallpaper. Please check your connection and try again.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setIsSaving(true);
      const supabase = assertSupabase();

      const settings: DashboardSettings = {
        wallpaper_url: wallpaperUrl || undefined,
        wallpaper_opacity: opacity,
        custom_greeting: customGreeting || undefined,
      };

      console.log('[WallpaperSettings] Saving settings:', settings);
      console.log('[WallpaperSettings] Organization ID:', organizationId);

      if (!organizationId) {
        throw new Error('No organization ID available');
      }

      // First verify the organization exists
      const { data: orgCheck, error: checkError } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('id', organizationId)
        .single();

      console.log('[WallpaperSettings] Organization check:', { orgCheck, checkError });

      if (checkError || !orgCheck) {
        throw new Error(`Organization not found: ${organizationId}`);
      }

      // Update organization settings
      const { error, data, count } = await supabase
        .from('organizations')
        .update({
          dashboard_settings: settings,
          updated_at: new Date().toISOString(),
        })
        .eq('id', organizationId)
        .select();

      console.log('[WallpaperSettings] Save result:', { error, data, count });

      if (error) throw error;
      
      if (!data || data.length === 0) {
        throw new Error('Update did not affect any rows - check RLS policies');
      }

      onSettingsUpdate?.(settings);
      handleClose();
      Alert.alert('Success', 'Dashboard settings saved! Changes will apply to all member dashboards.');
    } catch (error: any) {
      console.error('[WallpaperSettings] Error saving settings:', error);
      Alert.alert('Error', error.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const removeWallpaper = () => {
    Alert.alert(
      'Remove Wallpaper',
      'Are you sure you want to remove the dashboard wallpaper?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Remove', 
          style: 'destructive',
          onPress: () => setWallpaperUrl(''),
        },
      ]
    );
  };

  return (
    <>
      {showTriggerButton && (
        <TouchableOpacity
          style={[styles.settingsCard, { backgroundColor: theme.card }]}
          onPress={handleOpen}
        >
          <View style={[styles.settingsIcon, { backgroundColor: '#8B5CF615' }]}>
            <Ionicons name="image-outline" size={24} color="#8B5CF6" />
          </View>
          <View style={styles.settingsInfo}>
            <Text style={[styles.settingsTitle, { color: theme.text }]}>Dashboard Wallpaper</Text>
            <Text style={[styles.settingsDescription, { color: theme.textSecondary }]}>
              {wallpaperUrl ? 'Custom wallpaper set' : 'Customize member dashboard appearance'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      )}

      <Modal
        visible={isModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleClose}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]} edges={['top']}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={handleClose}>
              <Text style={[styles.modalCancel, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Dashboard Appearance</Text>
            <TouchableOpacity onPress={saveSettings} disabled={isSaving}>
              {isSaving ? (
                <EduDashSpinner size="small" color={theme.primary} />
              ) : (
                <Text style={[styles.modalSave, { color: theme.primary }]}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={styles.modalScrollView}
            contentContainerStyle={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}
            showsVerticalScrollIndicator={false}
          >
            {/* Wallpaper Preview */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Wallpaper</Text>
              <Text style={[styles.sectionDescription, { color: theme.textSecondary }]}>
                This wallpaper will appear on all member dashboards in your organization.
              </Text>
              
              {/* Show selected image preview with crop/set options */}
              {selectedImageUri ? (
                <View style={styles.selectedImageContainer}>
                  <View style={[styles.wallpaperPreview, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Image 
                      source={{ uri: selectedImageUri }} 
                      style={styles.wallpaperImage}
                      resizeMode="cover"
                    />
                  </View>
                  <View style={styles.imageActionButtons}>
                    <TouchableOpacity 
                      style={[styles.imageActionButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                      onPress={cropAndSetImage}
                    >
                      <Ionicons name="crop-outline" size={20} color={theme.text} />
                      <Text style={[styles.imageActionText, { color: theme.text }]}>Crop</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.imageActionButton, styles.setButton]}
                      onPress={setWallpaperFromSelected}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <EduDashSpinner size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                          <Text style={styles.setButtonText}>Set Wallpaper</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.imageActionButton, { backgroundColor: '#EF444415', borderColor: '#EF4444' }]}
                      onPress={cancelImageSelection}
                    >
                      <Ionicons name="close-outline" size={20} color="#EF4444" />
                      <Text style={[styles.imageActionText, { color: '#EF4444' }]}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.wallpaperPreview, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={pickImage}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <EduDashSpinner size="large" color={theme.primary} />
                  ) : wallpaperUrl ? (
                    <>
                      <Image 
                        source={{ uri: wallpaperUrl }} 
                        style={[styles.wallpaperImage, { opacity }]}
                        resizeMode="cover"
                      />
                      <View style={styles.wallpaperOverlay}>
                        <Ionicons name="camera-outline" size={24} color="#fff" />
                        <Text style={styles.wallpaperOverlayText}>Change Wallpaper</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.wallpaperPlaceholder}>
                      <Ionicons name="cloud-upload-outline" size={48} color={theme.textSecondary} />
                      <Text style={[styles.wallpaperPlaceholderText, { color: theme.textSecondary }]}>
                        Tap to upload wallpaper
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}

              {wallpaperUrl && !selectedImageUri && (
                <TouchableOpacity style={styles.removeButton} onPress={removeWallpaper}>
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  <Text style={styles.removeButtonText}>Remove Wallpaper</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Opacity Slider */}
            {wallpaperUrl && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Opacity: {Math.round(opacity * 100)}%
                </Text>
                <Slider
                  style={styles.slider}
                  minimumValue={0.05}
                  maximumValue={0.5}
                  value={opacity}
                  onValueChange={setOpacity}
                  minimumTrackTintColor={theme.primary}
                  maximumTrackTintColor={theme.border}
                  thumbTintColor={theme.primary}
                />
                <View style={styles.sliderLabels}>
                  <Text style={[styles.sliderLabel, { color: theme.textSecondary }]}>Subtle</Text>
                  <Text style={[styles.sliderLabel, { color: theme.textSecondary }]}>Bold</Text>
                </View>
              </View>
            )}

            {/* Custom Greeting */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Custom Greeting</Text>
              <Text style={[styles.sectionDescription, { color: theme.textSecondary }]}>
                Optional welcome message for members.
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
                placeholder="e.g., Welcome to EduPro!"
                placeholderTextColor={theme.textSecondary}
                value={customGreeting}
                onChangeText={setCustomGreeting}
                maxLength={100}
              />
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
