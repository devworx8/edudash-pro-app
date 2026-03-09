import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { useTheme, type ThemeColors } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { BirthdayMemoriesService } from '@/features/birthday-memories/services/BirthdayMemoriesService';
import type { BirthdayMemoryEvent, BirthdayMemoryMedia } from '@/features/birthday-memories/types/birthdayMemories.types';
import { BirthdayMontageService, type MontageJob } from '@/features/birthday-memories/services/BirthdayMontageService';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export default function BirthdayMemoriesScreen() {
  const params = useLocalSearchParams();
  const { theme } = useTheme();
  const { profile } = useAuth();
  const { showAlert, alertProps } = useAlertModal();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const organizationId = typeof params.organizationId === 'string' ? params.organizationId : null;
  const birthdayStudentId = typeof params.birthdayStudentId === 'string' ? params.birthdayStudentId : null;
  const eventDate = typeof params.eventDate === 'string' ? params.eventDate : null;

  const [event, setEvent] = useState<BirthdayMemoryEvent | null>(null);
  const [media, setMedia] = useState<BirthdayMemoryMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [montageJob, setMontageJob] = useState<MontageJob | null>(null);
  const [montageLoading, setMontageLoading] = useState(false);
  const [montageSending, setMontageSending] = useState(false);

  const canUpload = ['teacher', 'principal', 'admin', 'super_admin', 'principal_admin'].includes(String(profile?.role || ''));
  const isParent = ['parent', 'guardian', 'sponsor'].includes(String(profile?.role || ''));
  const montageReady = !!montageJob && montageJob.status === 'ready' && !!montageJob.output_path;
  const montageSent = !!montageJob?.sent_at;

  const loadEvent = useCallback(async () => {
    if (!birthdayStudentId || !eventDate) return;
    const created = await BirthdayMemoriesService.getOrCreateEvent({
      birthdayStudentId,
      eventDate,
    });
    setEvent(created);
  }, [birthdayStudentId, eventDate]);

  const loadMedia = useCallback(async () => {
    if (!event?.id) return;
    const items = await BirthdayMemoriesService.listMedia(event.id);
    setMedia(items);
  }, [event?.id]);

  const loadMontageStatus = useCallback(async () => {
    if (!event?.id) return;
    setMontageLoading(true);
    const job = await BirthdayMontageService.status(event.id);
    setMontageJob(job);
    setMontageLoading(false);
  }, [event?.id]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      if (!birthdayStudentId || !eventDate) {
        setLoading(false);
        return;
      }
      await loadEvent();
      if (mounted) {
        setLoading(false);
      }
    };
    void init();
    return () => {
      mounted = false;
    };
  }, [birthdayStudentId, eventDate, loadEvent]);

  useEffect(() => {
    void loadMedia();
  }, [loadMedia]);

  useEffect(() => {
    void loadMontageStatus();
  }, [loadMontageStatus]);

  const handlePick = useCallback(async () => {
    if (!event?.id || !organizationId) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert({ title: 'Permission required', message: 'Allow access to your media library to upload memories.', type: 'warning' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.9,
    });

    if (result.canceled) return;

    setUploading(true);
    try {
      for (const asset of result.assets) {
        const mediaType = asset.type === 'video' ? 'video' : 'image';
        await BirthdayMemoriesService.uploadMedia({
          eventId: event.id,
          organizationId,
          mediaType,
          fileUri: asset.uri,
          fileName: asset.fileName || undefined,
          webFile: (asset as any).file,
        });
      }
      await loadMedia();
    } catch (err) {
      showAlert({ title: 'Upload failed', message: err instanceof Error ? err.message : 'Unable to upload media', type: 'error' });
    } finally {
      setUploading(false);
    }
  }, [event?.id, organizationId, loadMedia]);

  const handleView = useCallback(async (item: BirthdayMemoryMedia) => {
    const url = await BirthdayMemoriesService.getViewUrl(item.id);
    if (!url) {
      showAlert({ title: 'Unable to open media', type: 'error' });
      return;
    }
    if (item.mediaType === 'image') {
      setPreviewUrl(url);
      setPreviewVisible(true);
      return;
    }
    await WebBrowser.openBrowserAsync(url);
  }, []);

  const handleDownload = useCallback(async (item: BirthdayMemoryMedia) => {
    const url = await BirthdayMemoriesService.getDownloadUrl(item.id);
    if (!url) {
      showAlert({ title: 'Download unavailable', message: 'Only parents of the birthday child can download.', type: 'warning' });
      return;
    }
    await WebBrowser.openBrowserAsync(url);
  }, []);

  const handleGenerateMontage = useCallback(async () => {
    if (!event?.id) return;
    const job = await BirthdayMontageService.queue(event.id);
    if (!job) {
      showAlert({ title: 'Unable to queue montage', type: 'error' });
      return;
    }
    setMontageJob(job);
    await loadMontageStatus();
    showAlert({ title: 'Montage queued', message: 'We are preparing the highlight video. You can preview it once it is ready.', type: 'success' });
  }, [event?.id, loadMontageStatus]);

  const handlePreviewMontage = useCallback(async () => {
    if (!event?.id) return;
    const url = await BirthdayMontageService.getViewUrl(event.id);
    if (!url) {
      showAlert({ title: 'Preview unavailable', message: 'The highlight video is not ready yet.', type: 'warning' });
      return;
    }
    await WebBrowser.openBrowserAsync(url);
  }, [event?.id]);

  const handleSendMontage = useCallback(async () => {
    if (!event?.id) return;
    setMontageSending(true);
    const updated = await BirthdayMontageService.approveAndSend(event.id);
    setMontageSending(false);
    if (!updated) {
      showAlert({ title: 'Unable to send', message: 'Please try again.', type: 'error' });
      return;
    }
    setMontageJob(updated);
    showAlert({ title: 'Sent', message: 'Highlight video approved and sent to parents.', type: 'success' });
  }, [event?.id]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Birthday Memories' }} />
      {loading ? (
        <View style={styles.center}>
          <EduDashSpinner color={theme.primary} />
          <Text style={styles.muted}>Loading memories...</Text>
        </View>
      ) : (
        <>
          <Text style={styles.title}>Birthday memories</Text>
          <Text style={styles.subtitle}>School-wide memories for this celebration.</Text>

          {canUpload && (
            <TouchableOpacity style={styles.uploadButton} onPress={handlePick} disabled={uploading}>
              <Text style={styles.uploadButtonText}>
                {uploading ? 'Uploading...' : 'Upload photos / videos'}
              </Text>
            </TouchableOpacity>
          )}

          {canUpload && (
            <TouchableOpacity style={styles.secondaryButtonWide} onPress={handleGenerateMontage}>
              <Text style={styles.secondaryButtonWideText}>Generate highlight video (optional)</Text>
            </TouchableOpacity>
          )}

          {(canUpload || isParent) && (
            <View style={styles.montageCard}>
              <Text style={styles.montageTitle}>Highlight video</Text>
              {montageLoading ? (
                <Text style={styles.muted}>Checking montage status...</Text>
              ) : montageJob ? (
                <Text style={styles.montageStatus}>
                  {montageJob.status === 'ready'
                    ? (montageSent ? 'Ready • Sent to parents' : 'Ready • Awaiting approval')
                    : montageJob.status === 'failed'
                      ? 'Failed • Please retry'
                      : 'Processing'}
                </Text>
              ) : (
                <Text style={styles.muted}>No highlight video queued yet.</Text>
              )}

              {canUpload && montageReady && (
                <View style={styles.montageActionsRow}>
                  <TouchableOpacity style={styles.secondaryButton} onPress={handlePreviewMontage}>
                    <Text style={styles.secondaryButtonText}>Preview</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryButton, montageSent && styles.primaryButtonDisabled]}
                    onPress={handleSendMontage}
                    disabled={montageSending || montageSent}
                  >
                    {montageSending ? (
                      <EduDashSpinner color="#fff" size="small" />
                    ) : (
                      <Text style={styles.primaryButtonText}>
                        {montageSent ? 'Sent' : 'Send to parents'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {isParent && montageReady && montageSent && (
                <TouchableOpacity style={styles.primaryButton} onPress={handlePreviewMontage}>
                  <Text style={styles.primaryButtonText}>View highlight video</Text>
                </TouchableOpacity>
              )}

              {isParent && montageReady && !montageSent && (
                <Text style={styles.muted}>Awaiting school approval before sharing.</Text>
              )}
            </View>
          )}

          <FlashList
            data={media}
            numColumns={2}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.muted}>No memories yet.</Text>}
            estimatedItemSize={150}
            renderItem={({ item }) => (
              <View style={styles.gridCard}>
                {item.mediaType === 'image' && (
                  <Image
                    source={{ uri: item.previewPath || item.storagePath }}
                    style={styles.thumbnail}
                    contentFit="cover"
                  />
                )}
                {item.mediaType === 'video' && (
                  <View style={styles.videoPlaceholder}>
                    <Text style={styles.videoBadge}>Video</Text>
                  </View>
                )}
                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => handleView(item)}>
                    <Text style={styles.secondaryButtonText}>View</Text>
                  </TouchableOpacity>
                  {isParent && (
                    <TouchableOpacity style={styles.primaryButton} onPress={() => handleDownload(item)}>
                      <Text style={styles.primaryButtonText}>Download</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          />

          <Modal visible={previewVisible} transparent animationType="fade" onRequestClose={() => setPreviewVisible(false)}>
            <View style={styles.previewBackdrop}>
              <View style={styles.previewCard}>
                {previewUrl && (
                  <Image source={{ uri: previewUrl }} style={styles.previewImage} contentFit="contain" />
                )}
                <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewVisible(false)}>
                  <Text style={styles.previewCloseText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </>
      )}

      <AlertModal {...alertProps} />
    </View>
  );
}

const createStyles = (theme: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
    padding: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.text,
  },
  subtitle: {
    fontSize: 13,
    color: theme.textSecondary,
    marginBottom: 12,
  },
  uploadButton: {
    backgroundColor: theme.primary,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 16,
  },
  uploadButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  list: {
    gap: 12,
  },
  gridRow: {
    gap: 12,
  },
  gridCard: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 10,
  },
  thumbnail: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    backgroundColor: theme.background,
    marginBottom: 8,
  },
  videoPlaceholder: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    backgroundColor: theme.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  videoBadge: {
    color: theme.text,
    fontWeight: '700',
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  previewCard: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 12,
  },
  previewImage: {
    width: '100%',
    height: 320,
    borderRadius: 10,
    backgroundColor: theme.background,
  },
  previewClose: {
    marginTop: 12,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: theme.primary,
  },
  previewCloseText: {
    color: '#fff',
    fontWeight: '700',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButtonWide: {
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 16,
  },
  secondaryButtonWideText: {
    color: theme.text,
    fontWeight: '600',
    fontSize: 12,
  },
  montageCard: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    backgroundColor: theme.surface,
    gap: 8,
  },
  montageTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.text,
  },
  montageStatus: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  montageActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  primaryButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.primary,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  secondaryButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  secondaryButtonText: {
    color: theme.text,
    fontWeight: '600',
    fontSize: 12,
  },
  muted: {
    fontSize: 12,
    color: theme.textSecondary,
  },
});
