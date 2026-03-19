import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Modal, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '@/contexts/ThemeContext';
import {
  CATEGORY_CONFIG, WINDOW_TYPE_CONFIG,
  type InputWindowFormData, type InputWindowType, type SubmissionCategory,
  getDefaultWindowFormData,
} from './types';

const ALL_CATEGORIES: SubmissionCategory[] = [
  'theme_suggestion', 'event_request', 'resource_need', 'reflection', 'assessment_preference',
];
const WINDOW_TYPES: InputWindowType[] = ['year_end_reflection', 'annual_planning', 'term_planning', 'open_call'];

interface InputWindowFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: InputWindowFormData) => Promise<void>;
  initialData?: Partial<InputWindowFormData>;
  isEditing?: boolean;
}

// Presets for quick window creation
const PRESETS: { label: string; data: Partial<InputWindowFormData> }[] = [
  {
    label: 'Year-End Reflection (Nov)',
    data: {
      title: 'Year-End Reflection',
      description: 'Share what worked well this year, challenges you faced, and resource needs for next year.',
      windowType: 'year_end_reflection',
      allowedCategories: ['reflection', 'resource_need'],
    },
  },
  {
    label: 'Annual Planning (Jan)',
    data: {
      title: 'Annual Planning Input',
      description: 'Submit your theme ideas, event suggestions, and assessment preferences for the new year.',
      windowType: 'annual_planning',
      allowedCategories: ['theme_suggestion', 'event_request', 'assessment_preference'],
    },
  },
  {
    label: 'Term Planning',
    data: {
      title: 'Term Planning Input',
      description: 'Suggest weekly themes and activities for the upcoming term.',
      windowType: 'term_planning',
      allowedCategories: ['theme_suggestion', 'resource_need'],
    },
  },
];

