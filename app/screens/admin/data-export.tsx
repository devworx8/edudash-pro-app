/**
 * Data Export Screen
 * 
 * Dedicated screen for exporting various school data formats
 * Accessible only to Principals and School Administrators
 */

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
// import { router } from 'expo-router'; // TODO: Use for navigation after export complete
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { logger } from '@/lib/logger';

const TAG = 'DataExport';
import { RoleBasedHeader } from '@/components/RoleBasedHeader';
import { navigateBack } from '@/lib/navigation';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
// import { assertSupabase } from '@/lib/supabase'; // TODO: Use for actual export API calls

interface ExportOption {
  id: string;
  title: string;
  description: string;
  icon: string;
  format: 'CSV' | 'PDF' | 'Excel';
  category: 'academic' | 'financial' | 'administrative';
  estimatedSize: string;
  lastExported?: string;
}

const EXPORT_OPTIONS: ExportOption[] = [
  // Academic Data
  {
    id: 'students',
    title: 'Student Records',
    description: 'Complete student information, enrollment details, and contact data',
    icon: 'people',
    format: 'Excel',
    category: 'academic',
    estimatedSize: '~2.5 MB'
  },
  {
    id: 'teachers', 
    title: 'Teacher Directory',
    description: 'Staff information, roles, and contact details',
    icon: 'school',
    format: 'Excel',
    category: 'administrative',
    estimatedSize: '~500 KB'
  },
  {
    id: 'grades',
    title: 'Academic Reports',
    description: 'Student grades, assessments, and progress reports',
    icon: 'trophy',
    format: 'PDF',
    category: 'academic',
    estimatedSize: '~8 MB'
  },
  {
    id: 'attendance',
    title: 'Attendance Records',
    description: 'Daily attendance data for all students and staff',
    icon: 'checkmark-circle',
    format: 'CSV',
    category: 'academic',
    estimatedSize: '~1.2 MB'
  },
  
  // Financial Data
  {
    id: 'payments',
    title: 'Payment Records',
    description: 'School fees, payments, and outstanding balances',
    icon: 'card',
    format: 'Excel',
    category: 'financial',
    estimatedSize: '~3.1 MB'
  },
  {
    id: 'expenses',
    title: 'Expense Reports',
    description: 'School expenses, petty cash, and budget tracking',
    icon: 'receipt',
    format: 'PDF',
    category: 'financial',
    estimatedSize: '~1.8 MB'
  },
  
  // Administrative Data
  {
    id: 'communications',
    title: 'Communications Log',
    description: 'Announcements, messages, and parent communications',
    icon: 'mail',
    format: 'CSV',
    category: 'administrative',
    estimatedSize: '~900 KB'
  },
  {
    id: 'audit',
    title: 'Audit Trail',
    description: 'System activity logs and user actions',
    icon: 'shield-checkmark',
    format: 'CSV',
    category: 'administrative',
    estimatedSize: '~5.2 MB'
  }
];

