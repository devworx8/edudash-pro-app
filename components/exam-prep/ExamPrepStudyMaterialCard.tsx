import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { clampPercent } from '@/lib/progress/clampPercent';
import { examPrepWizardStyles as styles } from '@/components/exam-prep/examPrepWizard.styles';
import type { PdfSplitProgress, StudyMaterial } from '@/hooks/exam-prep/useStudyMaterialPipeline';
import type { ThemeColors } from '@/contexts/ThemeContext';

type Props = {
  theme: ThemeColors;
  isDark: boolean;
  readyMaterialSummaries: string[];
  pdfSplitProgress: PdfSplitProgress | null;
  splitProgressPercent: number;
  studyMaterials: StudyMaterial[];
  isMaterialPipelineBusy: boolean;
  hasBlockingMaterialErrors: boolean;
  failedMaterialCount: number;
  pausedMaterialCount: number;
  materialPipelineLabel: string;
  customPromptText: string;
  selectedExamTypeLabel: string;
  onSetCustomPromptText: (value: string) => void;
  onPickImage: () => void;
  onPickPdf: () => void;
  onRemoveMaterial: (id: string) => void;
  onRetryMaterial: (id: string) => void;
  onRetryFailed: () => void;
  onResumeQueue: () => void;
  onCancelQueue: () => void;
  onGenerate: () => void;
  onGenerateWithoutContext: () => void;
};

