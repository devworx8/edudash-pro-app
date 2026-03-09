import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import { assertSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { extractOrganizationId } from '@/lib/tenant/compat';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface ImportProgress {
  total: number;
  processed: number;
  created: number;
  updated: number;
  errors: number;
  errorsList: string[];
}

export default function BulkCVImportScreen() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const { showAlert, alertProps } = useAlertModal();
  const orgId = extractOrganizationId(profile);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const styles = createStyles(theme);

  const handleImportCVs = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      
      showAlert({
        title: 'Import CVs/Applications',
        message: `Selected: ${file.name}\n\nThis will process CV data and create learner profiles. Make sure your CSV has columns: email, first_name, last_name, phone, id_number (optional), notes (optional).\n\nContinue?`,
        type: 'info',
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Import', onPress: () => processCVImport(file.uri, file.name) },
        ],
      });
    } catch (error: any) {
      showAlert({ title: 'Error', message: error.message || 'Failed to pick file', type: 'error' });
    }
  };

  const processCVImport = async (fileUri: string, fileName: string) => {
    setImporting(true);
    setProgress({
      total: 0,
      processed: 0,
      created: 0,
      updated: 0,
      errors: 0,
      errorsList: [],
    });

    try {
      // Read file content
      const content = await FileSystem.readAsStringAsync(fileUri);
      
      // Parse CSV (simple parser - in production, use a proper CSV library like papaparse)
      const lines = content.split('\n').filter((line) => line.trim());
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''));
      
      // Expected headers mapping
      const emailIndex = headers.findIndex((h) => h.includes('email'));
      const firstNameIndex = headers.findIndex((h) => h.includes('first') && h.includes('name'));
      const lastNameIndex = headers.findIndex((h) => (h.includes('last') || h.includes('surname')) && h.includes('name'));
      const phoneIndex = headers.findIndex((h) => h.includes('phone') || h.includes('cell') || h.includes('mobile'));
      const idNumberIndex = headers.findIndex((h) => h.includes('id') && h.includes('number'));
      const notesIndex = headers.findIndex((h) => h.includes('note') || h.includes('comment') || h.includes('cv'));

      if (emailIndex === -1 || firstNameIndex === -1) {
        throw new Error('CSV must contain email and first_name columns');
      }

      const rows = lines.slice(1).filter((row) => row.trim());
      setProgress((prev) => prev ? { ...prev, total: rows.length } : null);

      const supabase = assertSupabase();
      let processed = 0;
      let created = 0;
      let updated = 0;
      let errors = 0;
      const errorsList: string[] = [];

      // Process each row
      for (const row of rows) {
        try {
          // Parse CSV row (handling quoted values)
          const values = row.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g)?.map((v) => 
            v.trim().replace(/^"|"$/g, '').trim()
          ) || row.split(',').map((v) => v.trim());
          
          const email = values[emailIndex]?.trim();
          const firstName = values[firstNameIndex]?.trim() || '';
          const lastName = values[lastNameIndex]?.trim() || '';
          const phone = phoneIndex >= 0 ? values[phoneIndex]?.trim() : null;
          const idNumber = idNumberIndex >= 0 ? values[idNumberIndex]?.trim() : null;
          const notes = notesIndex >= 0 ? values[notesIndex]?.trim() : null;

          if (!email || !firstName) {
            errors++;
            errorsList.push(`Row ${processed + 1}: Missing email or first name`);
            processed++;
            setProgress({
              total: rows.length,
              processed,
              created,
              updated,
              errors,
              errorsList: [...errorsList],
            });
            continue;
          }

          // Check if profile exists
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', email)
            .maybeSingle();

          if (existingProfile) {
            // Update existing profile
            await supabase
              .from('profiles')
              .update({
                first_name: firstName,
                last_name: lastName || null,
                phone: phone || null,
                organization_id: orgId,
              })
              .eq('id', existingProfile.id);
            updated++;
          } else {
            // Create new profile
            const { error: insertError } = await supabase
              .from('profiles')
              .insert({
                email,
                first_name: firstName,
                last_name: lastName || null,
                phone: phone || null,
                role: 'student',
                organization_id: orgId,
                // Store ID number and notes in metadata if available
              });

            if (insertError) throw insertError;
            created++;
          }

          processed++;
          setProgress({
            total: rows.length,
            processed,
            created,
            updated,
            errors,
            errorsList: [...errorsList],
          });
        } catch (error: any) {
          errors++;
          errorsList.push(`Row ${processed + 1}: ${error.message || 'Failed to process'}`);
          processed++;
          setProgress({
            total: rows.length,
            processed,
            created,
            updated,
            errors,
            errorsList: [...errorsList],
          });
        }
      }

      showAlert({
        title: 'Import Complete!',
        message: `Processed: ${processed}\nCreated: ${created}\nUpdated: ${updated}\nErrors: ${errors}`,
        type: 'success',
        buttons: [
          {
            text: 'View Details',
            onPress: () => {
              if (errorsList.length > 0) {
                showAlert({ title: 'Errors', message: errorsList.slice(0, 10).join('\n'), type: 'error' });
              }
            },
          },
          { text: 'OK' },
        ],
      });
    } catch (error: any) {
      showAlert({ title: 'Import Failed', message: error.message || 'Failed to process file', type: 'error' });
    } finally {
      setImporting(false);
      setProgress(null);
    }
  };

  const downloadTemplate = async () => {
    const template = `email,first_name,last_name,phone,id_number,notes
john.doe@example.com,John,Doe,+27123456789,1234567890123,CV received - interested in Beauty course
jane.smith@example.com,Jane,Smith,+27987654321,,Applicant from job fair
bob.wilson@example.com,Bob,Wilson,+27555123456,9876543210987,Marketing course candidate`;

    showAlert({
      title: 'CSV Template',
      message: 'Copy this template:\n\n' + template,
      type: 'info',
      buttons: [
        {
          text: 'Copy to Clipboard',
          onPress: async () => {
            await Clipboard.setStringAsync(template);
            showAlert({ title: 'Copied!', message: 'Template copied to clipboard', type: 'success' });
          },
        },
        { text: 'OK' },
      ],
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Bulk CV Import',
          headerStyle: { backgroundColor: theme.background },
          headerTitleStyle: { color: theme.text },
          headerTintColor: theme.primary,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Import CVs & Applications</Text>
          <Text style={styles.subtitle}>
            Bulk import student data from CVs or application forms. Perfect for processing hundreds of applications at once.
          </Text>
        </View>

        {importing && progress && (
          <View style={[styles.progressCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <EduDashSpinner size="large" color={theme.primary} />
            <Text style={[styles.progressTitle, { color: theme.text }]}>
              Processing... {progress.processed} / {progress.total}
            </Text>
            <View style={styles.progressStats}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: theme.primary }]}>{progress.created}</Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Created</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: theme.info || theme.primary }]}>{progress.updated}</Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Updated</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: theme.error }]}>{progress.errors}</Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Errors</Text>
              </View>
            </View>
            {progress.errors > 0 && (
              <Text style={[styles.errorText, { color: theme.error }]}>
                {progress.errorsList.length > 0 ? progress.errorsList[0] : 'Some rows failed to process'}
              </Text>
            )}
          </View>
        )}

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="document-text-outline" size={48} color={theme.primary} />
          <Text style={[styles.cardTitle, { color: theme.text }]}>Upload CSV File</Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>
            Upload a CSV file with columns: email, first_name, last_name, phone, id_number (optional), notes (optional)
          </Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.primary }]}
            onPress={handleImportCVs}
            disabled={importing}
          >
            <Ionicons name="cloud-upload-outline" size={22} color="#fff" />
            <Text style={styles.buttonText}>Choose CSV File</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="information-circle-outline" size={24} color={theme.info || theme.primary} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoTitle, { color: theme.text }]}>How It Works</Text>
            <Text style={[styles.infoText, { color: theme.textSecondary }]}>
              • Export CV data to CSV format{'\n'}
              • Ensure columns: email, first_name, last_name{'\n'}
              • System will create learner profiles{'\n'}
              • Duplicate emails will update existing profiles{'\n'}
              • After import, you can enroll learners in programs
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.templateButton, { borderColor: theme.border }]}
          onPress={downloadTemplate}
        >
          <Ionicons name="download-outline" size={20} color={theme.text} />
          <Text style={[styles.templateButtonText, { color: theme.text }]}>
            Download CSV Template
          </Text>
        </TouchableOpacity>

        <View style={[styles.tipCard, { backgroundColor: theme.card, borderColor: theme.primary + '40' }]}>
          <Ionicons name="bulb-outline" size={24} color={theme.primary} />
          <View style={styles.tipContent}>
            <Text style={[styles.tipTitle, { color: theme.text }]}>Pro Tip</Text>
            <Text style={[styles.tipText, { color: theme.textSecondary }]}>
              After importing CVs, go to the Programs screen and enroll these learners in specific courses/learnerships. You can also send bulk enrollment invites.
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
  card: {
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    gap: 16,
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 20,
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
    padding: 16,
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
  progressCard: {
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    alignItems: 'center',
    gap: 12,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  progressStats: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 8,
  },
  statItem: {
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
  },
  errorText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
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
  templateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  templateButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  tipCard: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    gap: 12,
  },
  tipContent: {
    flex: 1,
    gap: 4,
  },
  tipTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  tipText: {
    fontSize: 13,
    lineHeight: 20,
  },
});

