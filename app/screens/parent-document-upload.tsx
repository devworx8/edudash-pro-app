/**
 * Parent Document Upload Screen
 *
 * Upload required registration documents (Birth Certificate, Clinic Card, Guardian ID).
 * Logic extracted to hooks/useDocumentUpload.ts. Styles extracted to .styles.ts.
 */
import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { Card } from '@/components/ui/Card';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { ImageConfirmModal } from '@/components/ui/ImageConfirmModal';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { useDocumentUpload, DOCUMENTS, type DocumentInfo } from '@/hooks/useDocumentUpload';
import { percentWidth } from '@/lib/progress/clampPercent';

export default function ParentDocumentUploadScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams();
  const { showAlert, alertProps } = useAlertModal();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const h = useDocumentUpload(
    showAlert,
    params.registrationId as string | undefined,
    params.studentId as string | undefined,
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ title: 'Upload Documents', headerBackTitle: 'Back' }} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <Card margin={8} padding={20}>
          <View style={styles.headerInfo}>
            <View style={[styles.headerIcon, { backgroundColor: theme.primary + '20' }]}>
              <Ionicons name="documents" size={32} color={theme.primary} />
            </View>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Required Documents</Text>
            <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
              Please upload the following documents to complete your child's registration.
            </Text>
          </View>
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: percentWidth((h.uploadedDocs.length / DOCUMENTS.length) * 100), backgroundColor: h.allDocsUploaded ? '#10B981' : theme.primary }]} />
            </View>
            <Text style={[styles.progressText, { color: theme.textSecondary }]}>
              {h.uploadedDocs.length} of {DOCUMENTS.length} documents uploaded
            </Text>
          </View>
        </Card>

        {h.loading && (
          <View style={styles.loadingContainer}>
            <EduDashSpinner size="large" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading documents...</Text>
          </View>
        )}

        {!h.loading && DOCUMENTS.map(doc => (
          <DocumentCard key={doc.type} doc={doc} theme={theme} styles={styles}
            uploaded={h.uploadedDocs.find(u => u.type === doc.type)}
            isUploading={h.uploading === doc.type} uploadProgress={h.uploadProgress}
            onView={h.handleViewDocument} onUpload={h.showUploadOptions} />
        ))}

        {h.allDocsUploaded && (
          <Card margin={8} padding={20}>
            <View style={styles.completionCard}>
              <View style={[styles.completionIcon, { backgroundColor: '#10B98120' }]}>
                <Ionicons name="checkmark-done-circle" size={40} color="#10B981" />
              </View>
              <Text style={[styles.completionTitle, { color: '#10B981' }]}>All Documents Uploaded! 🎉</Text>
              <Text style={[styles.completionSubtitle, { color: theme.textSecondary }]}>
                Your documents have been submitted for review. The school will verify them shortly.
              </Text>
            </View>
          </Card>
        )}

        <View style={styles.helpSection}>
          <Text style={[styles.helpTitle, { color: theme.text }]}>
            <Ionicons name="information-circle" size={16} color={theme.textSecondary} />{' '}Tips for uploading
          </Text>
          <Text style={[styles.helpText, { color: theme.textSecondary }]}>
            • Ensure documents are clear and readable{'\n'}• Take photos in good lighting{'\n'}• Make sure all text is visible{'\n'}• PDF or image files accepted (max 10MB)
          </Text>
        </View>
      </ScrollView>

      <ImageConfirmModal
        visible={!!h.pendingDocImage}
        imageUri={h.pendingDocImage?.uri ?? null}
        onConfirm={h.confirmPendingImage}
        onCancel={h.cancelPendingImage}
        title="Upload Document"
        confirmLabel="Upload"
        confirmIcon="cloud-upload-outline"
        loading={!!h.uploading}
      />
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

/* ── Document Card sub-component ── */
interface DocCardProps {
  doc: DocumentInfo; theme: any; styles: any;
  uploaded?: { url: string }; isUploading: boolean; uploadProgress: number;
  onView: (url: string) => void; onUpload: (type: any) => void;
}
const DocumentCard: React.FC<DocCardProps> = ({ doc, theme, styles, uploaded, isUploading, uploadProgress, onView, onUpload }) => (
  <Card margin={8} padding={16}>
    <View style={styles.docCard}>
      <View style={[styles.docIcon, { backgroundColor: doc.color + '20' }]}>
        <Ionicons name={doc.icon as any} size={28} color={doc.color} />
      </View>
      <View style={styles.docInfo}>
        <Text style={[styles.docLabel, { color: theme.text }]}>{doc.label}</Text>
        <Text style={[styles.docDescription, { color: theme.textSecondary }]}>{doc.description}</Text>
        {uploaded && (
          <View style={styles.uploadedBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#10B981" />
            <Text style={styles.uploadedText}>Uploaded</Text>
          </View>
        )}
      </View>
      <View style={styles.docActions}>
        {isUploading ? (
          <View style={styles.uploadingContainer}>
            <EduDashSpinner color={theme.primary} size="small" />
            <Text style={[styles.uploadProgressText, { color: theme.textSecondary }]}>{uploadProgress}%</Text>
            <View style={styles.uploadProgressBarContainer}>
              <View style={[styles.uploadProgressBar, { width: percentWidth(uploadProgress), backgroundColor: theme.primary }]} />
            </View>
          </View>
        ) : uploaded ? (
          <View style={styles.actionButtons}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.primary + '20' }]} onPress={() => onView(uploaded.url)}>
              <Ionicons name="eye" size={18} color={theme.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: doc.color + '20' }]} onPress={() => onUpload(doc.type)}>
              <Ionicons name="refresh" size={18} color={doc.color} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={[styles.uploadBtn, { backgroundColor: doc.color }]} onPress={() => onUpload(doc.type)}>
            <Ionicons name="cloud-upload" size={18} color="#fff" />
            <Text style={styles.uploadBtnText}>Upload</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  </Card>
);

/* ── Styles ── */
const createStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1 },
    content: { padding: 8, paddingBottom: 40 },
    headerInfo: { alignItems: 'center', marginBottom: 16 },
    headerIcon: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    headerTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
    headerSubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
    progressContainer: { marginTop: 16 },
    progressBar: { height: 8, backgroundColor: theme.border, borderRadius: 4, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 4 },
    progressText: { fontSize: 12, marginTop: 8, textAlign: 'center' },
    loadingContainer: { padding: 40, alignItems: 'center' },
    loadingText: { marginTop: 12, fontSize: 14 },
    docCard: { flexDirection: 'row', alignItems: 'center' },
    docIcon: { width: 56, height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    docInfo: { flex: 1, marginLeft: 12 },
    docLabel: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
    docDescription: { fontSize: 13 },
    uploadedBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
    uploadedText: { fontSize: 12, color: '#10B981', marginLeft: 4, fontWeight: '500' },
    docActions: { marginLeft: 12 },
    uploadingContainer: { alignItems: 'center', minWidth: 60 },
    uploadProgressText: { fontSize: 11, marginTop: 4, fontWeight: '500' },
    uploadProgressBarContainer: { width: 50, height: 4, backgroundColor: theme.border, borderRadius: 2, marginTop: 4, overflow: 'hidden' },
    uploadProgressBar: { height: '100%', borderRadius: 2 },
    actionButtons: { flexDirection: 'row', gap: 8 },
    actionBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    uploadBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, gap: 6 },
    uploadBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
    completionCard: { alignItems: 'center' },
    completionIcon: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    completionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
    completionSubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
    helpSection: { marginTop: 16, padding: 16 },
    helpTitle: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
    helpText: { fontSize: 13, lineHeight: 22 },
  });
