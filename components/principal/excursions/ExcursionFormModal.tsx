// Excursion Form Modal Component
// Create and edit excursions with date/time pickers, age groups, AI assist

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '@/contexts/ThemeContext';
import { useExcursionAI } from '@/hooks/principal/useExcursionAI';
import type { Excursion, ExcursionFormData, ExcursionPreflightChecks, AgeGroup } from './types';
import {
  getInitialExcursionFormData, excursionToFormData,
  PREFLIGHT_CHECK_ITEMS, isPreflightComplete, AGE_GROUP_OPTIONS,
} from './types';

type PickerTarget = 'date' | 'departure' | 'return' | 'consent_deadline' | null;

interface ExcursionFormModalProps {
  visible: boolean;
  excursion: Excursion | null;
  onClose: () => void;
  onSave: (formData: ExcursionFormData, editingId?: string) => Promise<boolean>;
}

const formatDate = (d: Date) => d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
const formatTime = (d: Date | null) => d ? d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : 'Tap to set';

export function ExcursionFormModal({ visible, excursion, onClose, onSave }: ExcursionFormModalProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [formData, setFormData] = useState<ExcursionFormData>(getInitialExcursionFormData());
  const [activePicker, setActivePicker] = useState<PickerTarget>(null);
  const [saving, setSaving] = useState(false);
  const { loading: aiLoading, suggestions, generateSuggestions, clearSuggestions } = useExcursionAI();

  useEffect(() => {
    if (visible) {
      setFormData(excursion ? excursionToFormData(excursion) : getInitialExcursionFormData());
      setActivePicker(null);
      clearSuggestions();
    }
  }, [excursion, visible, clearSuggestions]);

  const handleSave = async () => {
    setSaving(true);
    const success = await onSave(formData, excursion?.id);
    setSaving(false);
    if (success) onClose();
  };

  const handleDateChange = useCallback((_: any, date?: Date) => {
    const target = activePicker;
    if (Platform.OS !== 'web') setActivePicker(null);
    if (!date) return;
    setFormData(prev => {
      if (target === 'date') return { ...prev, excursion_date: date };
      if (target === 'departure') return { ...prev, departure_time: date };
      if (target === 'return') return { ...prev, return_time: date };
      if (target === 'consent_deadline') return { ...prev, consent_deadline: date };
      return prev;
    });
  }, [activePicker]);

  const toggleAgeGroup = (ag: AgeGroup) => {
    setFormData(prev => ({
      ...prev,
      age_groups: prev.age_groups.includes(ag)
        ? prev.age_groups.filter(a => a !== ag)
        : [...prev.age_groups, ag],
    }));
  };

  const handleAISuggest = async () => {
    const result = await generateSuggestions(formData.title, formData.destination, formData.age_groups);
    if (!result) return;
    // Auto-fill empty fields only
    setFormData(prev => ({
      ...prev,
      description: prev.description || result.description,
      learning_objectives: prev.learning_objectives || result.learning_objectives.join(', '),
      items_to_bring: prev.items_to_bring || result.items_to_bring.join(', '),
      estimated_cost_per_child: prev.estimated_cost_per_child === '0' ? String(result.estimated_cost) : prev.estimated_cost_per_child,
    }));
  };

  const applyAllSuggestions = () => {
    if (!suggestions) return;
    setFormData(prev => ({
      ...prev,
      description: suggestions.description,
      learning_objectives: suggestions.learning_objectives.join(', '),
      items_to_bring: suggestions.items_to_bring.join(', '),
      estimated_cost_per_child: String(suggestions.estimated_cost),
    }));
  };

  const pickerValue = activePicker === 'date' ? formData.excursion_date
    : activePicker === 'departure' ? (formData.departure_time || new Date())
    : activePicker === 'return' ? (formData.return_time || new Date())
    : activePicker === 'consent_deadline' ? (formData.consent_deadline || formData.excursion_date)
    : new Date();

  const pickerMode = activePicker === 'date' || activePicker === 'consent_deadline' ? 'date' : 'time';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{excursion ? 'Edit Excursion' : 'New Excursion'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={28} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            {/* Title + Destination */}
            <Text style={styles.inputLabel}>Title *</Text>
            <TextInput style={styles.input} value={formData.title}
              onChangeText={t => setFormData(p => ({ ...p, title: t }))}
              placeholder="e.g., Visit to Local Farm" placeholderTextColor={theme.textSecondary} />

            <Text style={styles.inputLabel}>Destination *</Text>
            <TextInput style={styles.input} value={formData.destination}
              onChangeText={t => setFormData(p => ({ ...p, destination: t }))}
              placeholder="e.g., Sunny Acres Farm" placeholderTextColor={theme.textSecondary} />

            {/* AI Suggest Button */}
            {(formData.title.trim().length > 2 || formData.destination.trim().length > 2) && (
              <TouchableOpacity style={styles.aiButton} onPress={handleAISuggest} disabled={aiLoading}>
                {aiLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="sparkles" size={18} color="#fff" />
                )}
                <Text style={styles.aiButtonText}>
                  {aiLoading ? 'Generating suggestions...' : 'AI: Suggest Details'}
                </Text>
              </TouchableOpacity>
            )}

            {/* AI Suggestions Preview */}
            {suggestions && (
              <View style={styles.aiSuggestionsBox}>
                <View style={styles.aiSuggestionsHeader}>
                  <Ionicons name="sparkles" size={16} color="#a78bfa" />
                  <Text style={styles.aiSuggestionsTitle}>AI Suggestions</Text>
                  <TouchableOpacity onPress={applyAllSuggestions} style={styles.aiApplyAll}>
                    <Text style={styles.aiApplyAllText}>Apply All</Text>
                  </TouchableOpacity>
                </View>
                {suggestions.safety_tips.length > 0 && (
                  <View style={styles.aiSafetyTips}>
                    <Text style={styles.aiSafetyLabel}>Safety Tips:</Text>
                    {suggestions.safety_tips.map((tip, i) => (
                      <Text key={i} style={styles.aiSafetyTip}>- {tip}</Text>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Date Picker */}
            <Text style={styles.inputLabel}>Excursion Date *</Text>
            <TouchableOpacity style={styles.dateButton} onPress={() => setActivePicker('date')}>
              <Ionicons name="calendar" size={20} color={theme.primary} />
              <Text style={styles.dateButtonText}>{formatDate(formData.excursion_date)}</Text>
            </TouchableOpacity>

            {/* Time Row */}
            <View style={styles.timeRow}>
              <View style={styles.timeCol}>
                <Text style={styles.inputLabel}>Departure Time</Text>
                <TouchableOpacity style={styles.dateButton} onPress={() => setActivePicker('departure')}>
                  <Ionicons name="time-outline" size={18} color={theme.primary} />
                  <Text style={styles.dateButtonText}>{formatTime(formData.departure_time)}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.timeCol}>
                <Text style={styles.inputLabel}>Return Time</Text>
                <TouchableOpacity style={styles.dateButton} onPress={() => setActivePicker('return')}>
                  <Ionicons name="time-outline" size={18} color={theme.primary} />
                  <Text style={styles.dateButtonText}>{formatTime(formData.return_time)}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Native DateTimePicker */}
            {activePicker && (
              <DateTimePicker
                value={pickerValue}
                mode={pickerMode}
                minimumDate={activePicker === 'date' || activePicker === 'consent_deadline' ? new Date() : undefined}
                onChange={handleDateChange}
              />
            )}

            {/* Age Groups */}
            <Text style={styles.inputLabel}>Age Groups</Text>
            <View style={styles.ageGroupRow}>
              {AGE_GROUP_OPTIONS.map(ag => {
                const selected = formData.age_groups.includes(ag);
                return (
                  <TouchableOpacity key={ag} style={[styles.ageChip, selected && styles.ageChipSelected]}
                    onPress={() => toggleAgeGroup(ag)}>
                    <Text style={[styles.ageChipText, selected && styles.ageChipTextSelected]}>{ag}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Description */}
            <Text style={styles.inputLabel}>Description</Text>
            <TextInput style={[styles.input, styles.inputMultiline]} value={formData.description}
              onChangeText={t => setFormData(p => ({ ...p, description: t }))}
              placeholder="Describe the excursion..." placeholderTextColor={theme.textSecondary}
              multiline numberOfLines={3} />

            {/* Cost */}
            <Text style={styles.inputLabel}>Estimated Cost per Child (R)</Text>
            <TextInput style={styles.input} value={formData.estimated_cost_per_child}
              onChangeText={t => setFormData(p => ({ ...p, estimated_cost_per_child: t }))}
              placeholder="0" placeholderTextColor={theme.textSecondary} keyboardType="decimal-pad" />

            {/* Learning Objectives */}
            <Text style={styles.inputLabel}>Learning Objectives (comma-separated)</Text>
            <TextInput style={[styles.input, styles.inputMultiline]} value={formData.learning_objectives}
              onChangeText={t => setFormData(p => ({ ...p, learning_objectives: t }))}
              placeholder="e.g., Learn about farm animals, Understand food sources"
              placeholderTextColor={theme.textSecondary} multiline />

            {/* Items to Bring */}
            <Text style={styles.inputLabel}>Items to Bring (comma-separated)</Text>
            <TextInput style={[styles.input, styles.inputMultiline]} value={formData.items_to_bring}
              onChangeText={t => setFormData(p => ({ ...p, items_to_bring: t }))}
              placeholder="e.g., Hat, Sunscreen, Packed lunch"
              placeholderTextColor={theme.textSecondary} multiline />

            {/* Consent */}
            <TouchableOpacity style={styles.checkboxRow}
              onPress={() => setFormData(p => ({ ...p, consent_required: !p.consent_required }))}>
              <Ionicons name={formData.consent_required ? 'checkbox' : 'square-outline'} size={24} color={theme.primary} />
              <Text style={styles.checkboxLabel}>Parent consent required</Text>
            </TouchableOpacity>

            {formData.consent_required && (
              <>
                <Text style={styles.inputLabel}>Consent Deadline</Text>
                <TouchableOpacity style={styles.dateButton} onPress={() => setActivePicker('consent_deadline')}>
                  <Ionicons name="calendar-outline" size={18} color={theme.primary} />
                  <Text style={styles.dateButtonText}>
                    {formData.consent_deadline ? formatDate(formData.consent_deadline) : 'Tap to set deadline'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {/* Preflight Checklist (edit only) */}
            {excursion && (
              <View style={styles.preflightSection}>
                <Text style={styles.preflightTitle}>Preflight Checklist (required before approval)</Text>
                {PREFLIGHT_CHECK_ITEMS.map(item => {
                  const checked = formData.preflight_checks?.[item.id] ?? false;
                  return (
                    <TouchableOpacity key={item.id} style={styles.checkboxRow}
                      onPress={() => setFormData(prev => ({
                        ...prev,
                        preflight_checks: { ...(prev.preflight_checks ?? {}), [item.id]: !checked } as ExcursionPreflightChecks,
                      }))}>
                      <Ionicons name={checked ? 'checkmark-circle' : 'ellipse-outline'} size={24}
                        color={checked ? '#10b981' : theme.textSecondary} />
                      <Text style={[styles.checkboxLabel, !checked && styles.checkboxLabelIncomplete]}>{item.label}</Text>
                    </TouchableOpacity>
                  );
                })}
                {formData.preflight_checks && isPreflightComplete(formData.preflight_checks) && (
                  <Text style={styles.preflightComplete}>All checks complete. Ready to approve.</Text>
                )}
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={[styles.modalButton, styles.modalButtonSecondary]} onPress={onClose}>
              <Text style={styles.modalButtonTextSecondary}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalButton, styles.modalButtonPrimary]} onPress={handleSave} disabled={saving}>
              <Text style={styles.modalButtonTextPrimary}>
                {saving ? 'Saving...' : excursion ? 'Update' : 'Create'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: theme.border },
  modalTitle: { fontSize: 20, fontWeight: '600', color: theme.text },
  modalBody: { padding: 20 },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', padding: 20, gap: 12, borderTopWidth: 1, borderTopColor: theme.border },
  inputLabel: { fontSize: 14, fontWeight: '500', color: theme.text, marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 12, fontSize: 16, color: theme.text },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  dateButton: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 12 },
  dateButtonText: { fontSize: 16, color: theme.text },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeCol: { flex: 1 },
  ageGroupRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ageChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.background },
  ageChipSelected: { backgroundColor: theme.primary + '20', borderColor: theme.primary },
  ageChipText: { fontSize: 13, color: theme.textSecondary, fontWeight: '500' },
  ageChipTextSelected: { color: theme.primary },
  aiButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#7c3aed', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, marginTop: 16, alignSelf: 'flex-start' },
  aiButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  aiSuggestionsBox: { marginTop: 12, backgroundColor: '#7c3aed10', borderWidth: 1, borderColor: '#7c3aed40', borderRadius: 12, padding: 14 },
  aiSuggestionsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  aiSuggestionsTitle: { fontSize: 14, fontWeight: '600', color: '#a78bfa', flex: 1 },
  aiApplyAll: { backgroundColor: '#7c3aed', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  aiApplyAllText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  aiSafetyTips: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#7c3aed20' },
  aiSafetyLabel: { fontSize: 13, fontWeight: '600', color: '#f59e0b', marginBottom: 4 },
  aiSafetyTip: { fontSize: 13, color: theme.textSecondary, marginLeft: 4, marginTop: 2 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20 },
  checkboxLabel: { fontSize: 16, color: theme.text },
  checkboxLabelIncomplete: { color: theme.textSecondary },
  preflightSection: { marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: theme.border },
  preflightTitle: { fontSize: 14, fontWeight: '600', color: theme.text, marginBottom: 12 },
  preflightComplete: { fontSize: 13, color: '#10b981', marginTop: 12, fontWeight: '500' },
  modalButton: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  modalButtonSecondary: { backgroundColor: theme.background },
  modalButtonPrimary: { backgroundColor: theme.primary },
  modalButtonTextSecondary: { color: theme.text, fontWeight: '600' },
  modalButtonTextPrimary: { color: '#fff', fontWeight: '600' },
});
