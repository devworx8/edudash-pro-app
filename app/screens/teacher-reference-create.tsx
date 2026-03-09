import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Switch } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type ThemeColors } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { TeacherReputationService } from '@/lib/services/TeacherReputationService';
import { CreateTeacherReferenceSchema } from '@/types/teacher-reputation';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export default function TeacherReferenceCreateScreen() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const { teacherUserId, teacherName } = useLocalSearchParams<{ teacherUserId?: string; teacherName?: string }>();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { showAlert, alertProps } = useAlertModal();

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [title, setTitle] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!teacherUserId || !profile?.id) return;

    const orgId = profile.organization_id || (profile as { preschool_id?: string }).preschool_id;
    if (!orgId) {
      showAlert({ title: 'Missing school', message: 'No school context found for your account.', type: 'error' });
      return;
    }

    try {
      setSaving(true);
      const candidateProfile = await TeacherReputationService.ensureMarketProfile(teacherUserId);

      const payload = {
        candidate_profile_id: candidateProfile.id,
        teacher_user_id: teacherUserId,
        organization_id: orgId,
        principal_id: profile.id,
        rating_overall: rating,
        ratings: {
          communication: rating,
          classroom: rating,
          planning: rating,
          professionalism: rating,
          parent_engagement: rating,
          reliability: rating,
        },
        title: title.trim() || undefined,
        comment: comment.trim() || undefined,
        is_anonymous: isAnonymous,
      };

      const validated = CreateTeacherReferenceSchema.safeParse(payload);
      if (!validated.success) {
        const message = validated.error.issues[0]?.message || 'Please check the reference details.';
        showAlert({ title: 'Invalid reference', message: message, type: 'warning' });
        return;
      }

      await TeacherReputationService.createReference(validated.data);

      showAlert({ title: 'Submitted', message: 'Your reference has been saved.', type: 'success' });
      router.back();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to submit reference.';
      showAlert({ title: 'Error', message, type: 'error' });
    } finally {
      setSaving(false);
    }
  }, [teacherUserId, profile, rating, title, comment, isAnonymous]);

  const renderStars = () => (
    <View style={styles.starRow}>
      {Array.from({ length: 5 }).map((_, idx) => (
        <TouchableOpacity key={idx} onPress={() => setRating(idx + 1)}>
          <Ionicons
            name={idx + 1 <= rating ? 'star' : 'star-outline'}
            size={24}
            color={idx + 1 <= rating ? '#F59E0B' : '#D1D5DB'}
          />
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Leave Reference</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.teacherName}>{teacherName || 'Teacher'}</Text>
        <Text style={styles.label}>Overall Rating</Text>
        {renderStars()}

        <Text style={styles.label}>Title (optional)</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Outstanding classroom leadership"
          placeholderTextColor={theme.textSecondary}
        />

        <Text style={styles.label}>Comment (optional)</Text>
        <TextInput
          style={styles.textArea}
          value={comment}
          onChangeText={setComment}
          placeholder="Share your experience working with this teacher"
          placeholderTextColor={theme.textSecondary}
          multiline
        />

        <View style={styles.switchRow}>
          <View>
            <Text style={styles.label}>Anonymous Reference</Text>
            <Text style={styles.hint}>Other principals will only see your school name.</Text>
          </View>
          <Switch value={isAnonymous} onValueChange={setIsAnonymous} />
        </View>

        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={saving}>
          {saving ? <EduDashSpinner color={theme.onPrimary} /> : <Text style={styles.submitText}>Submit Reference</Text>}
        </TouchableOpacity>
      </View>
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const createStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    backButton: {
      padding: 8,
      borderRadius: 999,
      backgroundColor: theme.surface,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.text,
    },
    content: {
      paddingHorizontal: 16,
      gap: 12,
    },
    teacherName: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 8,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.text,
      marginTop: 6,
    },
    hint: {
      fontSize: 11,
      color: theme.textSecondary,
    },
    starRow: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 8,
    },
    input: {
      backgroundColor: theme.surface,
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.border,
      color: theme.text,
    },
    textArea: {
      backgroundColor: theme.surface,
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.border,
      color: theme.text,
      minHeight: 90,
      textAlignVertical: 'top',
    },
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      gap: 12,
    },
    submitButton: {
      backgroundColor: theme.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 12,
    },
    submitText: {
      color: theme.onPrimary,
      fontWeight: '700',
      fontSize: 14,
    },
  });
