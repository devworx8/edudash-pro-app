/**
 * Member ID Card Screen
 * Full-screen ID card view with flip animation, print & share
 * 
 * Refactored to use modular components following WARP.md standards
 */
import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView, Share, Modal, Image } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import { ensureImageLibraryPermission } from '@/lib/utils/mediaLibrary';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { MemberIDCardFront, MemberIDCardBack } from '@/components/membership/MemberIDCard';
import { DashboardWallpaperBackground } from '@/components/membership/dashboard';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { CARD_TEMPLATES, CardTemplate, isExecutiveMemberType } from '@/components/membership/types';
import { generateCardPrintHTML } from '@/components/membership/id-card';
import { useIDCard } from '@/hooks/membership';
import { MemberPhotoService } from '@/services/MemberPhotoService';
import { useQueryClient } from '@tanstack/react-query';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { logger } from '@/lib/logger';
export default function MemberIDCardScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { memberId } = useLocalSearchParams<{ memberId?: string }>();
  const { showAlert, alertProps } = useAlertModal();
  
  const { loading, member, card, selectedTemplate, setSelectedTemplate, refetch } = useIDCard(memberId);
  
  const [isFlipped, setIsFlipped] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [showImagePreview, setShowImagePreview] = useState(false);

  // Check if current user can upload photo (must be executive and own card)
  // When viewing own card (no memberId), allow upload if executive member type
  // When viewing another member's card (memberId provided), only allow if that member belongs to current user
  const canUploadPhoto = member && 
    isExecutiveMemberType(member.member_type) && 
    (memberId ? (member.user_id === user?.id) : true); // If no memberId, assume own card (queried by user_id)
  
  const flipAnimation = useRef(new Animated.Value(0)).current;

  const handleFlip = () => {
    Animated.spring(flipAnimation, {
      toValue: isFlipped ? 0 : 1,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();
    setIsFlipped(!isFlipped);
  };

  const frontInterpolate = flipAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const backInterpolate = flipAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });

  const handlePrint = async () => {
    try {
      setIsGeneratingPDF(true);
      const html = generateCardPrintHTML(member, card, selectedTemplate);
      await Print.printAsync({ html });
    } catch (error) {
      showAlert({ title: 'Error', message: 'Failed to print ID card' });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleSavePDF = async () => {
    try {
      setIsGeneratingPDF(true);
      const html = generateCardPrintHTML(member, card, selectedTemplate);
      const { uri } = await Print.printToFileAsync({ html });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save ID Card PDF',
        });
      }
    } catch (error) {
      showAlert({ title: 'Error', message: 'Failed to save ID card as PDF' });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `${member.first_name} ${member.last_name}\nMember ID: ${member.member_number}\nOrganization: ${member.organization?.name || 'EduPro'}\nStatus: ${member.membership_status}`,
        title: 'My Membership ID',
      });
    } catch (error) {
      // User cancelled
    }
  };

  const handleUploadPhoto = async () => {
    if (!member || !user) return;

    showAlert({
      title: 'Upload ID Card Photo',
      message: 'Choose an option to upload your photo for the ID card',
      buttons: [
        {
          text: 'Take Photo',
          onPress: async () => {
            try {
              const { status } = await ImagePicker.requestCameraPermissionsAsync();
              if (status !== 'granted') {
                showAlert({ title: 'Permission Required', message: 'Camera permission is required to take a photo.' });
                return;
              }
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: false, // Don't edit immediately - show preview first
                quality: 0.9,
              });
              if (!result.canceled && result.assets[0]) {
                setSelectedImageUri(result.assets[0].uri);
                setShowImagePreview(true);
              }
            } catch (error) {
              showAlert({ title: 'Error', message: 'Failed to take photo' });
            }
          },
        },
        {
          text: 'Choose from Library',
          onPress: async () => {
            try {
              const hasPermission = await ensureImageLibraryPermission();
              if (!hasPermission) {
                showAlert({ title: 'Permission Required', message: 'Photo library permission is required.' });
                return;
              }
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: false, // Don't edit immediately - show preview first
                quality: 0.9,
              });
              if (!result.canceled && result.assets[0]) {
                setSelectedImageUri(result.assets[0].uri);
                setShowImagePreview(true);
              }
            } catch (error) {
              showAlert({ title: 'Error', message: 'Failed to select image' });
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  };

  const handleCropImage = async () => {
    if (!selectedImageUri) return;
    
    try {
      // Request permissions
      const hasPermission = await ensureImageLibraryPermission();
      if (!hasPermission) {
        showAlert({ title: 'Permission Required', message: 'Photo library permission is required to crop the image.' });
        return;
      }

      // Open image picker with editing enabled for cropping
      // User can select the same image or a different one
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1], // Square aspect ratio for ID card
        quality: 0.9,
      });

      if (!result.canceled && result.assets[0]) {
        // Update preview with cropped image
        setSelectedImageUri(result.assets[0].uri);
      }
    } catch (error) {
      logger.error('Crop image error:', error);
      showAlert({ title: 'Error', message: 'Failed to crop image' });
    }
  };

  const handleSetImage = async () => {
    if (!selectedImageUri) return;
    
    setShowImagePreview(false);
    await uploadPhoto(selectedImageUri);
    setSelectedImageUri(null);
  };

  const handleCancelImageSelection = () => {
    setShowImagePreview(false);
    setSelectedImageUri(null);
  };

  const uploadPhoto = async (uri: string) => {
    if (!member || !user) return;

    setUploadingPhoto(true);
    try {
      // Validate image first
      const validation = await MemberPhotoService.validateImage(uri);
      if (!validation.valid) {
        showAlert({ title: 'Invalid Image', message: validation.error || 'Please select a valid image' });
        setUploadingPhoto(false);
        return;
      }

      const result = await MemberPhotoService.uploadMemberPhoto(
        user.id,
        member.id,
        uri
      );

      if (result.success && result.publicUrl) {
        // Invalidate queries to refresh member data
        queryClient.invalidateQueries({ queryKey: ['youth-members'] });
        queryClient.invalidateQueries({ queryKey: ['id-card'] });
        
        // Refetch member data
        await refetch();
        
        showAlert({ title: 'Success', message: 'ID card photo updated successfully!' });
      } else {
        showAlert({ title: 'Upload Failed', message: result.error || 'Failed to upload photo' });
      }
    } catch (error: any) {
      logger.error('Upload photo error:', error);
      showAlert({ title: 'Error', message: error?.message || 'Failed to upload photo' });
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
        <View style={[styles.customHeader, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Member ID Card</Text>
          </View>
          <View style={styles.headerButton} />
        </View>
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading your ID card...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      {/* Custom Header */}
      <View style={[styles.customHeader, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Member ID Card</Text>
        </View>
        <TouchableOpacity onPress={handleShare} style={styles.headerButton}>
          <Ionicons name="share-outline" size={24} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <DashboardWallpaperBackground>
      <ScrollView 
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Card Preview */}
        <View style={styles.cardContainer}>
          <TouchableOpacity onPress={handleFlip} activeOpacity={0.9}>
            <View style={styles.cardTouchable}>
              <Animated.View 
                style={[
                  styles.cardFront,
                  { 
                    transform: [{ rotateY: frontInterpolate }],
                    opacity: isFlipped ? 0 : 1,
                  },
                ]}
              >
                <MemberIDCardFront 
                  member={member} 
                  card={card} 
                  template={selectedTemplate}
                />
              </Animated.View>
              
              <Animated.View 
                style={[
                  styles.cardBack,
                  { 
                    transform: [{ rotateY: backInterpolate }],
                    opacity: isFlipped ? 1 : 0,
                  },
                ]}
              >
                <MemberIDCardBack 
                  member={member} 
                  card={card} 
                  template={selectedTemplate}
                />
              </Animated.View>
            </View>
          </TouchableOpacity>
          
          <Text style={[styles.flipHint, { color: theme.textSecondary }]}>
            <Ionicons name="sync-outline" size={14} /> Tap card to flip
          </Text>

          {/* Upload Photo Button - Only for executives */}
          {canUploadPhoto && (
            <TouchableOpacity
              style={[styles.uploadPhotoButton, { backgroundColor: theme.primary }]}
              onPress={handleUploadPhoto}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? (
                <EduDashSpinner size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={18} color="#fff" />
                  <Text style={styles.uploadPhotoText}>
                    {member.photo_url ? 'Update Photo' : 'Upload Photo'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Template Selector */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Card Style</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.templateRow}>
              {Object.entries(CARD_TEMPLATES).map(([key, config]) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.templateOption,
                    { 
                      borderColor: selectedTemplate === key ? config.primaryColor : theme.border,
                      borderWidth: selectedTemplate === key ? 2 : 1,
                    }
                  ]}
                  onPress={() => setSelectedTemplate(key as CardTemplate)}
                >
                  <LinearGradient
                    colors={config.gradientColors as [string, string]}
                    style={styles.templatePreview}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  />
                  <Text style={[styles.templateName, { color: theme.text }]}>
                    {config.name}
                  </Text>
                  {selectedTemplate === key && (
                    <View style={[styles.checkBadge, { backgroundColor: config.primaryColor }]}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Card Info */}
        <View style={[styles.infoCard, { backgroundColor: theme.card }]}>
          <View style={styles.infoRow}>
            <Ionicons name="card-outline" size={20} color={theme.primary} />
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Card Number</Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>{card.card_number}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={20} color={theme.primary} />
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Valid Until</Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>
                {new Date(card.expiry_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark-outline" size={20} color={theme.primary} />
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Verification Count</Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>{card.verification_count} times</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={[styles.actionBar, { backgroundColor: theme.background, paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity 
          style={[styles.actionButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={handleSavePDF}
          disabled={isGeneratingPDF}
        >
          {isGeneratingPDF ? (
            <EduDashSpinner size="small" color={theme.primary} />
          ) : (
            <>
              <Ionicons name="download-outline" size={22} color={theme.primary} />
              <Text style={[styles.actionButtonText, { color: theme.primary }]}>Save PDF</Text>
            </>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.actionButton, styles.primaryButton, { backgroundColor: theme.primary }]}
          onPress={handlePrint}
          disabled={isGeneratingPDF}
        >
          {isGeneratingPDF ? (
            <EduDashSpinner size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="print-outline" size={22} color="#fff" />
              <Text style={[styles.actionButtonText, { color: '#fff' }]}>Print Card</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
      </DashboardWallpaperBackground>

      {/* Image Preview Modal with Crop and Set buttons */}
      <Modal
        visible={showImagePreview}
        transparent
        animationType="fade"
        onRequestClose={handleCancelImageSelection}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Preview Photo</Text>
              <TouchableOpacity
                onPress={handleCancelImageSelection}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            {selectedImageUri && (
              <View style={styles.imagePreviewContainer}>
                <Image
                  source={{ uri: selectedImageUri }}
                  style={styles.imagePreview}
                  resizeMode="contain"
                />
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cropButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={handleCropImage}
              >
                <Ionicons name="crop-outline" size={20} color={theme.primary} />
                <Text style={[styles.modalButtonText, { color: theme.primary }]}>Crop</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.setButton, { backgroundColor: theme.primary }]}
                onPress={handleSetImage}
                disabled={uploadingPhoto}
              >
                {uploadingPhoto ? (
                  <EduDashSpinner size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                    <Text style={[styles.modalButtonText, { color: '#fff' }]}>Set Photo</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
    <AlertModal {...alertProps} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    marginTop: 8,
  },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerCenter: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerButton: {
    padding: 4,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  cardContainer: {
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
  },
  cardTouchable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFront: {},
  cardBack: {
    position: 'absolute',
    top: 0,
  },
  flipHint: {
    marginTop: 16,
    fontSize: 13,
    textAlign: 'center',
  },
  uploadPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 16,
  },
  uploadPhotoText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  section: {
    width: '100%',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  templateRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 4,
  },
  templateOption: {
    width: 80,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  templatePreview: {
    height: 50,
  },
  templateName: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 8,
  },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCard: {
    width: '100%',
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  primaryButton: {
    borderWidth: 0,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalCloseButton: {
    padding: 4,
  },
  imagePreviewContainer: {
    width: '100%',
    height: 300,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  modalButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  cropButton: {
    // Styled via backgroundColor and borderColor props
  },
  setButton: {
    // Styled via backgroundColor prop
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
