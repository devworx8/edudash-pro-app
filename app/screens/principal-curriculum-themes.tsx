import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { extractOrganizationId } from '@/lib/tenant/compat';
import type { CurriculumTheme } from '@/types/ecd-planning';

type ThemeForm = {
  title: string;
  description: string;
  ageGroups: string;
  developmentalDomains: string;
  objectives: string;
  materials: string;
};

const EMPTY_FORM: ThemeForm = {
  title: '',
  description: '',
  ageGroups: '3-6',
  developmentalDomains: 'cognitive, physical, social, emotional, language',
  objectives: '',
  materials: '',
};

const parseCsv = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export default function PrincipalCurriculumThemesScreen() {
  const { theme } = useTheme();
  const { profile, user } = useAuth();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { showAlert, alertProps } = useAlertModal();
  const organizationId = extractOrganizationId(profile);
  const createdBy = (profile as any)?.id || user?.id;

  const [themes, setThemes] = useState<CurriculumTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTheme, setEditingTheme] = useState<CurriculumTheme | null>(null);
  const [form, setForm] = useState<ThemeForm>(EMPTY_FORM);

  const fetchThemes = useCallback(async () => {
    if (!organizationId) {
      setThemes([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const supabase = assertSupabase();
      const { data, error } = await supabase
        .from('curriculum_themes')
        .select('*')
        .eq('preschool_id', organizationId)
        .order('updated_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setThemes((data || []) as CurriculumTheme[]);
    } catch (error: any) {
      showAlert({ title: 'Error', message: error?.message || 'Failed to load curriculum themes', type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    fetchThemes();
  }, [fetchThemes]);

  const openCreateModal = () => {
    setEditingTheme(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  };

  const openEditModal = (themeItem: CurriculumTheme) => {
    setEditingTheme(themeItem);
    setForm({
      title: themeItem.title || '',
      description: themeItem.description || '',
      ageGroups: Array.isArray(themeItem.age_groups) ? themeItem.age_groups.join(', ') : '3-6',
      developmentalDomains: Array.isArray(themeItem.developmental_domains)
        ? themeItem.developmental_domains.join(', ')
        : '',
      objectives: Array.isArray(themeItem.learning_objectives)
        ? themeItem.learning_objectives.join(', ')
        : '',
      materials: Array.isArray(themeItem.materials_needed) ? themeItem.materials_needed.join(', ') : '',
    });
    setModalVisible(true);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchThemes();
  };

  const saveTheme = async () => {
    if (!organizationId || !createdBy) {
      showAlert({ title: 'Missing profile', message: 'Unable to identify your school profile.', type: 'error' });
      return;
    }
    if (!form.title.trim()) {
      showAlert({ title: 'Validation', message: 'Theme title is required.', type: 'warning' });
      return;
    }

    setSaving(true);
    try {
      const supabase = assertSupabase();
      const payload = {
        preschool_id: organizationId,
        created_by: createdBy,
        title: form.title.trim(),
        description: form.description.trim() || null,
        age_groups: parseCsv(form.ageGroups),
        developmental_domains: parseCsv(form.developmentalDomains),
        learning_objectives: parseCsv(form.objectives),
        materials_needed: parseCsv(form.materials),
      };

      if (editingTheme) {
        const { error } = await supabase
          .from('curriculum_themes')
          .update(payload)
          .eq('id', editingTheme.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('curriculum_themes').insert(payload);
        if (error) throw error;
      }

      setModalVisible(false);
      setEditingTheme(null);
      setForm(EMPTY_FORM);
      await fetchThemes();
    } catch (error: any) {
      showAlert({ title: 'Save failed', message: error?.message || 'Unable to save theme.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (themeItem: CurriculumTheme) => {
    try {
      const supabase = assertSupabase();
      const { error } = await supabase
        .from('curriculum_themes')
        .update({ is_published: !themeItem.is_published })
        .eq('id', themeItem.id);
      if (error) throw error;
      await fetchThemes();
    } catch (error: any) {
      showAlert({ title: 'Update failed', message: error?.message || 'Unable to update publish state.', type: 'error' });
    }
  };

  const renderItem = ({ item }: { item: CurriculumTheme }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <View style={[styles.badge, item.is_published ? styles.badgePublished : styles.badgeDraft]}>
          <Text style={styles.badgeText}>{item.is_published ? 'Published' : 'Draft'}</Text>
        </View>
      </View>
      {!!item.description && <Text style={styles.cardDescription}>{item.description}</Text>}

      {Array.isArray(item.learning_objectives) && item.learning_objectives.length > 0 ? (
        <Text style={styles.meta}>
          Objectives: {item.learning_objectives.slice(0, 3).join(', ')}
          {item.learning_objectives.length > 3 ? '…' : ''}
        </Text>
      ) : null}

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => openEditModal(item)}>
          <Ionicons name="create-outline" size={16} color={theme.primary} />
          <Text style={styles.actionText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => togglePublish(item)}>
          <Ionicons
            name={item.is_published ? 'eye-off-outline' : 'eye-outline'}
            size={16}
            color={theme.primary}
          />
          <Text style={styles.actionText}>{item.is_published ? 'Unpublish' : 'Publish'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <DesktopLayout role="principal" title="Curriculum Themes" showBackButton>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.subtitle}>
            Build reusable curriculum themes by age band and developmental domain.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={openCreateModal}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>New Theme</Text>
          </TouchableOpacity>
        </View>

        <FlashList
          data={themes}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          estimatedItemSize={120}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyState}>
                <Ionicons name="book-outline" size={48} color={theme.textSecondary} />
                <Text style={styles.emptyTitle}>No themes yet</Text>
                <Text style={styles.emptySubtitle}>Create your first curriculum theme for teachers.</Text>
              </View>
            ) : null
          }
        />

        <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>{editingTheme ? 'Edit Theme' : 'Create Theme'}</Text>

              <TextInput
                style={styles.input}
                placeholder="Theme title"
                placeholderTextColor={theme.textSecondary}
                value={form.title}
                onChangeText={(title) => setForm((prev) => ({ ...prev, title }))}
              />
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Description"
                placeholderTextColor={theme.textSecondary}
                value={form.description}
                onChangeText={(description) => setForm((prev) => ({ ...prev, description }))}
                multiline
              />
              <TextInput
                style={styles.input}
                placeholder="Age groups (comma-separated)"
                placeholderTextColor={theme.textSecondary}
                value={form.ageGroups}
                onChangeText={(ageGroups) => setForm((prev) => ({ ...prev, ageGroups }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Domains (comma-separated)"
                placeholderTextColor={theme.textSecondary}
                value={form.developmentalDomains}
                onChangeText={(developmentalDomains) =>
                  setForm((prev) => ({ ...prev, developmentalDomains }))
                }
              />
              <TextInput
                style={styles.input}
                placeholder="Objectives (comma-separated)"
                placeholderTextColor={theme.textSecondary}
                value={form.objectives}
                onChangeText={(objectives) => setForm((prev) => ({ ...prev, objectives }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Materials (comma-separated)"
                placeholderTextColor={theme.textSecondary}
                value={form.materials}
                onChangeText={(materials) => setForm((prev) => ({ ...prev, materials }))}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnSecondary]}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtn} onPress={saveTheme} disabled={saving}>
                  <Text style={styles.modalBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        <AlertModal {...alertProps} />
      </View>
    </DesktopLayout>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      padding: 16,
      gap: 12,
    },
    subtitle: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    primaryBtn: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: theme.primary,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 8,
    },
    primaryBtnText: {
      color: '#fff',
      fontWeight: '700',
    },
    listContent: {
      padding: 16,
      paddingTop: 0,
      gap: 12,
    },
    card: {
      backgroundColor: theme.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 8,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    cardTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '700',
      flex: 1,
    },
    cardDescription: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    meta: {
      color: theme.textSecondary,
      fontSize: 12,
    },
    badge: {
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    badgePublished: {
      backgroundColor: '#10B98133',
    },
    badgeDraft: {
      backgroundColor: '#F59E0B33',
    },
    badgeText: {
      color: theme.text,
      fontSize: 11,
      fontWeight: '700',
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    actionText: {
      color: theme.primary,
      fontWeight: '600',
      fontSize: 12,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      gap: 8,
    },
    emptyTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '700',
    },
    emptySubtitle: {
      color: theme.textSecondary,
      fontSize: 13,
      textAlign: 'center',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      padding: 16,
    },
    modal: {
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 16,
      gap: 10,
    },
    modalTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 6,
    },
    input: {
      backgroundColor: theme.background,
      color: theme.text,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
    },
    textArea: {
      minHeight: 70,
      textAlignVertical: 'top',
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: 6,
    },
    modalBtn: {
      backgroundColor: theme.primary,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 8,
    },
    modalBtnSecondary: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    modalBtnText: {
      color: '#fff',
      fontWeight: '700',
    },
    modalBtnSecondaryText: {
      color: theme.text,
      fontWeight: '700',
    },
  });
