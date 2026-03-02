/**
 * Class Assignment Modal Component
 * Modal for assigning students to classes
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { StudentDetail, Class } from './types';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { ModalLayer } from '@/components/ui/ModalLayer';

interface ClassAssignmentModalProps {
  visible: boolean;
  student: StudentDetail;
  classes: Class[];
  selectedClassId: string;
  onSelectClass: (classId: string) => void;
  onSave: () => void;
  onClose: () => void;
  theme: ThemeColors;
}

const toClassLabel = (cls: Class) =>
  `${cls.name} - ${cls.teacher_name || 'No teacher'} (${cls.current_enrollment}/${cls.capacity})`;

export const ClassAssignmentModal: React.FC<ClassAssignmentModalProps> = ({
  visible,
  student,
  classes,
  selectedClassId,
  onSelectClass,
  onSave,
  onClose,
  theme,
}) => {
  const styles = createStyles(theme);
  const [showWebOptions, setShowWebOptions] = useState(false);
  const saveDisabled = !selectedClassId;
  const classOptions = useMemo(
    () =>
      classes.map((cls) => ({
        id: cls.id,
        label: toClassLabel(cls),
      })),
    [classes],
  );
  const selectedOptionLabel = useMemo(
    () => classOptions.find((option) => option.id === selectedClassId)?.label ?? 'Select a class...',
    [classOptions, selectedClassId],
  );

  useEffect(() => {
    if (!visible) setShowWebOptions(false);
  }, [visible]);

  return (
    <ModalLayer
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />

        <View
          style={styles.modalCard}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Assign Class</Text>
            <Text style={styles.modalSubtitle}>{student.first_name} {student.last_name}</Text>
          </View>

          <View style={styles.modalContent}>
            <Text style={styles.pickerLabel}>Select class</Text>
            {Platform.OS === 'web' ? (
              <>
                <TouchableOpacity
                  style={styles.webSelectTrigger}
                  onPress={() => setShowWebOptions((prev) => !prev)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.webSelectText,
                      !selectedClassId && styles.webSelectPlaceholder,
                    ]}
                    numberOfLines={1}
                  >
                    {selectedOptionLabel}
                  </Text>
                  <Ionicons
                    name={showWebOptions ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={theme.textSecondary}
                  />
                </TouchableOpacity>
                {showWebOptions && (
                  <View style={styles.webOptionsContainer}>
                    <ScrollView
                      style={styles.webOptionsScroll}
                      showsVerticalScrollIndicator={true}
                      nestedScrollEnabled
                    >
                      <TouchableOpacity
                        style={[styles.webOptionItem, !selectedClassId && styles.webOptionItemSelected]}
                        onPress={() => {
                          onSelectClass('');
                          setShowWebOptions(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.webOptionText,
                            !selectedClassId && styles.webOptionTextSelected,
                          ]}
                        >
                          Select a class...
                        </Text>
                      </TouchableOpacity>
                      {classOptions.map((option) => {
                        const isSelected = option.id === selectedClassId;
                        return (
                          <TouchableOpacity
                            key={option.id}
                            style={[styles.webOptionItem, isSelected && styles.webOptionItemSelected]}
                            onPress={() => {
                              onSelectClass(option.id);
                              setShowWebOptions(false);
                            }}
                          >
                            <Text
                              style={[styles.webOptionText, isSelected && styles.webOptionTextSelected]}
                            >
                              {option.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.pickerWrap}>
                <Picker
                  selectedValue={selectedClassId}
                  onValueChange={onSelectClass}
                  style={styles.picker}
                  dropdownIconColor={theme.textSecondary}
                >
                  <Picker.Item label="Select a class..." value="" />
                  {classOptions.map((option) => (
                    <Picker.Item
                      key={option.id}
                      label={option.label}
                      value={option.id}
                    />
                  ))}
                </Picker>
              </View>
            )}

            <Text style={styles.helperText}>
              {classes.length} class{classes.length === 1 ? '' : 'es'} available
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, saveDisabled && styles.saveButtonDisabled]}
              onPress={onSave}
              disabled={saveDisabled}
            >
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ModalLayer>
  );
};

const createStyles = (theme: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 700,
    borderRadius: 16,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 18,
    overflow: 'hidden',
  },
  modalHeader: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.text,
  },
  modalSubtitle: {
    marginTop: 4,
    fontSize: 14,
    color: theme.textSecondary,
  },
  modalContent: {
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  pickerLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 10,
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: theme.background,
    overflow: 'hidden',
  },
  picker: {
    color: theme.text,
    minHeight: Platform.OS === 'web' ? 46 : undefined,
  },
  webSelectTrigger: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: theme.background,
    minHeight: 46,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  webSelectText: {
    flex: 1,
    color: theme.text,
    fontSize: 14,
    fontWeight: '500',
  },
  webSelectPlaceholder: {
    color: theme.textSecondary,
    fontWeight: '400',
  },
  webOptionsContainer: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: theme.background,
    overflow: 'hidden',
  },
  webOptionsScroll: {
    maxHeight: 240,
  },
  webOptionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  webOptionItemSelected: {
    backgroundColor: `${theme.primary}22`,
  },
  webOptionText: {
    color: theme.text,
    fontSize: 13,
  },
  webOptionTextSelected: {
    color: theme.primary,
    fontWeight: '600',
  },
  helperText: {
    marginTop: 10,
    fontSize: 12,
    color: theme.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 18,
    paddingTop: 8,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    marginRight: 10,
    backgroundColor: theme.background,
  },
  cancelButtonText: {
    color: theme.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: theme.primary,
  },
  saveButtonDisabled: {
    opacity: 0.45,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
