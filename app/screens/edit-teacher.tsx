/**
 * Edit Teacher Screen
 * Edit teacher profile details
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { fetchTeacherClassIds } from '@/lib/dashboard/fetchTeacherClassIds';
import { logger } from '@/lib/logger';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';

const TAG = 'EditTeacher';
import { removeTeacherFromSchool } from '@/lib/services/teacherRemovalService';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface TeacherData {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  specialization: string | null;
  is_active: boolean;
}

export default function EditTeacherScreen() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const { teacherId } = useLocalSearchParams<{ teacherId: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<TeacherData | null>(null);
  const [assignedClasses, setAssignedClasses] = useState<string[]>([]);
  const [teacherRecordId, setTeacherRecordId] = useState<string | null>(null);

  const styles = createStyles(theme);
  const { showAlert, alertProps } = useAlertModal();
  const orgId = profile?.organization_id || (profile as any)?.preschool_id;

  const fetchData = useCallback(async () => {
    if (!teacherId) return;

    try {
      const supabase = assertSupabase();

      // Fetch teacher profile
      const { data: teacherData, error: teacherError } = await supabase
        .from('profiles')
        .select('id, auth_user_id, first_name, last_name, email, phone')
        .or(`id.eq.${teacherId},auth_user_id.eq.${teacherId}`)
        .maybeSingle();

      if (teacherError) throw teacherError;
      if (!teacherData) throw new Error('Teacher not found');

      // Get teacher record from teachers table if exists
      const { data: teacherRecord } = await supabase
        .from('teachers')
        .select('id, user_id, auth_user_id, is_active, subject_specialization')
        .or(`user_id.eq.${teacherId},auth_user_id.eq.${teacherId}`)
        .maybeSingle();

      setTeacherRecordId(teacherRecord?.id || null);

      setFormData({
        id: teacherData.id,
        first_name: teacherData.first_name || '',
        last_name: teacherData.last_name || '',
        email: teacherData.email || '',
        phone: teacherData.phone,
        specialization: teacherRecord?.subject_specialization || null,
        is_active: teacherRecord?.is_active ?? true,
      });

      // Fetch assigned classes (lead + assistant via class_teachers)
      const classIds = await fetchTeacherClassIds(teacherData.id);
      if (classIds.length > 0) {
        const { data: classesData } = await supabase
          .from('classes')
          .select('name')
          .in('id', classIds);
        setAssignedClasses((classesData || []).map((c: any) => c.name));
      } else {
        setAssignedClasses([]);
      }
    } catch (error: any) {
      console.error('Error fetching teacher:', error);
      showAlert({ title: 'Error', message: 'Failed to load teacher information', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const navigateBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/screens/class-teacher-management');
    }
  };

  const handleSave = async () => {
    if (!formData) return;

    if (!formData.first_name.trim()) {
      showAlert({ title: 'Validation Error', message: 'First name is required', type: 'warning' });
      return;
    }

    if (!formData.last_name.trim()) {
      showAlert({ title: 'Validation Error', message: 'Last name is required', type: 'warning' });
      return;
    }

    setSaving(true);
    try {
      const supabase = assertSupabase();

      // Update profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          phone: formData.phone?.trim() || null,
        })
        .eq('id', teacherId);

      if (profileError) throw profileError;

      // Update teachers table if it exists
      let teacherError: Error | null = null;
      if (teacherRecordId) {
        const { error } = await supabase
          .from('teachers')
          .update({
            full_name: `${formData.first_name.trim()} ${formData.last_name.trim()}`,
            is_active: formData.is_active,
            subject_specialization: formData.specialization?.trim() || null,
          })
          .eq('id', teacherRecordId);
        teacherError = error;
      }

      // Don't throw on teacher error - row might not exist
      if (teacherError) {
        logger.info(TAG, 'teachers table update skipped:', teacherError.message);
      }

      showAlert({ title: 'Success', message: 'Teacher profile updated successfully', type: 'success', buttons: [{ text: 'OK', onPress: navigateBack }] });
    } catch (error: any) {
      console.error('Error updating teacher:', error);
      showAlert({ title: 'Error', message: 'Failed to update teacher profile', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveFromSchool = () => {
    if (!orgId) {
      showAlert({ title: 'Error', message: 'No school found for this account.', type: 'error' });
      return;
    }
    if (!teacherId) {
      showAlert({ title: 'Error', message: 'Missing teacher identifier.', type: 'error' });
      return;
    }
    if (!teacherRecordId) {
      showAlert({ title: 'Error', message: 'Missing teacher record.', type: 'error' });
      return;
    }
    showAlert({
      title: 'Archive Teacher',
      message: 'Archive this teacher from your school? They will be hidden from active lists and lose access, but history will be kept.',
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeTeacherFromSchool({
                teacherRecordId,
                organizationId: orgId,
                teacherUserId: teacherId,
                reason: 'Archived via edit teacher screen',
              });

              showAlert({ title: 'Success', message: 'Teacher archived', type: 'success', buttons: [{ text: 'OK', onPress: navigateBack }] });
            } catch (error: any) {
              console.error('Error removing teacher:', error);
              showAlert({ title: 'Error', message: 'Failed to archive teacher', type: 'error' });
            }
          },
        },
      ],
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Edit Teacher', headerShown: true }} />
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={styles.loadingText}>Loading teacher information...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!formData) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Edit Teacher', headerShown: true }} />
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={48} color={theme.error} />
          <Text style={styles.errorText}>Teacher not found</Text>
          <TouchableOpacity style={styles.backButton} onPress={navigateBack}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Edit Teacher',
          headerShown: true,
          headerLeft: () => (
            <TouchableOpacity onPress={navigateBack} style={styles.headerButton}>
              <Ionicons name="arrow-back" size={24} color={theme.text} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView style={styles.scrollView}>
        <View style={styles.form}>
          {/* Profile Section */}
          <View style={styles.profileHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {formData.first_name?.[0]}{formData.last_name?.[0]}
              </Text>
            </View>
            <Text style={styles.emailDisplay}>{formData.email}</Text>
          </View>

          {/* First Name */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>First Name *</Text>
            <TextInput
              style={styles.input}
              value={formData.first_name}
              onChangeText={(text) => setFormData({ ...formData, first_name: text })}
              placeholder="Enter first name"
              placeholderTextColor={theme.textSecondary}
            />
          </View>

          {/* Last Name */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Last Name *</Text>
            <TextInput
              style={styles.input}
              value={formData.last_name}
              onChangeText={(text) => setFormData({ ...formData, last_name: text })}
              placeholder="Enter last name"
              placeholderTextColor={theme.textSecondary}
            />
          </View>

          {/* Phone */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              value={formData.phone || ''}
              onChangeText={(text) => setFormData({ ...formData, phone: text })}
              placeholder="e.g., 082 123 4567"
              placeholderTextColor={theme.textSecondary}
              keyboardType="phone-pad"
            />
          </View>

          {/* Active Status */}
          <View style={styles.switchRow}>
            <View>
              <Text style={styles.label}>Teacher Active</Text>
              <Text style={styles.sublabel}>Inactive teachers cannot access classes</Text>
            </View>
            <Switch
              value={formData.is_active}
              onValueChange={(value) => setFormData({ ...formData, is_active: value })}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor="#fff"
            />
          </View>

          {/* Assigned Classes */}
          {assignedClasses.length > 0 && (
            <View style={styles.classesSection}>
              <Text style={styles.label}>Assigned Classes</Text>
              <View style={styles.classChips}>
                {assignedClasses.map((className, index) => (
                  <View key={index} style={styles.classChip}>
                    <Ionicons name="school" size={14} color={theme.primary} />
                    <Text style={styles.chipText}>{className}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.saveButton]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <EduDashSpinner size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.removeButton]}
              onPress={handleRemoveFromSchool}
            >
              <Ionicons name="person-remove-outline" size={20} color="#fff" />
              <Text style={styles.removeButtonText}>Remove from School</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    scrollView: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      color: theme.textSecondary,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    errorText: {
      fontSize: 18,
      color: theme.error,
      marginTop: 16,
    },
    backButton: {
      marginTop: 24,
      paddingHorizontal: 24,
      paddingVertical: 12,
      backgroundColor: theme.primary,
      borderRadius: 8,
    },
    backButtonText: {
      color: '#fff',
      fontWeight: '600',
    },
    headerButton: {
      padding: 8,
    },
    form: {
      padding: 16,
    },
    profileHeader: {
      alignItems: 'center',
      marginBottom: 24,
      paddingBottom: 24,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: theme.primary,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    avatarText: {
      fontSize: 32,
      fontWeight: '600',
      color: '#fff',
    },
    emailDisplay: {
      fontSize: 14,
      color: theme.textSecondary,
    },
    formGroup: {
      marginBottom: 20,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 8,
    },
    sublabel: {
      fontSize: 12,
      color: theme.textSecondary,
      marginTop: 2,
    },
    input: {
      backgroundColor: theme.card,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      color: theme.text,
      borderWidth: 1,
      borderColor: theme.border,
    },
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      marginTop: 8,
    },
    classesSection: {
      marginTop: 24,
      paddingTop: 24,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    classChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
    },
    classChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: `${theme.primary}20`,
      borderRadius: 16,
      gap: 6,
    },
    chipText: {
      fontSize: 14,
      color: theme.primary,
    },
    actions: {
      marginTop: 32,
      gap: 12,
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      borderRadius: 8,
      gap: 8,
    },
    saveButton: {
      backgroundColor: theme.primary,
    },
    saveButtonText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 16,
    },
    removeButton: {
      backgroundColor: '#ef4444',
    },
    removeButtonText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 16,
    },
  });
