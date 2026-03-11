/**
 * ShareTargetPickerModal
 *
 * Lets principals choose WHO to share a daily routine with:
 * - Specific teacher(s) from the school
 * - Specific class(es)
 * - By age group
 *
 * Returns selected teacher user IDs to the caller for the share API.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { assertSupabase } from '@/lib/supabase';
import type { ThemeColors } from '@/contexts/ThemeContext';

type ShareMode = 'all' | 'teachers' | 'classes' | 'age_group';

interface TeacherOption {
  userId: string;
  name: string;
  email: string;
}

interface ClassOption {
  id: string;
  name: string;
  gradeLevel: string | null;
  teacherId: string | null;
  teacherName: string | null;
}

interface ShareTargetPickerModalProps {
  visible: boolean;
  organizationId: string;
  classOptions: Array<{ id: string; name: string; gradeLevel: string | null; teacherId: string | null }>;
  ageGroup: string;
  theme: ThemeColors;
  onClose: () => void;
  onShare: (teacherUserIds: string[] | undefined) => void;
}

const AGE_GROUPS = ['0-2', '2-3', '3-4', '3-6', '4-6', '6-9', '9-12'];

export function ShareTargetPickerModal({
  visible,
  organizationId,
  classOptions,
  ageGroup: currentAgeGroup,
  theme,
  onClose,
  onShare,
}: ShareTargetPickerModalProps) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [mode, setMode] = useState<ShareMode>('all');
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<Set<string>>(new Set());
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set());
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(currentAgeGroup);

  // Reset on open
  useEffect(() => {
    if (visible) {
      setMode('all');
      setSelectedTeacherIds(new Set());
      setSelectedClassIds(new Set());
      setSelectedAgeGroup(currentAgeGroup);
    }
  }, [visible, currentAgeGroup]);

  // Fetch teachers when mode is 'teachers'
  useEffect(() => {
    if (!visible || mode !== 'teachers' || !organizationId) return;
    if (teachers.length > 0) return;

    let active = true;
    const load = async () => {
      setLoadingTeachers(true);
      try {
        const supabase = assertSupabase();
        const { data } = await supabase
          .from('teachers')
          .select('user_id, auth_user_id, full_name, email')
          .eq('preschool_id', organizationId)
          .eq('is_active', true);

        if (!active) return;
        const list = (data || [])
          .map((row: Record<string, unknown>) => ({
            userId: String(row.user_id || row.auth_user_id || ''),
            name: String(row.full_name || row.email || 'Unknown'),
            email: String(row.email || ''),
          }))
          .filter((t) => t.userId);
        setTeachers(list);
      } finally {
        if (active) setLoadingTeachers(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [visible, mode, organizationId, teachers.length]);

  const toggleTeacher = useCallback((id: string) => {
    setSelectedTeacherIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleClass = useCallback((id: string) => {
    setSelectedClassIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleShare = useCallback(() => {
    if (mode === 'all') {
      onShare(undefined); // all teachers
      return;
    }

    if (mode === 'teachers') {
      if (selectedTeacherIds.size === 0) return;
      onShare(Array.from(selectedTeacherIds));
      return;
    }

    if (mode === 'classes') {
      // Resolve teacher IDs from selected classes
      const teacherIds = classOptions
        .filter((c) => selectedClassIds.has(c.id) && c.teacherId)
        .map((c) => c.teacherId!);
      if (teacherIds.length === 0) {
        onShare(undefined); // fallback to all if no teachers assigned
      } else {
        onShare(teacherIds);
      }
      return;
    }

    if (mode === 'age_group') {
      // Share with all teachers (age group filtering happens via the program's age_group column)
      onShare(undefined);
      return;
    }
  }, [mode, selectedTeacherIds, selectedClassIds, classOptions, onShare]);

  const canShare =
    mode === 'all' ||
    mode === 'age_group' ||
    (mode === 'teachers' && selectedTeacherIds.size > 0) ||
    (mode === 'classes' && selectedClassIds.size > 0);

  const shareLabel = useMemo(() => {
    if (mode === 'all') return 'Share with All Teachers';
    if (mode === 'age_group') return `Share (${selectedAgeGroup} age group)`;
    if (mode === 'teachers') return `Share with ${selectedTeacherIds.size} Teacher${selectedTeacherIds.size !== 1 ? 's' : ''}`;
    if (mode === 'classes') return `Share with ${selectedClassIds.size} Class${selectedClassIds.size !== 1 ? 'es' : ''}`;
    return 'Share';
  }, [mode, selectedTeacherIds.size, selectedClassIds.size, selectedAgeGroup]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Ionicons name="share-outline" size={22} color={theme.primary} />
            <Text style={styles.headerTitle}>Share Routine</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Mode Selector */}
          <View style={styles.modeRow}>
            {([
              { key: 'all' as ShareMode, label: 'All Teachers', icon: 'people' },
              { key: 'teachers' as ShareMode, label: 'Specific Teachers', icon: 'person' },
              { key: 'classes' as ShareMode, label: 'By Class', icon: 'school' },
              { key: 'age_group' as ShareMode, label: 'By Age Group', icon: 'body' },
            ]).map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.modeChip, mode === opt.key && styles.modeChipActive]}
                onPress={() => setMode(opt.key)}
              >
                <Ionicons
                  name={opt.icon as any}
                  size={14}
                  color={mode === opt.key ? '#fff' : theme.textSecondary}
                />
                <Text style={[styles.modeChipText, mode === opt.key && styles.modeChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {/* All Teachers */}
            {mode === 'all' && (
              <View style={styles.infoBox}>
                <Ionicons name="megaphone-outline" size={20} color={theme.primary} />
                <Text style={styles.infoText}>
                  This will share the routine with every teacher at your school. They'll receive a push notification and see it on their Daily Routine screen.
                </Text>
              </View>
            )}

            {/* Specific Teachers */}
            {mode === 'teachers' && (
              <>
                {loadingTeachers ? (
                  <ActivityIndicator color={theme.primary} style={{ marginTop: 20 }} />
                ) : teachers.length === 0 ? (
                  <Text style={styles.emptyText}>No teachers found at this school.</Text>
                ) : (
                  teachers.map((t) => {
                    const selected = selectedTeacherIds.has(t.userId);
                    return (
                      <TouchableOpacity
                        key={t.userId}
                        style={[styles.listItem, selected && styles.listItemSelected]}
                        onPress={() => toggleTeacher(t.userId)}
                      >
                        <Ionicons
                          name={selected ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={selected ? theme.primary : theme.textSecondary}
                        />
                        <View style={styles.listItemInfo}>
                          <Text style={styles.listItemName}>{t.name}</Text>
                          <Text style={styles.listItemSub}>{t.email}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </>
            )}

            {/* By Class */}
            {mode === 'classes' && (
              <>
                {classOptions.length === 0 ? (
                  <Text style={styles.emptyText}>No classes found. Create classes first.</Text>
                ) : (
                  classOptions.map((cls) => {
                    const selected = selectedClassIds.has(cls.id);
                    const label = cls.gradeLevel && cls.name
                      ? `${cls.gradeLevel} · ${cls.name}`
                      : cls.gradeLevel || cls.name || 'Unnamed class';
                    return (
                      <TouchableOpacity
                        key={cls.id}
                        style={[styles.listItem, selected && styles.listItemSelected]}
                        onPress={() => toggleClass(cls.id)}
                      >
                        <Ionicons
                          name={selected ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={selected ? theme.primary : theme.textSecondary}
                        />
                        <View style={styles.listItemInfo}>
                          <Text style={styles.listItemName}>{label}</Text>
                          <Text style={styles.listItemSub}>
                            {cls.teacherId ? 'Teacher assigned' : 'No teacher assigned'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </>
            )}

            {/* By Age Group */}
            {mode === 'age_group' && (
              <>
                <Text style={styles.sectionLabel}>Select Age Group</Text>
                <View style={styles.ageRow}>
                  {AGE_GROUPS.map((ag) => (
                    <TouchableOpacity
                      key={ag}
                      style={[styles.ageChip, selectedAgeGroup === ag && styles.ageChipActive]}
                      onPress={() => setSelectedAgeGroup(ag)}
                    >
                      <Text style={[styles.ageChipText, selectedAgeGroup === ag && styles.ageChipTextActive]}>
                        {ag}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.infoBox}>
                  <Ionicons name="information-circle-outline" size={18} color={theme.primary} />
                  <Text style={styles.infoText}>
                    Sharing by age group will send this routine to all teachers and make it visible for the selected age group.
                  </Text>
                </View>
              </>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.shareButton, !canShare && styles.shareButtonDisabled]}
              onPress={handleShare}
              disabled={!canShare}
            >
              <Ionicons name="paper-plane" size={16} color="#fff" />
              <Text style={styles.shareButtonText}>{shareLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    modal: {
      backgroundColor: theme.surface || '#1a1a2e',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '80%',
      borderWidth: 1,
      borderColor: theme.border || '#2a2a4a',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border || '#2a2a4a',
    },
    headerTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
      color: theme.text || '#fff',
    },
    closeBtn: {},
    modeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      padding: 16,
      paddingBottom: 8,
    },
    modeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.border || '#2a2a4a',
      backgroundColor: theme.background || '#0b1220',
    },
    modeChipActive: {
      backgroundColor: theme.primary || '#6d28d9',
      borderColor: theme.primary || '#6d28d9',
    },
    modeChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.textSecondary || '#94a3b8',
    },
    modeChipTextActive: {
      color: '#fff',
    },
    body: {
      maxHeight: 340,
    },
    bodyContent: {
      padding: 16,
      paddingTop: 8,
    },
    infoBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      padding: 14,
      borderRadius: 12,
      backgroundColor: (theme.primary || '#6d28d9') + '12',
      borderWidth: 1,
      borderColor: (theme.primary || '#6d28d9') + '30',
    },
    infoText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 19,
      color: theme.textSecondary || '#94a3b8',
    },
    emptyText: {
      fontSize: 13,
      color: theme.textSecondary || '#94a3b8',
      textAlign: 'center',
      marginTop: 20,
    },
    listItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 10,
      marginBottom: 4,
    },
    listItemSelected: {
      backgroundColor: (theme.primary || '#6d28d9') + '15',
    },
    listItemInfo: {
      flex: 1,
    },
    listItemName: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text || '#fff',
    },
    listItemSub: {
      fontSize: 12,
      color: theme.textSecondary || '#94a3b8',
      marginTop: 1,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.textSecondary || '#94a3b8',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 10,
    },
    ageRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 16,
    },
    ageChip: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.border || '#2a2a4a',
      backgroundColor: theme.background || '#0b1220',
    },
    ageChipActive: {
      backgroundColor: theme.primary || '#6d28d9',
      borderColor: theme.primary || '#6d28d9',
    },
    ageChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textSecondary || '#94a3b8',
    },
    ageChipTextActive: {
      color: '#fff',
    },
    footer: {
      flexDirection: 'row',
      gap: 10,
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: theme.border || '#2a2a4a',
    },
    cancelButton: {
      flex: 1,
      height: 46,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.border || '#2a2a4a',
    },
    cancelText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.textSecondary || '#94a3b8',
    },
    shareButton: {
      flex: 2,
      height: 46,
      borderRadius: 12,
      backgroundColor: '#0284c7',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    shareButtonDisabled: {
      opacity: 0.5,
    },
    shareButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#fff',
    },
  });