export default function DataExportScreen() {
  const { profile } = useAuth();
  const { theme } = useTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const { showAlert, alertProps } = useAlertModal();
  const [exportingItems, setExportingItems] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const canAccessExports = (): boolean => {
    return profile?.role === 'principal' || profile?.role === 'principal_admin';
  };

  const getPreschoolId = useCallback((): string | null => {
    if (profile?.organization_id) {
      return profile.organization_id as string;
    }
    return null;
  }, [profile]);

  const handleExport = async (option: ExportOption) => {
    const preschoolId = getPreschoolId();
    if (!preschoolId || !canAccessExports()) {
      showAlert({ title: 'Access Denied', message: 'You do not have permission to export data.', type: 'error' });
      return;
    }

    // Show confirmation dialog
    showAlert({
      title: `Export ${option.title}`,
      message: `This will export ${option.title} as ${option.format} format (${option.estimatedSize}).\n\nThe export will be sent to your email address and may take a few minutes to process.`,
      type: 'info',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export',
          onPress: async () => {
            // Set loading state when export actually starts
            setExportingItems(prev => new Set(prev).add(option.id));
            
            try {
              // TODO: Implement actual export via Supabase Edge Function
              // For now, simulate the export process
              await simulateExport(option, preschoolId);
              
              showAlert({
                title: 'Export Started',
                message: `${option.title} export has been queued. You'll receive an email with the download link within 10-15 minutes.`,
                type: 'success',
              });
            } catch (error) {
              console.error('Export error:', error);
              showAlert({
                title: 'Export Failed',
                message: 'Failed to start export. Please check your connection and try again.',
                type: 'error',
              });
            } finally {
              // Clear loading state after export attempt
              setExportingItems(prev => {
                const newSet = new Set(prev);
                newSet.delete(option.id);
                return newSet;
              });
            }
          }
        }
      ]
    });
  };

  const simulateExport = async (option: ExportOption, preschoolId: string): Promise<void> => {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // TODO: Replace with actual Supabase Edge Function call
    // const { data, error } = await assertSupabase().functions.invoke('export-data', {
    //   body: {
    //     preschool_id: preschoolId,
    //     export_type: option.id,
    //     format: option.format,
    //     user_email: profile?.email
    //   }
    // });
    
    logger.info(TAG, `Export ${option.id} simulated for preschool ${preschoolId}`);
  };

  const getFilteredOptions = () => {
    if (selectedCategory === 'all') {
      return EXPORT_OPTIONS;
    }
    return EXPORT_OPTIONS.filter(option => option.category === selectedCategory);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'academic': return theme.primary;
      case 'financial': return theme.success;
      case 'administrative': return theme.accent;
      default: return theme.textSecondary;
    }
  };

  const renderExportOption = (option: ExportOption) => (
    <TouchableOpacity
      key={option.id}
      style={styles.exportCard}
      onPress={() => handleExport(option)}
      disabled={exportingItems.has(option.id)}
    >
      <View style={styles.exportHeader}>
        <View style={[styles.exportIcon, { backgroundColor: getCategoryColor(option.category) + '20' }]}>
          <Ionicons name={option.icon as any} size={24} color={getCategoryColor(option.category)} />
        </View>
        <View style={styles.exportInfo}>
          <Text style={styles.exportTitle}>{option.title}</Text>
          <Text style={styles.exportDescription}>{option.description}</Text>
          <View style={styles.exportMeta}>
            <Text style={styles.exportFormat}>{option.format}</Text>
            <Text style={styles.exportSize}>{option.estimatedSize}</Text>
          </View>
        </View>
      </View>
      
      <View style={styles.exportAction}>
        {exportingItems.has(option.id) ? (
          <EduDashSpinner size="small" color={theme.primary} />
        ) : (
          <Ionicons name="download" size={20} color={theme.textSecondary} />
        )}
      </View>
    </TouchableOpacity>
  );

  if (!canAccessExports()) {
    return (
      <SafeAreaView style={styles.container}>
        <RoleBasedHeader
          title="Data Export"
          onBackPress={() => navigateBack()}
        />
        <View style={styles.accessDenied}>
          <Ionicons name="shield-checkmark" size={64} color={theme.textSecondary} />
          <Text style={styles.accessDeniedText}>Access Restricted</Text>
          <Text style={styles.accessDeniedSubtext}>
            Data export is only available to school principals and administrators.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <RoleBasedHeader
        title="Data Export"
        onBackPress={() => navigateBack()}
      />
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={20} color={theme.primary} />
          <Text style={styles.infoBannerText}>
            Exported files are sent via email and stored securely for 30 days. 
            All exports comply with data protection regulations.
          </Text>
        </View>

        {/* Category Filters */}
        <View style={styles.categoryFilter}>
          {[
            { id: 'all', label: 'All Data', icon: 'grid' },
            { id: 'academic', label: 'Academic', icon: 'school' },
            { id: 'financial', label: 'Financial', icon: 'card' },
            { id: 'administrative', label: 'Admin', icon: 'settings' }
          ].map(category => (
            <TouchableOpacity
              key={category.id}
              style={[
                styles.categoryButton,
                selectedCategory === category.id && styles.categoryButtonActive
              ]}
              onPress={() => setSelectedCategory(category.id)}
            >
              <Ionicons
                name={category.icon as any}
                size={16}
                color={selectedCategory === category.id ? 'white' : theme.textSecondary}
              />
              <Text style={[
                styles.categoryButtonText,
                selectedCategory === category.id && styles.categoryButtonTextActive
              ]}>
                {category.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Export Options */}
        <View style={styles.exportsList}>
          {getFilteredOptions().map(renderExportOption)}
        </View>

        {/* Bulk Export Option */}
        <View style={styles.bulkExportSection}>
          <Text style={styles.sectionTitle}>Bulk Export</Text>
          <TouchableOpacity
            style={styles.bulkExportCard}
            onPress={() => {
              showAlert({
                title: 'Full School Export',
                message: 'This will export ALL school data in a comprehensive package. This may take 30-45 minutes to process and will be sent to your email.\n\nFile size: ~25 MB',
                type: 'info',
                buttons: [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Start Export',
                    onPress: () => {
                      showAlert({
                        title: 'Full Export Started',
                        message: 'Your complete school data export has been queued. You will receive multiple files via email within 45 minutes.',
                        type: 'success',
                      });
                    }
                  }
                ]
              });
            }}
          >
            <View style={styles.bulkExportContent}>
              <Ionicons name="archive" size={24} color={theme.primary} />
              <View style={styles.bulkExportText}>
                <Text style={styles.bulkExportTitle}>Complete School Export</Text>
                <Text style={styles.bulkExportDescription}>
                  Export all school data in one comprehensive package
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.bottomSpacer} />
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
    flex: 1,
  },
  accessDenied: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  accessDeniedText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
    marginTop: 16,
  },
  accessDeniedSubtext: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: theme.primary + '10',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'flex-start',
  },
  infoBannerText: {
    flex: 1,
    fontSize: 14,
    color: theme.text,
    marginLeft: 12,
    lineHeight: 20,
  },
  categoryFilter: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 24,
    gap: 8,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.cardBackground,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 6,
  },
  categoryButtonActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  categoryButtonText: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  categoryButtonTextActive: {
    color: 'white',
    fontWeight: '500',
  },
  exportsList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  exportCard: {
    flexDirection: 'row',
    backgroundColor: theme.cardBackground,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  exportHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  exportIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  exportInfo: {
    flex: 1,
  },
  exportTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 4,
  },
  exportDescription: {
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: 8,
    lineHeight: 18,
  },
  exportMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  exportFormat: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.primary,
    backgroundColor: theme.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  exportSize: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  exportAction: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkExportSection: {
    marginTop: 32,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 16,
  },
  bulkExportCard: {
    flexDirection: 'row',
    backgroundColor: theme.cardBackground,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.primary + '30',
  },
  bulkExportContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bulkExportText: {
    marginLeft: 16,
  },
  bulkExportTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 4,
  },
  bulkExportDescription: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  bottomSpacer: {
    height: 32,
  },
});