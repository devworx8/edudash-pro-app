/**
 * CV Upload Processing Screen
 * 
 * Allows organizations to upload CVs (PDF, DOCX, images) for processing
 * Supports bulk upload and automatic parsing
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Stack, router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/rbac';
import { ensureImageLibraryPermission } from '@/lib/utils/mediaLibrary';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { clampPercent } from '@/lib/progress/clampPercent';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export default function CVUploadScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { profile } = useAuth();
  const { showAlert, alertProps } = useAlertModal();
  const styles = createStyles(theme);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const safeUploadProgress = clampPercent(uploadProgress, { source: 'org-admin/cv-upload.upload-progress' });

  const normalizedRole = profile?.role ? normalizeRole(profile.role) : null;
  const canUploadCVs =
    normalizedRole === 'principal_admin' ||
    normalizedRole === 'super_admin' ||
    normalizedRole === 'principal';

  const handlePickDocument = async () => {
    try {
      if (!canUploadCVs) {
        showAlert({
          title: t('common.permission_denied', { defaultValue: 'Permission Denied' }),
          message: t('cv_upload.permission_required', { defaultValue: 'You do not have permission to upload CVs.' }),
          type: 'warning',
        });
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (!result.canceled && result.assets) {
        await processFiles(result.assets);
      }
    } catch (error: any) {
      showAlert({
        title: t('cv_upload.error', { defaultValue: 'Error' }),
        message: error.message || t('cv_upload.pick_error', { defaultValue: 'Failed to pick documents' }),
        type: 'error',
      });
    }
  };

  const handlePickImages = async () => {
    try {
      if (!canUploadCVs) {
        showAlert({
          title: t('common.permission_denied', { defaultValue: 'Permission Denied' }),
          message: t('cv_upload.permission_required', { defaultValue: 'You do not have permission to upload CVs.' }),
          type: 'warning',
        });
        return;
      }

      const hasPermission = await ensureImageLibraryPermission();
      if (!hasPermission) {
        showAlert({
          title: t('common.permission_required', { defaultValue: 'Permission Required' }),
          message: t('cv_upload.photo_permission', { defaultValue: 'Please grant photo library access' }),
          type: 'warning',
        });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        await processFiles(result.assets.map(asset => ({
          uri: asset.uri,
          name: asset.fileName || `image_${Date.now()}.jpg`,
          mimeType: 'image/jpeg',
          size: asset.fileSize || 0,
        })));
      }
    } catch (error: any) {
      showAlert({
        title: t('cv_upload.error', { defaultValue: 'Error' }),
        message: error.message || t('cv_upload.pick_error', { defaultValue: 'Failed to pick images' }),
        type: 'error',
      });
    }
  };

  const processFiles = async (files: any[]) => {
    if (!profile?.organization_id) {
      showAlert({
        title: t('common.error', { defaultValue: 'Error' }),
        message: t('cv_upload.no_organization', { defaultValue: 'No organization found' }),
        type: 'error',
      });
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const processedFiles = [];
      const supabase = assertSupabase();
      const bucket = 'cv-uploads';

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(((i + 1) / files.length) * 100);

        // Upload file to Supabase Storage
        const fileExt = file.name.split('.').pop();
        const safeExt = (fileExt || 'bin').toLowerCase();
        const fileName = `${profile.organization_id}/cvs/${Date.now()}_${Math.random().toString(36).substring(7)}.${safeExt}`;
        
        const mimeType = file.mimeType || 'application/octet-stream';
        // Basic validation: reject obviously huge files
        const size = typeof file.size === 'number' ? file.size : 0;
        const maxBytes = 25 * 1024 * 1024; // 25MB
        if (size > maxBytes) {
          processedFiles.push({
            ...file,
            status: 'error',
            error: t('cv_upload.file_too_large', { defaultValue: 'File is too large (max 25MB).' }),
          });
          continue;
        }

        // Read local file into a Blob (works for Expo-managed RN)
        const res = await fetch(file.uri);
        const blob = await res.blob();

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(fileName, blob, { contentType: mimeType, upsert: false });

        if (uploadError) {
          processedFiles.push({
            ...file,
            status: 'error',
            error: uploadError.message,
          });
          continue;
        }

        // Call Edge Function to process CV
        const { data: processData, error: processError } = await supabase.functions.invoke(
          'process-cv-upload',
          {
            body: {
              file_url: fileName, // Storage path within bucket
              organization_id: profile.organization_id,
              file_type: safeExt,
              storage_bucket: bucket,
            },
          }
        );

        if (processError) {
          console.error('CV processing error:', processError);
          processedFiles.push({
            ...file,
            status: 'error',
            error: processError.message,
          });
        } else {
          processedFiles.push({
            ...file,
            status: 'success',
            processed_data: processData,
            file_url: fileName,
          });
        }
      }

      setUploadedFiles([...uploadedFiles, ...processedFiles]);
      showAlert({
        title: t('common.success', { defaultValue: 'Success' }),
        message: t('cv_upload.uploaded', { defaultValue: `${files.length} file(s) uploaded successfully` }),
        type: 'success',
      });
    } catch (error: any) {
      showAlert({
        title: t('cv_upload.error', { defaultValue: 'Error' }),
        message: error.message || t('cv_upload.upload_failed', { defaultValue: 'Failed to upload files' }),
        type: 'error',
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: t('cv_upload.title', { defaultValue: 'Upload CVs' }),
          headerBackTitle: t('common.back', { defaultValue: 'Back' }),
        }} 
      />
      <ScrollView contentContainerStyle={styles.content}>
        {!canUploadCVs && (
          <Card padding={20} margin={0} elevation="small" style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t('common.permission_denied', { defaultValue: 'Permission Denied' })}
            </Text>
            <Text style={styles.instructionText}>
              {t('cv_upload.permission_required', { defaultValue: 'You do not have permission to upload CVs.' })}
            </Text>
            <TouchableOpacity
              style={[styles.uploadButton, { backgroundColor: theme.primary }]}
              onPress={() => router.back()}
            >
              <Text style={styles.uploadButtonText}>{t('common.go_back', { defaultValue: 'Go Back' })}</Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* Instructions */}
        <Card padding={20} margin={0} elevation="small" style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('cv_upload.instructions', { defaultValue: 'How to Upload CVs' })}
          </Text>
          <Text style={styles.instructionText}>
            {t('cv_upload.instruction_text', {
              defaultValue: 'Upload CV files (PDF, DOCX) or images for automatic processing. The system will extract key information and create learner profiles.',
            })}
          </Text>
          <View style={styles.supportedFormats}>
            <Text style={styles.formatLabel}>
              {t('cv_upload.supported_formats', { defaultValue: 'Supported formats:' })}
            </Text>
            <Text style={styles.formatList}>• PDF (.pdf)</Text>
            <Text style={styles.formatList}>• Word Documents (.docx)</Text>
            <Text style={styles.formatList}>• Images (.jpg, .png)</Text>
          </View>
        </Card>

        {/* Upload Buttons */}
        <View style={styles.uploadSection}>
          <TouchableOpacity
            style={[styles.uploadButton, { backgroundColor: theme.primary }]}
            onPress={handlePickDocument}
            disabled={uploading || !canUploadCVs}
          >
            <Ionicons name="document-text-outline" size={24} color="#fff" />
            <Text style={styles.uploadButtonText}>
              {t('cv_upload.upload_documents', { defaultValue: 'Upload Documents (PDF/DOCX)' })}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.uploadButton, styles.secondaryButton, { borderColor: theme.border }]}
            onPress={handlePickImages}
            disabled={uploading || !canUploadCVs}
          >
            <Ionicons name="image-outline" size={24} color={theme.text} />
            <Text style={[styles.uploadButtonText, styles.secondaryButtonText, { color: theme.text }]}>
              {t('cv_upload.upload_images', { defaultValue: 'Upload Images' })}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Upload Progress */}
        {uploading && (
          <Card padding={20} margin={0} elevation="small" style={styles.section}>
            <View style={styles.progressContainer}>
              <EduDashSpinner size="large" color={theme.primary} />
              <Text style={styles.progressText}>
                {t('cv_upload.uploading', { defaultValue: 'Uploading and processing...' })} {Math.round(uploadProgress)}%
              </Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${safeUploadProgress}%`, backgroundColor: theme.primary },
                  ]}
                />
              </View>
            </View>
          </Card>
        )}

        {/* Uploaded Files List */}
        {uploadedFiles.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t('cv_upload.uploaded_files', { defaultValue: 'Uploaded Files' })} ({uploadedFiles.length})
            </Text>
            {uploadedFiles.map((file, index) => (
              <Card key={index} padding={16} margin={0} elevation="small" style={styles.fileCard}>
                <View style={styles.fileHeader}>
                  <Ionicons
                    name={file.status === 'success' ? 'checkmark-circle' : 'close-circle'}
                    size={24}
                    color={file.status === 'success' ? theme.success || '#10B981' : theme.error || '#EF4444'}
                  />
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName}>{file.name}</Text>
                    <Text style={styles.fileStatus}>
                      {file.status === 'success'
                        ? t('cv_upload.processed', { defaultValue: 'Processed' })
                        : t('cv_upload.failed', { defaultValue: 'Failed' })}
                    </Text>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}

        {/* Note about Edge Function */}
        <Card padding={16} margin={0} elevation="small" style={styles.noteCard}>
          <Ionicons name="information-circle-outline" size={20} color={theme.primary} />
          <Text style={styles.noteText}>
            {t('cv_upload.note', {
              defaultValue: 'CV processing requires an Edge Function. Contact support to enable this feature.',
            })}
          </Text>
        </Card>
      </ScrollView>

      <AlertModal {...alertProps} />
    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  content: { padding: 16, paddingBottom: 32 },
  section: { marginBottom: 16 },
  sectionTitle: { color: theme.text, fontSize: 18, fontWeight: '700', marginBottom: 12 },
  instructionText: { color: theme.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  supportedFormats: { marginTop: 8 },
  formatLabel: { color: theme.text, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  formatList: { color: theme.textSecondary, fontSize: 14, marginBottom: 4 },
  uploadSection: { gap: 12, marginBottom: 16 },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  uploadButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: { backgroundColor: 'transparent', borderWidth: 2 },
  secondaryButtonText: { color: theme.text },
  progressContainer: { alignItems: 'center', gap: 12 },
  progressText: { color: theme.text, fontSize: 14, fontWeight: '600' },
  progressBar: { width: '100%', height: 8, backgroundColor: theme.border, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  fileCard: { marginBottom: 12 },
  fileHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fileInfo: { flex: 1 },
  fileName: { color: theme.text, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  fileStatus: { color: theme.textSecondary, fontSize: 12 },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: theme.surface,
  },
  noteText: { flex: 1, color: theme.textSecondary, fontSize: 13, lineHeight: 18 },
});
