import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { CategoryIcon } from './CategoryIcon';
import {
  CATEGORY_CONFIG, PRIORITY_CONFIG, type InputWindow, type SubmissionFormData,
  type SubmissionCategory, type SubmissionPriority, getDefaultSubmissionFormData,
} from './types';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const AGE_GROUP_OPTIONS = ['0-2', '2-3', '3-4', '4-5', '5-6', '3-6'];

interface SubmissionFormProps {
  visible: boolean;
  window: InputWindow;
  onClose: () => void;
  onSubmit: (data: SubmissionFormData) => Promise<void>;
}

export function SubmissionForm({ visible, window: w, onClose, onSubmit }: SubmissionFormProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [form, setForm] = useState<SubmissionFormData>(getDefaultSubmissionFormData());
  const [submitting, setSubmitting] = useState(false);
  const [objectiveInput, setObjectiveInput] = useState('');
  const [materialInput, setMaterialInput] = useState('');

  // Reset form when window changes or modal opens
  React.useEffect(() => {
    if (visible) {
      setForm(getDefaultSubmissionFormData());
      setObjectiveInput('');
      setMaterialInput('');
    }
  }, [visible, w.id]);

  const updateField = useCallback(<K extends keyof SubmissionFormData>(key: K, value: SubmissionFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!form.title.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(form);
      setForm(getDefaultSubmissionFormData());
      onClose();
    } finally {
      setSubmitting(false);
    }
  }, [form, onSubmit, onClose]);

  const addObjective = useCallback(() => {
    if (!objectiveInput.trim()) return;
    updateField('learningObjectives', [...form.learningObjectives, objectiveInput.trim()]);
    setObjectiveInput('');
  }, [objectiveInput, form.learningObjectives, updateField]);

  const addMaterial = useCallback(() => {
    if (!materialInput.trim()) return;
    updateField('materialsNeeded', [...form.materialsNeeded, materialInput.trim()]);
    setMaterialInput('');
  }, [materialInput, form.materialsNeeded, updateField]);

  const toggleAgeGroup = useCallback((ag: string) => {
    const exists = form.ageGroups.includes(ag);
    updateField('ageGroups', exists ? form.ageGroups.filter((a) => a !== ag) : [...form.ageGroups, ag]);
  }, [form.ageGroups, updateField]);

  const allowedCats = w.allowed_categories as SubmissionCategory[];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: theme.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Submit Input</Text>
          <TouchableOpacity
            style={[styles.submitBtn, (!form.title.trim() || submitting) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!form.title.trim() || submitting}
          >
            <Text style={styles.submitBtnText}>{submitting ? 'Sending...' : 'Submit'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          {/* Category Selector */}
          <Text style={styles.sectionLabel}>Category</Text>
          <View style={styles.categoryGrid}>
            {allowedCats.map((cat) => {
              const config = CATEGORY_CONFIG[cat];
              const isActive = form.category === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryChip, isActive && { backgroundColor: config.color + '20', borderColor: config.color }]}
                  onPress={() => updateField('category', cat)}
                >
                  <CategoryIcon category={cat} size={14} />
                  <Text style={[styles.categoryChipText, isActive && { color: config.color }]}>{config.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Title */}
          <Text style={styles.sectionLabel}>Title *</Text>
          <TextInput
            style={styles.input}
            value={form.title}
            onChangeText={(v) => updateField('title', v)}
            placeholder={form.category === 'theme_suggestion' ? 'e.g. "My Body & Senses"' : 'Give your suggestion a title'}
            placeholderTextColor={theme.textSecondary}
          />

          {/* Description */}
          <Text style={styles.sectionLabel}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={form.description}
            onChangeText={(v) => updateField('description', v)}
            placeholder="Describe your suggestion in detail..."
            placeholderTextColor={theme.textSecondary}
            multiline
            numberOfLines={3}
          />

          {/* Priority */}
          <Text style={styles.sectionLabel}>Priority</Text>
          <View style={styles.priorityRow}>
            {(['low', 'normal', 'high'] as SubmissionPriority[]).map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.priorityChip, form.priority === p && { backgroundColor: PRIORITY_CONFIG[p].color + '20', borderColor: PRIORITY_CONFIG[p].color }]}
                onPress={() => updateField('priority', p)}
              >
                <Text style={[styles.priorityText, form.priority === p && { color: PRIORITY_CONFIG[p].color }]}>
                  {PRIORITY_CONFIG[p].label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Target Term */}
          <Text style={styles.sectionLabel}>Target Term</Text>
          <View style={styles.termRow}>
            {[1, 2, 3, 4].map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.termChip, form.targetTermNumber === t && styles.termChipActive]}
                onPress={() => updateField('targetTermNumber', form.targetTermNumber === t ? null : t)}
              >
                <Text style={[styles.termChipText, form.targetTermNumber === t && styles.termChipTextActive]}>
                  Term {t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Target Month */}
          {(form.category === 'event_request' || form.category === 'assessment_preference') && (
            <>
              <Text style={styles.sectionLabel}>Target Month</Text>
              <View style={styles.monthGrid}>
                {MONTH_NAMES.map((m, i) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.monthChip, form.targetMonth === i + 1 && styles.monthChipActive]}
                    onPress={() => updateField('targetMonth', form.targetMonth === i + 1 ? null : i + 1)}
                  >
                    <Text style={[styles.monthText, form.targetMonth === i + 1 && styles.monthTextActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Theme-specific: Learning Objectives */}
          {form.category === 'theme_suggestion' && (
            <>
              <Text style={styles.sectionLabel}>Learning Objectives</Text>
              <View style={styles.chipInputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={objectiveInput}
                  onChangeText={setObjectiveInput}
                  placeholder="Add an objective..."
                  placeholderTextColor={theme.textSecondary}
                  onSubmitEditing={addObjective}
                />
                <TouchableOpacity style={styles.addBtn} onPress={addObjective}>
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
              {form.learningObjectives.map((obj, i) => (
                <View key={i} style={styles.chipItem}>
                  <Text style={styles.chipItemText}>{obj}</Text>
                  <TouchableOpacity onPress={() => updateField('learningObjectives', form.learningObjectives.filter((_, j) => j !== i))}>
                    <Ionicons name="close-circle" size={16} color={theme.textSecondary} />
                  </TouchableOpacity>
                </View>
              ))}

              <Text style={styles.sectionLabel}>Age Groups</Text>
              <View style={styles.ageGrid}>
                {AGE_GROUP_OPTIONS.map((ag) => (
                  <TouchableOpacity
                    key={ag}
                    style={[styles.ageChip, form.ageGroups.includes(ag) && styles.ageChipActive]}
                    onPress={() => toggleAgeGroup(ag)}
                  >
                    <Text style={[styles.ageText, form.ageGroups.includes(ag) && styles.ageTextActive]}>{ag} yrs</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Resource-specific: Materials */}
          {(form.category === 'resource_need' || form.category === 'theme_suggestion') && (
            <>
              <Text style={styles.sectionLabel}>Materials Needed</Text>
              <View style={styles.chipInputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={materialInput}
                  onChangeText={setMaterialInput}
                  placeholder="Add a material..."
                  placeholderTextColor={theme.textSecondary}
                  onSubmitEditing={addMaterial}
                />
                <TouchableOpacity style={styles.addBtn} onPress={addMaterial}>
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
              {form.materialsNeeded.map((mat, i) => (
                <View key={i} style={styles.chipItem}>
                  <Text style={styles.chipItemText}>{mat}</Text>
                  <TouchableOpacity onPress={() => updateField('materialsNeeded', form.materialsNeeded.filter((_, j) => j !== i))}>
                    <Ionicons name="close-circle" size={16} color={theme.textSecondary} />
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}

          {/* Event/Resource: Estimated Cost */}
          {(form.category === 'event_request' || form.category === 'resource_need') && (
            <>
              <Text style={styles.sectionLabel}>Estimated Cost</Text>
              <TextInput
                style={styles.input}
                value={form.estimatedCost}
                onChangeText={(v) => updateField('estimatedCost', v)}
                placeholder="e.g. R500"
                placeholderTextColor={theme.textSecondary}
                keyboardType="default"
              />
            </>
          )}

          {/* Event: Suggested Bucket */}
          {form.category === 'event_request' && (
            <>
              <Text style={styles.sectionLabel}>Event Type</Text>
              <View style={styles.bucketRow}>
                {(['excursions_extras', 'meetings_admin', 'donations_fundraisers'] as const).map((b) => {
                  const labels: Record<string, string> = {
                    excursions_extras: 'Excursion / Extra',
                    meetings_admin: 'Meeting / Admin',
                    donations_fundraisers: 'Fundraiser / Donation',
                  };
                  return (
                    <TouchableOpacity
                      key={b}
                      style={[styles.bucketChip, form.suggestedBucket === b && styles.bucketChipActive]}
                      onPress={() => updateField('suggestedBucket', form.suggestedBucket === b ? null : b)}
                    >
                      <Text style={[styles.bucketText, form.suggestedBucket === b && styles.bucketTextActive]}>{labels[b]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
  submitBtn: { backgroundColor: '#3B82F6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 8, marginTop: 16 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1.5, borderColor: theme.border, backgroundColor: theme.card,
  },
  categoryChipText: { fontSize: 13, color: theme.text, fontWeight: '500' },
  input: {
    backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 10,
    padding: 12, fontSize: 15, color: theme.text,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  priorityRow: { flexDirection: 'row', gap: 8 },
  priorityChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1.5, borderColor: theme.border, backgroundColor: theme.card,
  },
  priorityText: { fontSize: 13, fontWeight: '500', color: theme.text },
  termRow: { flexDirection: 'row', gap: 8 },
  termChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1.5, borderColor: theme.border, backgroundColor: theme.card,
  },
  termChipActive: { backgroundColor: '#3B82F620', borderColor: '#3B82F6' },
  termChipText: { fontSize: 13, fontWeight: '500', color: theme.text },
  termChipTextActive: { color: '#3B82F6' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  monthChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card,
  },
  monthChipActive: { backgroundColor: '#8B5CF620', borderColor: '#8B5CF6' },
  monthText: { fontSize: 12, color: theme.text },
  monthTextActive: { color: '#8B5CF6', fontWeight: '600' },
  chipInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addBtn: {
    backgroundColor: '#3B82F6', width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  chipItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.card, padding: 10, borderRadius: 8, marginTop: 6,
  },
  chipItemText: { fontSize: 13, color: theme.text, flex: 1 },
  ageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ageChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1.5, borderColor: theme.border, backgroundColor: theme.card,
  },
  ageChipActive: { backgroundColor: '#10B98120', borderColor: '#10B981' },
  ageText: { fontSize: 13, color: theme.text },
  ageTextActive: { color: '#10B981', fontWeight: '600' },
  bucketRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bucketChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1.5, borderColor: theme.border, backgroundColor: theme.card,
  },
  bucketChipActive: { backgroundColor: '#F59E0B20', borderColor: '#F59E0B' },
  bucketText: { fontSize: 12, color: theme.text },
  bucketTextActive: { color: '#F59E0B', fontWeight: '600' },
});
