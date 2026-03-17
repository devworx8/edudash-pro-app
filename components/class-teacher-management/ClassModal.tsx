/**
 * Class Modal Component
 * Extracted from app/screens/class-teacher-management.tsx
 */

import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import type { ClassFormData, Teacher } from './types';
import { GRADE_LEVEL_OPTIONS } from './utils';

interface ClassModalProps {
  visible: boolean;
  theme: any;
  classForm: ClassFormData;
  activeTeachers: Teacher[];
  onClose: () => void;
  onSave: () => void;
  onFormChange: React.Dispatch<React.SetStateAction<ClassFormData>>;
}

export function ClassModal({
  visible,
  theme,
  classForm,
  activeTeachers,
  onClose,
  onSave,
  onFormChange,
}: ClassModalProps) {
  const styles = getStyles(theme);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Create New Class</Text>
          <TouchableOpacity onPress={onSave}>
            <Text style={styles.modalSave}>Create</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Class Name *</Text>
            <TextInput
              style={styles.formInput}
              value={classForm.name}
              onChangeText={(text) => onFormChange((prev) => ({ ...prev, name: text }))}
              placeholder="e.g., Grade R-A"
              placeholderTextColor={theme.textSecondary}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Grade Level *</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={classForm.grade_level}
                onValueChange={(value) =>
                  onFormChange((prev) => ({ ...prev, grade_level: value }))
                }
                style={styles.formPicker}
              >
                {GRADE_LEVEL_OPTIONS.map((option) => (
                  <Picker.Item key={option.value} label={option.label} value={option.value} />
                ))}
              </Picker>
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Class Capacity</Text>
            <TextInput
              style={styles.formInput}
              value={classForm.capacity.toString()}
              onChangeText={(text) =>
                onFormChange((prev) => ({
                  ...prev,
                  capacity: parseInt(text) || 25,
                }))
              }
              keyboardType="numeric"
              placeholder="25"
              placeholderTextColor={theme.textSecondary}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Room Number (Optional)</Text>
            <TextInput
              style={styles.formInput}
              value={classForm.room_number}
              onChangeText={(text) => onFormChange((prev) => ({ ...prev, room_number: text }))}
              placeholder="e.g., 101"
              placeholderTextColor={theme.textSecondary}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Assign Lead Teacher (Optional)</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={classForm.teacher_id}
                onValueChange={(value) =>
                  onFormChange((prev) => ({ ...prev, teacher_id: value }))
                }
                style={styles.formPicker}
              >
                <Picker.Item label="No lead teacher assigned" value="" />
                {activeTeachers.map((teacher) => (
                  <Picker.Item
                    key={teacher.id}
                    label={`${teacher.full_name} (${teacher.classes_assigned} classes)`}
                    value={teacher.id}
                  />
                ))}
              </Picker>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    modalContainer: {
      flex: 1,
      backgroundColor: theme.background,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      backgroundColor: theme.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text,
    },
    modalCancel: {
      fontSize: 16,
      color: theme.textSecondary,
    },
    modalSave: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.primary,
    },
    modalContent: {
      flex: 1,
      padding: 16,
    },
    formGroup: {
      marginBottom: 20,
    },
    formLabel: {
      fontSize: 16,
      fontWeight: '500',
      color: theme.text,
      marginBottom: 8,
    },
    formInput: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      backgroundColor: theme.surface,
      color: theme.text,
    },
    pickerContainer: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      backgroundColor: theme.surface,
      overflow: 'hidden',
    },
    formPicker: {
      backgroundColor: theme.surface,
      color: theme.text,
    },
  });