export function InputWindowFormModal({ visible, onClose, onSubmit, initialData, isEditing }: InputWindowFormModalProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [form, setForm] = useState<InputWindowFormData>({ ...getDefaultWindowFormData(), ...initialData });
  const [saving, setSaving] = useState(false);
  const [showOpensDatePicker, setShowOpensDatePicker] = useState(false);
  const [showClosesDatePicker, setShowClosesDatePicker] = useState(false);

  const updateField = useCallback(<K extends keyof InputWindowFormData>(key: K, value: InputWindowFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleCategory = useCallback((cat: SubmissionCategory) => {
    setForm((prev) => {
      const exists = prev.allowedCategories.includes(cat);
      return {
        ...prev,
        allowedCategories: exists
          ? prev.allowedCategories.filter((c) => c !== cat)
          : [...prev.allowedCategories, cat],
      };
    });
  }, []);

  const applyPreset = useCallback((preset: typeof PRESETS[number]) => {
    setForm((prev) => ({ ...prev, ...preset.data }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await onSubmit(form);
      setForm(getDefaultWindowFormData());
      onClose();
    } finally {
      setSaving(false);
    }
  }, [form, onSubmit, onClose]);

  const formatDate = (d: Date) => d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: theme.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isEditing ? 'Edit Window' : 'Create Input Window'}</Text>
          <TouchableOpacity
            style={[styles.saveBtn, (!form.title.trim() || saving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!form.title.trim() || saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          {/* Quick Presets */}
          {!isEditing && (
            <>
              <Text style={styles.label}>Quick Start</Text>
              <View style={styles.presetRow}>
                {PRESETS.map((p) => (
                  <TouchableOpacity key={p.label} style={styles.presetChip} onPress={() => applyPreset(p)}>
                    <Ionicons name="flash-outline" size={14} color="#F59E0B" />
                    <Text style={styles.presetText}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Title */}
          <Text style={styles.label}>Window Title *</Text>
          <TextInput
            style={styles.input}
            value={form.title}
            onChangeText={(v) => updateField('title', v)}
            placeholder="e.g. Term 2 Planning Input"
            placeholderTextColor={theme.textSecondary}
          />

          {/* Description */}
          <Text style={styles.label}>Instructions for Teachers</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={form.description}
            onChangeText={(v) => updateField('description', v)}
            placeholder="What should teachers submit? Any specific focus areas?"
            placeholderTextColor={theme.textSecondary}
            multiline
            numberOfLines={3}
          />

          {/* Window Type */}
          <Text style={styles.label}>Window Type</Text>
          <View style={styles.typeGrid}>
            {WINDOW_TYPES.map((wt) => {
              const config = WINDOW_TYPE_CONFIG[wt];
              const isActive = form.windowType === wt;
              return (
                <TouchableOpacity
                  key={wt}
                  style={[styles.typeChip, isActive && styles.typeChipActive]}
                  onPress={() => updateField('windowType', wt)}
                >
                  <Text style={[styles.typeText, isActive && styles.typeTextActive]}>{config.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Academic Year */}
          <Text style={styles.label}>Academic Year</Text>
          <View style={styles.yearRow}>
            {[new Date().getFullYear(), new Date().getFullYear() + 1].map((y) => (
              <TouchableOpacity
                key={y}
                style={[styles.yearChip, form.academicYear === y && styles.yearChipActive]}
                onPress={() => updateField('academicYear', y)}
              >
                <Text style={[styles.yearText, form.academicYear === y && styles.yearTextActive]}>{y}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Date Pickers */}
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Opens</Text>
              <TouchableOpacity
                style={styles.input}
                onPress={() => setShowOpensDatePicker(true)}
              >
                <Text style={{ color: theme.text }}>{formatDate(form.opensAt)}</Text>
              </TouchableOpacity>
              {showOpensDatePicker && (
                <DateTimePicker
                  value={form.opensAt}
                  mode="date"
                  display="default"
                  onChange={(_, date) => {
                    setShowOpensDatePicker(false);
                    if (date) updateField('opensAt', date);
                  }}
                />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Closes</Text>
              <TouchableOpacity
                style={styles.input}
                onPress={() => setShowClosesDatePicker(true)}
              >
                <Text style={{ color: theme.text }}>{formatDate(form.closesAt)}</Text>
              </TouchableOpacity>
              {showClosesDatePicker && (
                <DateTimePicker
                  value={form.closesAt}
                  mode="date"
                  display="default"
                  minimumDate={form.opensAt}
                  onChange={(_, date) => {
                    setShowClosesDatePicker(false);
                    if (date) updateField('closesAt', date);
                  }}
                />
              )}
            </View>
          </View>

          {/* Allowed Categories */}
          <Text style={styles.label}>Allowed Categories</Text>
          <View style={styles.catGrid}>
            {ALL_CATEGORIES.map((cat) => {
              const config = CATEGORY_CONFIG[cat];
              const isActive = form.allowedCategories.includes(cat);
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catChip, isActive && { backgroundColor: config.color + '20', borderColor: config.color }]}
                  onPress={() => toggleCategory(cat)}
                >
                  <Ionicons name={config.icon as any} size={14} color={isActive ? config.color : theme.textSecondary} />
                  <Text style={[styles.catText, isActive && { color: config.color }]}>{config.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

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
  saveBtn: { backgroundColor: '#3B82F6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  label: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 8, marginTop: 16 },
  dateRow: { flexDirection: 'row', gap: 12 },
  input: {
    backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 10,
    padding: 12, fontSize: 15, color: theme.text,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FCD34D',
  },
  presetText: { fontSize: 12, fontWeight: '600', color: '#92400E' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1.5, borderColor: theme.border, backgroundColor: theme.card,
  },
  typeChipActive: { backgroundColor: '#3B82F620', borderColor: '#3B82F6' },
  typeText: { fontSize: 13, fontWeight: '500', color: theme.text },
  typeTextActive: { color: '#3B82F6' },
  yearRow: { flexDirection: 'row', gap: 8 },
  yearChip: {
    paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1.5, borderColor: theme.border, backgroundColor: theme.card,
  },
  yearChipActive: { backgroundColor: '#10B98120', borderColor: '#10B981' },
  yearText: { fontSize: 14, fontWeight: '600', color: theme.text },
  yearTextActive: { color: '#10B981' },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1.5, borderColor: theme.border, backgroundColor: theme.card,
  },
  catText: { fontSize: 12, fontWeight: '500', color: theme.text },
});
