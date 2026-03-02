/**
 * Student Profile Card Component
 * Displays student avatar, name, age, and status
 */

import React, { useState } from 'react';
import { View, Text, Image, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { StudentDetail, formatAge } from './types';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { ModalLayer } from '@/components/ui/ModalLayer';

interface ProfileCardProps {
  student: StudentDetail;
  theme: ThemeColors;
  editMode: boolean;
  canExpandPhoto?: boolean;
  editedStudent: Partial<StudentDetail>;
  onEditChange: (updates: Partial<StudentDetail>) => void;
}

export const ProfileCard: React.FC<ProfileCardProps> = ({
  student,
  theme,
  editMode,
  canExpandPhoto = false,
  editedStudent,
  onEditChange,
}) => {
  const styles = createStyles(theme);
  const [photoPreviewVisible, setPhotoPreviewVisible] = useState(false);
  const hasProfilePhoto = Boolean(student.profile_photo);
  const canOpenPreview = hasProfilePhoto && canExpandPhoto;

  return (
    <View style={styles.profileCard}>
      <View style={styles.profileHeader}>
        <View style={styles.avatarContainer}>
          {hasProfilePhoto ? (
            <TouchableOpacity
              activeOpacity={canOpenPreview ? 0.85 : 1}
              disabled={!canOpenPreview}
              onPress={() => setPhotoPreviewVisible(true)}
              accessibilityRole={canOpenPreview ? 'button' : undefined}
              accessibilityLabel={canOpenPreview ? 'Open student profile photo' : undefined}
            >
              <Image source={{ uri: student.profile_photo }} style={styles.avatar} />
            </TouchableOpacity>
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {student.first_name[0]}{student.last_name[0]}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.profileInfo}>
          {editMode ? (
            <View style={{ gap: 8 }}>
              <TextInput
                style={styles.input}
                value={editedStudent.first_name}
                onChangeText={(text) => onEditChange({ ...editedStudent, first_name: text })}
                placeholder="First Name"
                placeholderTextColor={theme.textSecondary}
              />
              <TextInput
                style={styles.input}
                value={editedStudent.last_name}
                onChangeText={(text) => onEditChange({ ...editedStudent, last_name: text })}
                placeholder="Last Name"
                placeholderTextColor={theme.textSecondary}
              />
            </View>
          ) : (
            <>
              <Text style={styles.studentName}>
                {student.first_name} {student.last_name}
              </Text>
              <Text style={styles.studentAge}>
                {formatAge(student.age_months, student.age_years)}
              </Text>
              {student.age_group_name && (
                <Text style={styles.ageGroup}>{student.age_group_name}</Text>
              )}
            </>
          )}
        </View>
        <View style={styles.statusBadge}>
          <Text style={[styles.statusText, { color: student.status === 'active' ? '#10B981' : '#EF4444' }]}>
            {student.status.toUpperCase()}
          </Text>
        </View>
      </View>

      {hasProfilePhoto && canExpandPhoto && (
        <ModalLayer
          visible={photoPreviewVisible}
          animationType="fade"
          onRequestClose={() => setPhotoPreviewVisible(false)}
        >
          <View style={styles.photoModalBackdrop}>
            <TouchableOpacity
              style={styles.photoModalDismissLayer}
              activeOpacity={1}
              onPress={() => setPhotoPreviewVisible(false)}
              accessibilityLabel="Close profile photo preview"
            />
            <View style={styles.photoModalCard}>
              <Image source={{ uri: student.profile_photo }} style={styles.photoModalImage} resizeMode="contain" />
              <TouchableOpacity style={styles.photoModalCloseButton} onPress={() => setPhotoPreviewVisible(false)}>
                <Text style={styles.photoModalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ModalLayer>
      )}
    </View>
  );
};

const createStyles = (theme: ThemeColors) => StyleSheet.create({
  profileCard: {
    margin: 16,
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 20,
    shadowColor: theme.shadow || '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    marginRight: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  profileInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 4,
  },
  studentAge: {
    fontSize: 16,
    color: theme.textSecondary,
    marginBottom: 4,
  },
  ageGroup: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: theme.text,
  },
  photoModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  photoModalDismissLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  photoModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: theme.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  photoModalImage: {
    width: '100%',
    height: 360,
    borderRadius: 10,
    backgroundColor: '#000',
  },
  photoModalCloseButton: {
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: theme.primary,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoModalCloseText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