export function ExamPrepStudyMaterialCard({
  theme,
  isDark,
  readyMaterialSummaries,
  pdfSplitProgress,
  splitProgressPercent,
  studyMaterials,
  isMaterialPipelineBusy,
  hasBlockingMaterialErrors,
  failedMaterialCount,
  pausedMaterialCount,
  materialPipelineLabel,
  customPromptText,
  selectedExamTypeLabel,
  onSetCustomPromptText,
  onPickImage,
  onPickPdf,
  onRemoveMaterial,
  onRetryMaterial,
  onRetryFailed,
  onResumeQueue,
  onCancelQueue,
  onGenerate,
  onGenerateWithoutContext,
}: Props): React.ReactElement {
  const router = useRouter();
  const [previewMaterial, setPreviewMaterial] = useState<StudyMaterial | null>(null);

  const statusLabelById = useMemo(() => {
    const labels = new Map<string, string>();

    for (const material of studyMaterials) {
      const isImage = material.mimeType.startsWith('image/');
      const isPdf = material.mimeType.includes('pdf') || /\.pdf$/i.test(material.name);
      const baseStatus =
        material.status === 'queued'
          ? 'Queued for extraction...'
          : material.status === 'processing'
          ? 'Extracting study notes...'
          : material.status === 'paused_rate_limited'
          ? material.error || 'Paused by provider limits. Will auto-resume.'
          : material.status === 'ready'
          ? 'Ready for generation'
          : material.error || 'Could not read file';

      const isPreviewable = (isImage || isPdf) && material.status === 'ready';
      labels.set(material.id, isPreviewable ? `${baseStatus} - Tap to preview` : baseStatus);
    }

    return labels;
  }, [studyMaterials]);

  const handlePreviewMaterial = useCallback((material: StudyMaterial) => {
    if (material.status !== 'ready') {
      return;
    }

    if (!material.sourceUri) {
      Alert.alert('Preview unavailable', 'This file is missing a source URI.');
      return;
    }

    if (material.mimeType.startsWith('image/')) {
      setPreviewMaterial(material);
      return;
    }

    if (material.mimeType.includes('pdf') || /\.pdf$/i.test(material.name)) {
      router.push({
        pathname: '/screens/pdf-viewer',
        params: { localUri: material.sourceUri, title: material.name },
      });
      return;
    }

    Alert.alert('Preview unavailable', 'This file type cannot be previewed yet.');
  }, [router]);

  const closePreview = useCallback(() => {
    setPreviewMaterial(null);
  }, []);

  return (
    <>
      <View style={[styles.materialCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.materialHeader}>
          <Ionicons name="attach-outline" size={16} color={theme.primary} />
          <Text style={[styles.materialTitle, { color: theme.text }]}>Study Material (Optional)</Text>
        </View>
        {readyMaterialSummaries.length > 0 ? (
          <View
            style={[
              styles.uploadedMaterialBanner,
              { borderColor: `${theme.primary}55`, backgroundColor: `${theme.primary}18` },
            ]}
          >
            <Ionicons name="document-attach-outline" size={14} color={theme.primary} />
            <Text style={[styles.uploadedMaterialBannerText, { color: theme.primary }]}>
              Using uploaded material / Images / PDFs / Study Notes
            </Text>
          </View>
        ) : null}
        <Text style={[styles.materialSubtitle, { color: theme.muted }]}>
          Upload an image or PDF of homework/classwork so exam questions align with the learner&apos;s material. PDF uploads are processed page-by-page.
        </Text>
        {pdfSplitProgress ? (
          <View
            style={[
              styles.materialSplitCard,
              {
                borderColor: theme.border,
                backgroundColor: isDark ? 'rgba(99, 102, 241, 0.12)' : 'rgba(99, 102, 241, 0.08)',
              },
            ]}
          >
            <View style={styles.materialSplitHeader}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.materialSplitTitle, { color: theme.text }]}>Uploading PDF pages</Text>
            </View>
            <Text style={[styles.materialSplitMeta, { color: theme.muted }]} numberOfLines={1}>
              {pdfSplitProgress.fileName}
            </Text>
            <Text style={[styles.materialSplitMeta, { color: theme.muted }]}>
              {`${pdfSplitProgress.completedParts}/${pdfSplitProgress.totalParts} parts processed`}
            </Text>
            <View style={[styles.materialSplitTrack, { backgroundColor: theme.border }]}>
              <View
                style={[
                  styles.materialSplitFill,
                  {
                    width: `${clampPercent(splitProgressPercent, {
                      source: 'ExamPrepStudyMaterialCard.materialSplitProgress',
                      suppressTelemetry: true,
                    })}%`,
                    backgroundColor: theme.primary,
                  },
                ]}
              />
            </View>
          </View>
        ) : null}

        <View style={styles.materialActions}>
          <TouchableOpacity
            style={[styles.materialActionBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
            onPress={onPickImage}
            disabled={isMaterialPipelineBusy}
          >
            {isMaterialPipelineBusy ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Ionicons name="image-outline" size={14} color={theme.primary} />
            )}
            <Text style={[styles.materialActionText, { color: theme.text }]}>Add Image</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.materialActionBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
            onPress={onPickPdf}
            disabled={isMaterialPipelineBusy}
          >
            {isMaterialPipelineBusy ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Ionicons name="document-text-outline" size={14} color={theme.primary} />
            )}
            <Text style={[styles.materialActionText, { color: theme.text }]}>Add PDF</Text>
          </TouchableOpacity>
        </View>

        {(failedMaterialCount > 0 || pausedMaterialCount > 0 || isMaterialPipelineBusy) ? (
          <View style={styles.materialQueueActions}>
            <TouchableOpacity
              style={[styles.materialQueueActionBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
              onPress={onRetryFailed}
              disabled={failedMaterialCount <= 0}
            >
              <Ionicons name="refresh-outline" size={13} color={failedMaterialCount > 0 ? theme.primary : theme.muted} />
              <Text style={[styles.materialQueueActionText, { color: failedMaterialCount > 0 ? theme.text : theme.muted }]}>
                Retry failed
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.materialQueueActionBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
              onPress={onResumeQueue}
              disabled={pausedMaterialCount <= 0}
            >
              <Ionicons name="play-outline" size={13} color={pausedMaterialCount > 0 ? theme.primary : theme.muted} />
              <Text style={[styles.materialQueueActionText, { color: pausedMaterialCount > 0 ? theme.text : theme.muted }]}>
                Resume queue
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.materialQueueActionBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
              onPress={onCancelQueue}
              disabled={!isMaterialPipelineBusy}
            >
              <Ionicons name="close-outline" size={13} color={isMaterialPipelineBusy ? theme.error : theme.muted} />
              <Text style={[styles.materialQueueActionText, { color: isMaterialPipelineBusy ? theme.error : theme.muted }]}>
                Cancel queue
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {studyMaterials.map((material) => (
          <TouchableOpacity
            key={material.id}
            style={[styles.materialItem, { borderColor: theme.border, backgroundColor: theme.background }]}
            activeOpacity={material.status === 'ready' ? 0.85 : 1}
            onPress={() => handlePreviewMaterial(material)}
            disabled={material.status !== 'ready'}
          >
            {material.mimeType.startsWith('image/') && material.sourceUri ? (
              <Image
                source={{ uri: material.sourceUri }}
                style={[styles.materialThumb, { borderColor: theme.border, backgroundColor: theme.surface }]}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.materialThumbPlaceholder, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <Ionicons
                  name={material.mimeType.includes('pdf') ? 'document-text-outline' : 'document-outline'}
                  size={16}
                  color={theme.muted}
                />
              </View>
            )}
            <View style={styles.materialMeta}>
              <Text style={[styles.materialName, { color: theme.text }]} numberOfLines={1}>
                {material.name}
              </Text>
              <Text style={[styles.materialStatus, { color: theme.muted }]}>
                {statusLabelById.get(material.id) || 'Ready for generation'}
              </Text>
            </View>
            <View style={styles.materialRight}>
              {material.status === 'processing' || material.status === 'queued' || material.status === 'paused_rate_limited' ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : null}
              {material.status === 'error' ? (
                <TouchableOpacity
                  onPress={(event) => {
                    event.stopPropagation?.();
                    onRetryMaterial(material.id);
                  }}
                  style={[styles.materialRetryBtn, { borderColor: theme.primary }]}
                >
                  <Ionicons name="refresh-outline" size={12} color={theme.primary} />
                  <Text style={[styles.materialRetryText, { color: theme.primary }]}>Retry</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={(event) => {
                  event.stopPropagation?.();
                  onRemoveMaterial(material.id);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close-circle" size={18} color={theme.muted} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}

        <TextInput
          style={[
            styles.customPromptInput,
            {
              backgroundColor: theme.background,
              borderColor: theme.border,
              color: theme.text,
            },
          ]}
          placeholder="Add extra instructions (for example: focus on fractions and word problems)."
          placeholderTextColor={theme.muted}
          value={customPromptText}
          onChangeText={onSetCustomPromptText}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      <View style={styles.generateButtonBlock}>
        {isMaterialPipelineBusy ? (
          <View style={[styles.generateButtonDisabled, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={[styles.generateButtonDisabledText, { color: theme.muted }]}>
              {materialPipelineLabel}
            </Text>
          </View>
        ) : hasBlockingMaterialErrors ? (
          <View style={[styles.generateButtonDisabled, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="warning-outline" size={15} color={theme.warning} />
            <Text style={[styles.generateButtonDisabledText, { color: theme.warning }]}>
              Resolve failed materials (retry or remove) before generating.
            </Text>
          </View>
        ) : null}
        <TouchableOpacity
          style={[
            styles.generateButton,
            isMaterialPipelineBusy || hasBlockingMaterialErrors ? styles.generateButtonInactive : {},
            isMaterialPipelineBusy || hasBlockingMaterialErrors
              ? { backgroundColor: theme.border, opacity: 0.7 }
              : { backgroundColor: '#22c55e' },
          ]}
          onPress={isMaterialPipelineBusy || hasBlockingMaterialErrors ? undefined : onGenerate}
          disabled={isMaterialPipelineBusy || hasBlockingMaterialErrors}
        >
          <Ionicons name="sparkles" size={22} color="#ffffff" />
          <Text style={styles.generateButtonText}>Generate {selectedExamTypeLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.secondaryGenerateButton,
            { borderColor: theme.border, backgroundColor: theme.surface },
            isMaterialPipelineBusy || hasBlockingMaterialErrors ? { opacity: 0.6 } : {},
          ]}
          onPress={isMaterialPipelineBusy || hasBlockingMaterialErrors ? undefined : onGenerateWithoutContext}
          disabled={isMaterialPipelineBusy || hasBlockingMaterialErrors}
        >
          <Text style={[styles.secondaryGenerateText, { color: theme.text }]}>
            Generate without teacher context
          </Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={Boolean(previewMaterial)}
        transparent
        animationType="fade"
        onRequestClose={closePreview}
      >
        <View style={styles.materialPreviewOverlay}>
          <TouchableOpacity style={styles.materialPreviewBackdrop} onPress={closePreview} activeOpacity={1} />
          <View style={[styles.materialPreviewCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <View style={styles.materialPreviewHeader}>
              <Text style={[styles.materialPreviewTitle, { color: theme.text }]} numberOfLines={1}>
                {previewMaterial?.name || 'Image preview'}
              </Text>
              <TouchableOpacity onPress={closePreview} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            {previewMaterial?.sourceUri ? (
              <Image source={{ uri: previewMaterial.sourceUri }} style={styles.materialPreviewImage} resizeMode="contain" />
            ) : (
              <View style={styles.materialPreviewMissingState}>
                <Ionicons name="image-outline" size={24} color={theme.muted} />
                <Text style={[styles.materialPreviewMissingText, { color: theme.muted }]}>Preview unavailable</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
