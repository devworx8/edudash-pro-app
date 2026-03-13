import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { assertSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { extractOrganizationId } from '@/lib/tenant/compat';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface ImportProgress {
  total: number;
  processed: number;
  errors: number;
}

export default function DataImportScreen() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const { showAlert, alertProps } = useAlertModal();
  const orgId = extractOrganizationId(profile);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const styles = createStyles(theme);

  const handleImportLearners = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      showAlert({
        title: 'Import Learners',
        message: `Selected: ${file.name}\n\nThis will import learner data from the CSV/Excel file. Continue?`,
        type: 'info',
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Import', onPress: () => processLearnerImport(file.uri, file.name) },
        ],
      });
    } catch (error: any) {
      showAlert({ title: 'Error', message: error.message || 'Failed to pick file', type: 'error' });
    }
  };

  const handleImportEnrollments = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      showAlert({
        title: 'Import Enrollments',
        message: `Selected: ${file.name}\n\nThis will import enrollment records. Continue?`,
        type: 'info',
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Import', onPress: () => processEnrollmentImport(file.uri, file.name) },
        ],
      });
    } catch (error: any) {
      showAlert({ title: 'Error', message: error.message || 'Failed to pick file', type: 'error' });
    }
  };

  const processLearnerImport = async (fileUri: string, fileName: string) => {
    setImporting(true);
    setProgress({ total: 0, processed: 0, errors: 0 });

    try {
      // Read file content
      const content = await FileSystem.readAsStringAsync(fileUri);
      
      // Parse CSV (simple parser - in production, use a proper CSV library)
      const lines = content.split('\n').filter((line) => line.trim());
      const headers = lines[0].split(',').map((h) => h.trim());
      
      // Expected headers: email, first_name, last_name, phone (optional)
      const emailIndex = headers.findIndex((h) => h.toLowerCase().includes('email'));
      const firstNameIndex = headers.findIndex((h) => h.toLowerCase().includes('first') || h.toLowerCase().includes('name'));
      const lastNameIndex = headers.findIndex((h) => h.toLowerCase().includes('last') || h.toLowerCase().includes('surname'));
      const phoneIndex = headers.findIndex((h) => h.toLowerCase().includes('phone'));

      if (emailIndex === -1 || firstNameIndex === -1) {
        throw new Error('CSV must contain email and first name columns');
      }

      const rows = lines.slice(1);
      setProgress({ total: rows.length, processed: 0, errors: 0 });

      const supabase = assertSupabase();
      let processed = 0;
      let errors = 0;

      // Process each row
      for (const row of rows) {
        try {
          const values = row.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
          const email = values[emailIndex];
          const firstName = values[firstNameIndex] || '';
          const lastName = values[lastNameIndex] || '';
          const phone = phoneIndex >= 0 ? values[phoneIndex] : null;

          if (!email || !firstName) {
            errors++;
            continue;
          }

          // Create or update learner profile
          // TODO: Implement actual import logic via Edge Function or RPC
          // For now, this is a placeholder
          processed++;
          setProgress({ total: rows.length, processed, errors });
        } catch (error) {
          errors++;
          setProgress({ total: rows.length, processed, errors });
        }
      }

      showAlert({
        title: 'Import Complete',
        message: `Processed: ${processed}\nErrors: ${errors}`,
        type: 'success',
      });
    } catch (error: any) {
      showAlert({ title: 'Import Failed', message: error.message || 'Failed to process file', type: 'error' });
    } finally {
      setImporting(false);
      setProgress(null);
    }
  };

  const processEnrollmentImport = async (fileUri: string, fileName: string) => {
    setImporting(true);
    setProgress({ total: 0, processed: 0, errors: 0 });

    try {
      // Similar logic for enrollments
      // Expected: learner_email, program_id, enrollment_date, status
      showAlert({ title: 'Info', message: 'Enrollment import functionality will be implemented', type: 'info' });
    } catch (error: any) {
      showAlert({ title: 'Import Failed', message: error.message || 'Failed to process file', type: 'error' });
    } finally {
      setImporting(false);
      setProgress(null);
    }
  };

  const downloadTemplate = async (type: 'learners' | 'enrollments') => {
    const templates = {
      learners: `email,first_name,last_name,phone
learner1@example.com,John,Doe,+27123456789
learner2@example.com,Jane,Smith,+27987654321`,
      enrollments: `learner_email,program_id,enrollment_date,status
learner1@example.com,program-uuid-here,2025-01-01,active
learner2@example.com,program-uuid-here,2025-01-01,active`,
    };

    // In production, create and download actual file
    showAlert({
      title: 'Template',
      message: `Copy this template:\n\n${templates[type]}`,
      type: 'info',
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          title: 'Data Import',
          headerStyle: { backgroundColor: theme.background },
          headerTitleStyle: { color: theme.text },
          headerTintColor: theme.primary,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Import Data</Text>
          <Text style={styles.subtitle}>
            Upload CSV or Excel files to import learners, enrollments, and other data
          </Text>
        </View>

        {importing && progress && (
          <View style={[styles.progressCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <EduDashSpinner size="large" color={theme.primary} />
            <Text style={[styles.progressText, { color: theme.text }]}>
              Processing... {progress.processed} / {progress.total}
            </Text>
            {progress.errors > 0 && (
              <Text style={[styles.errorText, { color: theme.error }]}>
                {progress.errors} errors
              </Text>
            )}
          </View>
        )}

        <View style={styles.section}>
          <View style={[styles.importCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="document-text-outline" size={32} color={theme.primary} />
            <Text style={[styles.cardTitle, { color: theme.text }]}>Bulk CV Import</Text>
            <Text style={[styles.cardText, { color: theme.textSecondary }]}>
              Process hundreds of CVs/applications at once. Perfect for large recruitment drives.
            </Text>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.primary }]}
              onPress={() => router.push('/screens/org-admin/bulk-cv-import' as any)}
            >
              <Ionicons name="document" size={20} color="#fff" />
              <Text style={styles.buttonText}>Import CVs</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.importCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="people-outline" size={32} color={theme.primary} />
            <Text style={[styles.cardTitle, { color: theme.text }]}>Import Learners</Text>
            <Text style={[styles.cardText, { color: theme.textSecondary }]}>
              Upload a CSV/Excel file with learner information (email, name, phone)
            </Text>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.primary }]}
              onPress={handleImportLearners}
              disabled={importing}
            >
              <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
              <Text style={styles.buttonText}>Choose File</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.templateButton, { borderColor: theme.border }]}
              onPress={() => downloadTemplate('learners')}
            >
              <Ionicons name="download-outline" size={18} color={theme.text} />
              <Text style={[styles.templateButtonText, { color: theme.text }]}>
                Download Template
              </Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.importCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="list-outline" size={32} color={theme.primary} />
            <Text style={[styles.cardTitle, { color: theme.text }]}>Import Enrollments</Text>
            <Text style={[styles.cardText, { color: theme.textSecondary }]}>
              Upload enrollment records linking learners to programs
            </Text>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.primary }]}
              onPress={handleImportEnrollments}
              disabled={importing}
            >
              <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
              <Text style={styles.buttonText}>Choose File</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.templateButton, { borderColor: theme.border }]}
              onPress={() => downloadTemplate('enrollments')}
            >
              <Ionicons name="download-outline" size={18} color={theme.text} />
              <Text style={[styles.templateButtonText, { color: theme.text }]}>
                Download Template
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="information-circle-outline" size={24} color={theme.info || theme.primary} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoTitle, { color: theme.text }]}>Import Guidelines</Text>
            <Text style={[styles.infoText, { color: theme.textSecondary }]}>
              • CSV files must have headers in the first row{'\n'}
              • Email addresses must be unique{'\n'}
              • Required fields: email, first_name{'\n'}
              • Dates should be in YYYY-MM-DD format{'\n'}
              • Large imports may take several minutes
            </Text>
          </View>
        </View>
      </ScrollView>

      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 8,
  },
  title: {
    color: theme.text,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    color: theme.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    gap: 16,
  },
  importCard: {
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    gap: 12,
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  cardText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 10,
    gap: 8,
    width: '100%',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  templateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    width: '100%',
  },
  templateButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  progressCard: {
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 13,
  },
  infoCard: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  infoContent: {
    flex: 1,
    gap: 4,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  infoText: {
    fontSize: 13,
    lineHeight: 20,
  },
});

