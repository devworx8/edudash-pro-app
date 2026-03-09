import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { assertSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';
import * as Clipboard from 'expo-clipboard';
import { extractOrganizationId } from '@/lib/tenant/compat';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
// AsyncStorage with web fallback
let AsyncStorage: any = null;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch (e) {
  // Web fallback using localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    AsyncStorage = {
      getItem: async (key: string) => window.localStorage.getItem(key),
      setItem: async (key: string, value: string) => window.localStorage.setItem(key, value),
      removeItem: async (key: string) => window.localStorage.removeItem(key),
    };
  }
}

const DRAFT_STORAGE_KEY = 'program_creation_draft';
const AUTO_SAVE_DELAY = 1500; // 1.5 seconds debounce

export default function CreateProgramScreen() {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const { showAlert, alertProps } = useAlertModal();
  const orgId = extractOrganizationId(profile);
  const userId = user?.id || profile?.id;
  
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [restoredFromDraft, setRestoredFromDraft] = useState(false);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Form fields
  const [title, setTitle] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('beauty'); // beauty, marketing, etc.
  const [duration, setDuration] = useState('');
  const [maxStudents, setMaxStudents] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sponsorName, setSponsorName] = useState('');
  const [sponsorContact, setSponsorContact] = useState('');
  const [fee, setFee] = useState('');
  const [isSponsored, setIsSponsored] = useState(false);
  const [requirements, setRequirements] = useState('');
  const [learningOutcomes, setLearningOutcomes] = useState('');

  // Draft management functions
  const getDraftData = useCallback(() => {
    return {
      title,
      courseCode,
      description,
      category,
      duration,
      maxStudents,
      startDate,
      endDate,
      sponsorName,
      sponsorContact,
      fee,
      isSponsored,
      requirements,
      learningOutcomes,
      showAdvanced,
      savedAt: new Date().toISOString(),
    };
  }, [
    title,
    courseCode,
    description,
    category,
    duration,
    maxStudents,
    startDate,
    endDate,
    sponsorName,
    sponsorContact,
    fee,
    isSponsored,
    requirements,
    learningOutcomes,
    showAdvanced,
  ]);

  const saveDraft = useCallback(async () => {
    if (!AsyncStorage) return;

    try {
      setAutoSaving(true);
      const draftData = getDraftData();
      await AsyncStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftData));
      setHasDraft(true);
    } catch (error) {
      console.warn('Failed to save draft:', error);
    } finally {
      // Keep indicator visible for a moment
      setTimeout(() => setAutoSaving(false), 500);
    }
  }, [getDraftData]);

  const loadDraft = useCallback(async () => {
    if (!AsyncStorage) return false;

    try {
      const draftJson = await AsyncStorage.getItem(DRAFT_STORAGE_KEY);
      if (!draftJson) {
        setHasDraft(false);
        return false;
      }

      const draft = JSON.parse(draftJson);
      if (!draft || typeof draft !== 'object') {
        setHasDraft(false);
        return false;
      }

      // Restore form fields
      if (draft.title) setTitle(draft.title);
      if (draft.courseCode) setCourseCode(draft.courseCode);
      if (draft.description) setDescription(draft.description);
      if (draft.category) setCategory(draft.category);
      if (draft.duration) setDuration(draft.duration);
      if (draft.maxStudents) setMaxStudents(draft.maxStudents);
      if (draft.startDate) setStartDate(draft.startDate);
      if (draft.endDate) setEndDate(draft.endDate);
      if (draft.sponsorName) setSponsorName(draft.sponsorName);
      if (draft.sponsorContact) setSponsorContact(draft.sponsorContact);
      if (draft.fee) setFee(draft.fee);
      if (draft.isSponsored !== undefined) setIsSponsored(draft.isSponsored);
      if (draft.requirements) setRequirements(draft.requirements);
      if (draft.learningOutcomes) setLearningOutcomes(draft.learningOutcomes);
      if (draft.showAdvanced !== undefined) setShowAdvanced(draft.showAdvanced);

      setHasDraft(true);
      setRestoredFromDraft(true);
      
      // Show notification
      if (draft.savedAt) {
        const savedTime = new Date(draft.savedAt);
        const timeAgo = Math.round((Date.now() - savedTime.getTime()) / 1000 / 60); // minutes ago
        const timeText = timeAgo < 1 ? 'just now' : timeAgo === 1 ? '1 minute ago' : `${timeAgo} minutes ago`;
        
        // Auto-hide after 5 seconds
        setTimeout(() => setRestoredFromDraft(false), 5000);
      }

      return true;
    } catch (error) {
      console.warn('Failed to load draft:', error);
      setHasDraft(false);
      return false;
    }
  }, []);

  const clearDraft = useCallback(async () => {
    if (!AsyncStorage) return;
    try {
      await AsyncStorage.removeItem(DRAFT_STORAGE_KEY);
      setHasDraft(false);
    } catch (error) {
      console.warn('Failed to clear draft:', error);
    }
  }, []);

  // Auto-save with debounce
  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      saveDraft();
    }, AUTO_SAVE_DELAY);
  }, [saveDraft]);

  // Load draft on mount
  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  // Auto-save when form fields change
  useEffect(() => {
    // Don't auto-save if we just loaded a draft
    if (restoredFromDraft) {
      setRestoredFromDraft(false);
      return;
    }

    // Don't auto-save if form is empty
    if (!title.trim() && !description.trim() && !courseCode.trim()) {
      return;
    }

    triggerAutoSave();

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [
    title,
    courseCode,
    description,
    category,
    duration,
    maxStudents,
    startDate,
    endDate,
    sponsorName,
    sponsorContact,
    fee,
    isSponsored,
    requirements,
    learningOutcomes,
    showAdvanced,
    triggerAutoSave,
    restoredFromDraft,
  ]);

  // Format date input to auto-add dashes (YYYY-MM-DD)
  const formatDateInput = (value: string): string => {
    // Remove all non-numeric characters
    const numbers = value.replace(/\D/g, '');
    
    // Limit to 8 digits (YYYYMMDD)
    const limited = numbers.slice(0, 8);
    
    // Format as YYYY-MM-DD
    if (limited.length <= 4) {
      return limited;
    } else if (limited.length <= 6) {
      return `${limited.slice(0, 4)}-${limited.slice(4)}`;
    } else {
      return `${limited.slice(0, 4)}-${limited.slice(4, 6)}-${limited.slice(6, 8)}`;
    }
  };

  const generateCourseCode = () => {
    // Auto-generate code based on title
    const prefix = orgId?.substring(0, 3).toUpperCase() || 'ORG';
    const code = title
      .split(' ')
      .map((word) => word.substring(0, 2).toUpperCase())
      .join('')
      .substring(0, 6);
    return `${prefix}-${code || 'COURSE'}`;
  };

  const handleGenerateCode = () => {
    if (title.trim()) {
      setCourseCode(generateCourseCode());
    } else {
      showAlert({ title: 'Enter Title First', message: 'Please enter a program title to generate the code', type: 'info' });
    }
  };

  const handleSave = async () => {
    // Validation
    if (!title.trim()) {
      showAlert({ title: 'Error', message: 'Program title is required', type: 'error' });
      return;
    }

    if (!courseCode.trim()) {
      showAlert({ title: 'Error', message: 'Course code is required. Click "Generate Code" or enter manually.', type: 'error' });
      return;
    }

    // Validation: Ensure we have required IDs
    if (!userId) {
      showAlert({ title: 'Error', message: 'User ID not available. Please sign in again.', type: 'error' });
      return;
    }

    if (!orgId) {
      showAlert({ title: 'Error', message: 'Organization ID not available. Please ensure you are linked to an organization.', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const supabase = assertSupabase();

      // Create program/course
      const { data: newProgram, error } = await supabase
        .from('courses')
        .insert({
          title: title.trim(),
          course_code: courseCode.trim().toUpperCase(),
          description: description.trim() || null,
          organization_id: orgId,
          instructor_id: userId, // Required: Set instructor_id to current user ID
          is_active: true,
          max_students: maxStudents ? parseInt(maxStudents) : null,
          start_date: startDate || null,
          end_date: endDate || null,
          // Store additional metadata in a JSON field if available
          // Otherwise, create a separate table for sponsor info
        })
        .select('id, title, course_code')
        .single();

      if (error) throw error;

      // Store sponsor info if provided (could be in a separate table or JSON field)
      if (isSponsored && (sponsorName || sponsorContact)) {
        // TODO: Create sponsor relationship in database
        logger.debug('CreateProgram', 'Sponsor info:', { sponsorName, sponsorContact, programId: newProgram.id });
      }

      // Clear draft after successful creation
      await clearDraft();

      showAlert({
        title: 'Program Created!',
        message: `${newProgram.title} has been created successfully.`,
        type: 'success',
        buttons: [
          {
            text: 'Create Another',
            style: 'cancel',
            onPress: () => {
              setTitle('');
              setDescription('');
              setCourseCode('');
              setDuration('');
              setMaxStudents('');
              setStartDate('');
              setEndDate('');
              setSponsorName('');
              setSponsorContact('');
              setFee('');
              setIsSponsored(false);
              setRequirements('');
              setLearningOutcomes('');
              setShowAdvanced(false);
            },
          },
          {
            text: 'Share Program',
            onPress: () => {
              router.push({
                pathname: '/screens/org-admin/programs',
                params: { shareProgramId: newProgram.id },
              } as any);
            },
          },
          {
            text: 'Done',
            onPress: () => router.back(),
          },
        ],
      });
    } catch (error: any) {
      showAlert({ title: 'Error', message: error.message || 'Failed to create program', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const styles = createStyles(theme);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Create Program',
          headerStyle: { backgroundColor: theme.background },
          headerTitleStyle: { color: theme.text },
          headerTintColor: theme.primary,
          headerRight: () => (
            <View style={styles.headerRight}>
              {autoSaving && (
                <View style={styles.autoSaveIndicator}>
                  <EduDashSpinner size="small" color={theme.primary} />
                  <Text style={[styles.autoSaveText, { color: theme.textSecondary }]}>Saving...</Text>
                </View>
              )}
              {hasDraft && !autoSaving && (
                <Text style={[styles.draftIndicator, { color: theme.textSecondary }]}>Draft saved</Text>
              )}
            </View>
          ),
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {restoredFromDraft && (
            <View style={[styles.draftBanner, { backgroundColor: theme.primary + '20', borderColor: theme.primary }]}>
              <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
              <Text style={[styles.draftBannerText, { color: theme.text }]}>
                Draft restored - You can continue from where you left off
              </Text>
              <TouchableOpacity onPress={() => setRestoredFromDraft(false)}>
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.form}>
            <Text style={styles.sectionTitle}>Basic Information</Text>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>
                Program Title <Text style={{ color: theme.error }}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, {
                  backgroundColor: theme.card,
                  color: theme.text,
                  borderColor: theme.border,
                }]}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g., Beauty Therapy Learnership, Marketing Fundamentals"
                placeholderTextColor={theme.textSecondary}
              />
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={[styles.label, { color: theme.text }]}>
                  Course Code <Text style={{ color: theme.error }}>*</Text>
                </Text>
                <TouchableOpacity
                  style={[styles.generateButton, { backgroundColor: theme.primary + '20' }]}
                  onPress={handleGenerateCode}
                >
                  <Ionicons name="refresh" size={16} color={theme.primary} />
                  <Text style={[styles.generateButtonText, { color: theme.primary }]}>
                    Generate
                  </Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={[styles.input, {
                  backgroundColor: theme.card,
                  color: theme.text,
                  borderColor: theme.border,
                }]}
                value={courseCode}
                onChangeText={setCourseCode}
                placeholder="ORG-BEAUTY"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
                {['beauty', 'marketing', 'business', 'tech', 'healthcare', 'other'].map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryChip,
                      category === cat && { backgroundColor: theme.primary },
                      { borderColor: theme.border },
                    ]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        category === cat && { color: '#fff' },
                        { color: theme.text },
                      ]}
                    >
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Description</Text>
              <TextInput
                style={[styles.textArea, {
                  backgroundColor: theme.card,
                  color: theme.text,
                  borderColor: theme.border,
                }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe the program, what students will learn, career opportunities..."
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: theme.text }]}>Duration</Text>
                <TextInput
                  style={[styles.input, {
                    backgroundColor: theme.card,
                    color: theme.text,
                    borderColor: theme.border,
                  }]}
                  value={duration}
                  onChangeText={setDuration}
                  placeholder="e.g., 6 months, 12 weeks"
                  placeholderTextColor={theme.textSecondary}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: theme.text }]}>Max Students</Text>
                <TextInput
                  style={[styles.input, {
                    backgroundColor: theme.card,
                    color: theme.text,
                    borderColor: theme.border,
                  }]}
                  value={maxStudents}
                  onChangeText={setMaxStudents}
                  placeholder="Optional"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: theme.text }]}>Start Date</Text>
                <TextInput
                  style={[styles.input, {
                    backgroundColor: theme.card,
                    color: theme.text,
                    borderColor: theme.border,
                  }]}
                  value={startDate}
                  onChangeText={(text) => setStartDate(formatDateInput(text))}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="number-pad"
                  maxLength={10}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: theme.text }]}>End Date</Text>
                <TextInput
                  style={[styles.input, {
                    backgroundColor: theme.card,
                    color: theme.text,
                    borderColor: theme.border,
                  }]}
                  value={endDate}
                  onChangeText={(text) => setEndDate(formatDateInput(text))}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="number-pad"
                  maxLength={10}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.advancedToggle, { borderColor: theme.border }]}
              onPress={() => setShowAdvanced(!showAdvanced)}
            >
              <Text style={[styles.advancedToggleText, { color: theme.text }]}>
                Sponsor & Additional Info
              </Text>
              <Ionicons
                name={showAdvanced ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={theme.textSecondary}
              />
            </TouchableOpacity>

            {showAdvanced && (
              <View style={styles.advancedSection}>
                <View style={styles.inputGroup}>
                  <View style={styles.switchRow}>
                    <Text style={[styles.label, { color: theme.text }]}>Sponsored Program</Text>
                    <Switch
                      value={isSponsored}
                      onValueChange={setIsSponsored}
                      trackColor={{ false: theme.border, true: theme.primary }}
                      thumbColor="#fff"
                    />
                  </View>
                </View>

                {isSponsored && (
                  <>
                    <View style={styles.inputGroup}>
                      <Text style={[styles.label, { color: theme.text }]}>Sponsor Name</Text>
                      <TextInput
                        style={[styles.input, {
                          backgroundColor: theme.card,
                          color: theme.text,
                          borderColor: theme.border,
                        }]}
                        value={sponsorName}
                        onChangeText={setSponsorName}
                        placeholder="Sponsor organization name"
                        placeholderTextColor={theme.textSecondary}
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={[styles.label, { color: theme.text }]}>Sponsor Contact</Text>
                      <TextInput
                        style={[styles.input, {
                          backgroundColor: theme.card,
                          color: theme.text,
                          borderColor: theme.border,
                        }]}
                        value={sponsorContact}
                        onChangeText={setSponsorContact}
                        placeholder="Email or phone"
                        placeholderTextColor={theme.textSecondary}
                        keyboardType="email-address"
                      />
                    </View>
                  </>
                )}

                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: theme.text }]}>Fee/Cost</Text>
                  <TextInput
                    style={[styles.input, {
                      backgroundColor: theme.card,
                      color: theme.text,
                      borderColor: theme.border,
                    }]}
                    value={fee}
                    onChangeText={setFee}
                    placeholder="e.g., R5000, Free, Sponsored"
                    placeholderTextColor={theme.textSecondary}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: theme.text }]}>Entry Requirements</Text>
                  <TextInput
                    style={[styles.textArea, {
                      backgroundColor: theme.card,
                      color: theme.text,
                      borderColor: theme.border,
                    }]}
                    value={requirements}
                    onChangeText={setRequirements}
                    placeholder="Minimum education, skills, prerequisites..."
                    placeholderTextColor={theme.textSecondary}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: theme.text }]}>Learning Outcomes</Text>
                  <TextInput
                    style={[styles.textArea, {
                      backgroundColor: theme.card,
                      color: theme.text,
                      borderColor: theme.border,
                    }]}
                    value={learningOutcomes}
                    onChangeText={setLearningOutcomes}
                    placeholder="What students will achieve upon completion..."
                    placeholderTextColor={theme.textSecondary}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: theme.primary }]}
              onPress={handleSave}
              disabled={saving || !title.trim() || !courseCode.trim()}
            >
              {saving ? (
                <EduDashSpinner color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.saveButtonText}>Create Program</Text>
                </>
              )}
            </TouchableOpacity>

            {hasDraft && (
              <TouchableOpacity
                style={[styles.clearDraftButton, { borderColor: theme.border }]}
                onPress={async () => {
                  showAlert({
                    title: 'Clear Draft?',
                    message: 'This will permanently delete your saved draft. Are you sure?',
                    type: 'warning',
                    buttons: [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Clear',
                        style: 'destructive',
                        onPress: async () => {
                          await clearDraft();
                          setTitle('');
                          setDescription('');
                          setCourseCode('');
                          setDuration('');
                          setMaxStudents('');
                          setStartDate('');
                          setEndDate('');
                          setSponsorName('');
                          setSponsorContact('');
                          setFee('');
                          setIsSponsored(false);
                          setRequirements('');
                          setLearningOutcomes('');
                          setShowAdvanced(false);
                        },
                      },
                    ],
                  });
                }}
              >
                <Ionicons name="trash-outline" size={16} color={theme.textSecondary} />
                <Text style={[styles.clearDraftText, { color: theme.textSecondary }]}>Clear Draft</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 20,
    paddingBottom: 40,
  },
  form: {
    gap: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 8,
  },
  inputGroup: {
    gap: 8,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  generateButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  advancedToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  advancedToggleText: {
    fontSize: 15,
    fontWeight: '600',
  },
  advancedSection: {
    gap: 16,
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 10,
    gap: 8,
    marginTop: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 8,
  },
  autoSaveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  autoSaveText: {
    fontSize: 12,
    marginRight: 4,
  },
  draftIndicator: {
    fontSize: 11,
    marginRight: 4,
  },
  draftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    marginBottom: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  draftBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  clearDraftButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  clearDraftText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

