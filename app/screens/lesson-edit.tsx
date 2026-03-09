/**
 * Lesson Edit Screen
 * 
 * Allows teachers and principals to edit lesson metadata.
 * Teachers can edit their own lessons.
 * Principals can edit any lesson in their organization.
 * 
 * @module app/screens/lesson-edit
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Picker } from '@react-native-picker/picker';

import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { assertSupabase } from '@/lib/supabase';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface LessonForm {
  title: string;
  description: string;
  subject: string;
  duration_minutes: number;
  age_group: string;
  objectives: string[];
  materials_needed: string[];
  status: 'draft' | 'active' | 'published' | 'archived';
}

const SUBJECTS = [
  'Mathematics',
  'Literacy',
  'Science',
  'Art',
  'Music',
  'Physical Education',
  'Social Studies',
  'Language',
  'STEM',
  'Life Skills',
  'Creative Arts',
  'Other',
];

const AGE_GROUPS = [
  '2-3 years',
  '3-4 years',
  '4-5 years',
  '5-6 years',
  '3-6 years',
  'All Ages',
];

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft', color: '#6B7280' },
  { value: 'active', label: 'Active', color: '#10B981' },
  { value: 'published', label: 'Published', color: '#3B82F6' },
  { value: 'archived', label: 'Archived', color: '#EF4444' },
];

export default function LessonEditScreen() {
  const { theme } = useTheme();
  const { profile, user } = useAuth();
  const params = useLocalSearchParams<{ lessonId: string }>();
  const lessonId = params.lessonId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [originalLesson, setOriginalLesson] = useState<any>(null);
  const [form, setForm] = useState<LessonForm>({
    title: '',
    description: '',
    subject: 'Mathematics',
    duration_minutes: 30,
    age_group: '3-6 years',
    objectives: [],
    materials_needed: [],
    status: 'draft',
  });
  const [newObjective, setNewObjective] = useState('');
  const [newMaterial, setNewMaterial] = useState('');

  const styles = useMemo(() => createStyles(theme), [theme]);
  const { showAlert, alertProps } = useAlertModal();

  // Check if user can edit this lesson
  const canEdit = useCallback(() => {
    if (!originalLesson || !profile) return false;
    
    // Teachers can edit their own lessons
    if (originalLesson.teacher_id === (user?.id || profile.id)) return true;
    
    // Principals can edit any lesson in their org
    if (profile.role === 'principal' || profile.role === 'principal_admin') {
      const preschoolId = profile.preschool_id || profile.organization_id;
      return originalLesson.preschool_id === preschoolId;
    }
    
    return false;
  }, [originalLesson, profile, user]);

  // Load lesson data
  useEffect(() => {
    const loadLesson = async () => {
      if (!lessonId) {
        showAlert({ title: 'Error', message: 'No lesson ID provided', type: 'error' });
        router.back();
        return;
      }

      try {
        const { data, error } = await assertSupabase()
          .from('lessons')
          .select('*')
          .eq('id', lessonId)
          .single();

        if (error) throw error;
        if (!data) {
          showAlert({ title: 'Error', message: 'Lesson not found', type: 'error' });
          router.back();
          return;
        }

        setOriginalLesson(data);
        setForm({
          title: data.title || '',
          description: data.description || '',
          subject: data.subject || 'Mathematics',
          duration_minutes: data.duration_minutes || 30,
          age_group: data.age_group || '3-6 years',
          objectives: Array.isArray(data.objectives) ? data.objectives : [],
          materials_needed: Array.isArray(data.materials_needed) ? data.materials_needed : [],
          status: data.status || 'draft',
        });
      } catch (error) {
        console.error('[LessonEdit] Error loading lesson:', error);
        showAlert({ title: 'Error', message: 'Failed to load lesson', type: 'error' });
        router.back();
      } finally {
        setLoading(false);
      }
    };

    loadLesson();
  }, [lessonId]);

  const handleSave = async () => {
    if (!form.title.trim()) {
      showAlert({ title: 'Validation Error', message: 'Lesson title is required', type: 'warning' });
      return;
    }

    if (!canEdit()) {
      showAlert({ title: 'Permission Denied', message: 'You do not have permission to edit this lesson', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const { error } = await assertSupabase()
        .from('lessons')
        .update({
          title: form.title.trim(),
          description: form.description.trim(),
          subject: form.subject,
          duration_minutes: form.duration_minutes,
          age_group: form.age_group,
          objectives: form.objectives,
          materials_needed: form.materials_needed,
          status: form.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lessonId);

      if (error) {
        showAlert({ title: 'Error', message: error.message || 'Failed to update lesson', type: 'error' });
      } else {
        showAlert({ title: 'Success', message: 'Lesson updated successfully', type: 'success', buttons: [{ text: 'OK', onPress: () => router.back() }] });
      }
    } catch (error) {
      console.error('[LessonEdit] Save error:', error);
      showAlert({ title: 'Error', message: 'Failed to save changes', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddObjective = () => {
    if (newObjective.trim()) {
      setForm(prev => ({
        ...prev,
        objectives: [...prev.objectives, newObjective.trim()],
      }));
      setNewObjective('');
    }
  };

  const handleRemoveObjective = (index: number) => {
    setForm(prev => ({
      ...prev,
      objectives: prev.objectives.filter((_, i) => i !== index),
    }));
  };

  const handleAddMaterial = () => {
    if (newMaterial.trim()) {
      setForm(prev => ({
        ...prev,
        materials_needed: [...prev.materials_needed, newMaterial.trim()],
      }));
      setNewMaterial('');
    }
  };

  const handleRemoveMaterial = (index: number) => {
    setForm(prev => ({
      ...prev,
      materials_needed: prev.materials_needed.filter((_, i) => i !== index),
    }));
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <ScreenHeader title="Edit Lesson" showBackButton />
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading lesson...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!canEdit()) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <ScreenHeader title="Edit Lesson" showBackButton />
        <View style={styles.errorContainer}>
          <Ionicons name="lock-closed-outline" size={64} color={theme.textSecondary} />
          <Text style={[styles.errorTitle, { color: theme.text }]}>Access Denied</Text>
          <Text style={[styles.errorText, { color: theme.textSecondary }]}>
            You don't have permission to edit this lesson.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScreenHeader 
        title="Edit Lesson" 
        showBackButton 
        rightAction={
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <EduDashSpinner size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color="#FFF" />
                <Text style={styles.saveButtonText}>Save</Text>
              </>
            )}
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Title */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>
              Title <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
              value={form.title}
              onChangeText={(text) => setForm(prev => ({ ...prev, title: text }))}
              placeholder="Enter lesson title"
              placeholderTextColor={theme.textSecondary}
            />
          </View>

          {/* Description */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>Description</Text>
            <TextInput
              style={[styles.textArea, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
              value={form.description}
              onChangeText={(text) => setForm(prev => ({ ...prev, description: text }))}
              placeholder="Enter lesson description"
              placeholderTextColor={theme.textSecondary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Subject & Duration Row */}
          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={[styles.label, { color: theme.text }]}>Subject</Text>
              <View style={[styles.pickerContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Picker
                  selectedValue={form.subject}
                  onValueChange={(value) => setForm(prev => ({ ...prev, subject: value }))}
                  style={[styles.picker, { color: theme.text }]}
                >
                  {SUBJECTS.map(subject => (
                    <Picker.Item key={subject} label={subject} value={subject} />
                  ))}
                </Picker>
              </View>
            </View>

            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={[styles.label, { color: theme.text }]}>Duration (min)</Text>
              <TextInput
                style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
                value={String(form.duration_minutes)}
                onChangeText={(text) => setForm(prev => ({ ...prev, duration_minutes: parseInt(text) || 30 }))}
                keyboardType="number-pad"
              />
            </View>
          </View>

          {/* Age Group & Status Row */}
          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={[styles.label, { color: theme.text }]}>Age Group</Text>
              <View style={[styles.pickerContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Picker
                  selectedValue={form.age_group}
                  onValueChange={(value) => setForm(prev => ({ ...prev, age_group: value }))}
                  style={[styles.picker, { color: theme.text }]}
                >
                  {AGE_GROUPS.map(age => (
                    <Picker.Item key={age} label={age} value={age} />
                  ))}
                </Picker>
              </View>
            </View>

            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={[styles.label, { color: theme.text }]}>Status</Text>
              <View style={[styles.pickerContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Picker
                  selectedValue={form.status}
                  onValueChange={(value) => setForm(prev => ({ ...prev, status: value }))}
                  style={[styles.picker, { color: theme.text }]}
                >
                  {STATUS_OPTIONS.map(opt => (
                    <Picker.Item key={opt.value} label={opt.label} value={opt.value} />
                  ))}
                </Picker>
              </View>
            </View>
          </View>

          {/* Objectives */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>Learning Objectives</Text>
            <View style={styles.listInputContainer}>
              <TextInput
                style={[styles.listInput, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
                value={newObjective}
                onChangeText={setNewObjective}
                placeholder="Add an objective..."
                placeholderTextColor={theme.textSecondary}
                onSubmitEditing={handleAddObjective}
              />
              <TouchableOpacity
                style={[styles.addButton, { backgroundColor: theme.primary }]}
                onPress={handleAddObjective}
              >
                <Ionicons name="add" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
            {form.objectives.map((obj, index) => (
              <View key={index} style={[styles.listItem, { backgroundColor: theme.surface }]}>
                <Text style={[styles.listItemText, { color: theme.text }]} numberOfLines={2}>
                  {obj}
                </Text>
                <TouchableOpacity onPress={() => handleRemoveObjective(index)}>
                  <Ionicons name="close-circle" size={20} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Materials */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>Materials Needed</Text>
            <View style={styles.listInputContainer}>
              <TextInput
                style={[styles.listInput, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
                value={newMaterial}
                onChangeText={setNewMaterial}
                placeholder="Add a material..."
                placeholderTextColor={theme.textSecondary}
                onSubmitEditing={handleAddMaterial}
              />
              <TouchableOpacity
                style={[styles.addButton, { backgroundColor: theme.primary }]}
                onPress={handleAddMaterial}
              >
                <Ionicons name="add" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
            {form.materials_needed.map((mat, index) => (
              <View key={index} style={[styles.listItem, { backgroundColor: theme.surface }]}>
                <Text style={[styles.listItemText, { color: theme.text }]} numberOfLines={2}>
                  {mat}
                </Text>
                <TouchableOpacity onPress={() => handleRemoveMaterial(index)}>
                  <Ionicons name="close-circle" size={20} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Spacer for keyboard */}
          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  required: {
    color: '#EF4444',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 100,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  pickerContainer: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  picker: {
    height: 48,
  },
  listInputContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  listInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  listItemText: {
    flex: 1,
    fontSize: 14,
    marginRight: 8,
  },
});
