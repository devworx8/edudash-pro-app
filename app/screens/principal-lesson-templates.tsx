import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { extractOrganizationId } from '@/lib/tenant/compat';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import type { LessonTemplate } from '@/types/ecd-planning';

type TemplateForm = {
  name: string;
  description: string;
  defaultDurationMinutes: string;
  defaultAgeGroup: string;
  sections: string;
  isDefault: boolean;
};

const EMPTY_FORM: TemplateForm = {
  name: '',
  description: '',
  defaultDurationMinutes: '30',
  defaultAgeGroup: '3-6',
  sections: 'Learning Objectives, Materials Needed, Introduction, Main Activity, Conclusion',
  isDefault: false,
};

const parseSections = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((name) => ({ name, required: true }));

export default function PrincipalLessonTemplatesScreen() {
  const { theme } = useTheme();
  const { profile, user } = useAuth();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { showAlert, alertProps } = useAlertModal();
  const organizationId = extractOrganizationId(profile);
  const createdBy = (profile as any)?.id || user?.id;

  const [templates, setTemplates] = useState<LessonTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<LessonTemplate | null>(null);
  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM);

  const fetchTemplates = useCallback(async () => {
    if (!organizationId) {
      setTemplates([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const supabase = assertSupabase();
      const { data, error } = await supabase
        .from('lesson_templates')
        .select('*')
        .eq('preschool_id', organizationId)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setTemplates((data || []) as LessonTemplate[]);
    } catch (error: any) {
      showAlert({ title: 'Error', message: error?.message || 'Failed to load lesson templates', type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const openCreateModal = () => {
    setEditingTemplate(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  };

  const openEditModal = (template: LessonTemplate) => {
    setEditingTemplate(template);
    setForm({
      name: template.name || '',
      description: template.description || '',
      defaultDurationMinutes: String(template.default_duration_minutes || 30),
      defaultAgeGroup: template.default_age_group || '3-6',
      sections: template.template_structure?.sections?.map((s) => s.name).join(', ') || '',
      isDefault: Boolean(template.is_default),
    });
    setModalVisible(true);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchTemplates();
  };

  const saveTemplate = async () => {
    if (!organizationId || !createdBy) {
      showAlert({ title: 'Missing profile', message: 'Unable to identify your school profile.', type: 'error' });
      return;
    }
    if (!form.name.trim()) {
      showAlert({ title: 'Validation', message: 'Template name is required.', type: 'warning' });
      return;
    }

    setSaving(true);
    try {
      const supabase = assertSupabase();
      const payload = {
        preschool_id: organizationId,
        created_by: createdBy,
        name: form.name.trim(),
        description: form.description.trim() || null,
        default_duration_minutes: Math.max(5, Number(form.defaultDurationMinutes) || 30),
        default_age_group: form.defaultAgeGroup.trim() || '3-6',
        template_structure: {
          sections: parseSections(form.sections),
        },
        is_default: form.isDefault,
      };

      if (form.isDefault) {
        await supabase
          .from('lesson_templates')
          .update({ is_default: false })
          .eq('preschool_id', organizationId)
          .eq('is_active', true);
      }

      if (editingTemplate) {
        const { error } = await supabase
          .from('lesson_templates')
          .update(payload)
          .eq('id', editingTemplate.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('lesson_templates').insert(payload);
        if (error) throw error;
      }

      setModalVisible(false);
      setEditingTemplate(null);
      setForm(EMPTY_FORM);
      await fetchTemplates();
    } catch (error: any) {
      showAlert({ title: 'Save failed', message: error?.message || 'Unable to save template.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const setDefaultTemplate = async (template: LessonTemplate) => {
    try {
      const supabase = assertSupabase();
      await supabase
        .from('lesson_templates')
        .update({ is_default: false })
        .eq('preschool_id', organizationId)
        .eq('is_active', true);
      const { error } = await supabase
        .from('lesson_templates')
        .update({ is_default: true })
        .eq('id', template.id);
      if (error) throw error;
      await fetchTemplates();
    } catch (error: any) {
      showAlert({ title: 'Update failed', message: error?.message || 'Unable to set default template.', type: 'error' });
    }
  };

  const archiveTemplate = async (template: LessonTemplate) => {
    showAlert({
      title: 'Archive template',
      message: `Archive "${template.name}"?`,
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              const supabase = assertSupabase();
              const { error } = await supabase
                .from('lesson_templates')
                .update({ is_active: false, is_default: false })
                .eq('id', template.id);
              if (error) throw error;
              await fetchTemplates();
            } catch (error: any) {
              showAlert({ title: 'Archive failed', message: error?.message || 'Unable to archive template.', type: 'error' });
            }
          },
        },
      ],
    });
  };

  const renderItem = ({ item }: { item: LessonTemplate }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        {item.is_default ? (
          <View style={styles.defaultBadge}>
            <Text style={styles.defaultBadgeText}>Default</Text>
          </View>
        ) : null}
      </View>

      {!!item.description && <Text style={styles.cardDescription}>{item.description}</Text>}
      <Text style={styles.meta}>
        {item.default_duration_minutes} min • Ages {item.default_age_group}
      </Text>
      <Text style={styles.meta}>Used {item.usage_count || 0} times</Text>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => openEditModal(item)}>
          <Ionicons name="create-outline" size={16} color={theme.primary} />
          <Text style={styles.actionText}>Edit</Text>
        </TouchableOpacity>
        {!item.is_default ? (
          <TouchableOpacity style={styles.actionBtn} onPress={() => setDefaultTemplate(item)}>
            <Ionicons name="star-outline" size={16} color={theme.primary} />
            <Text style={styles.actionText}>Set default</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.actionBtn} onPress={() => archiveTemplate(item)}>
          <Ionicons name="archive-outline" size={16} color="#ef4444" />
          <Text style={[styles.actionText, { color: '#ef4444' }]}>Archive</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <DesktopLayout role="principal" title="Lesson Templates" showBackButton>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.subtitle}>
            Create reusable planning templates for teachers across your school.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={openCreateModal}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>New Template</Text>
          </TouchableOpacity>
        </View>

        <FlashList
          data={templates}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          estimatedItemSize={100}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={48} color={theme.textSecondary} />
                <Text style={styles.emptyTitle}>No templates yet</Text>
                <Text style={styles.emptySubtitle}>Create your first lesson template.</Text>
              </View>
            ) : null
          }
        />

        <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>{editingTemplate ? 'Edit Template' : 'Create Template'}</Text>

              <TextInput
                style={styles.input}
                placeholder="Template name"
                placeholderTextColor={theme.textSecondary}
                value={form.name}
                onChangeText={(name) => setForm((prev) => ({ ...prev, name }))}
              />
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Description"
                placeholderTextColor={theme.textSecondary}
                value={form.description}
                onChangeText={(description) => setForm((prev) => ({ ...prev, description }))}
                multiline
              />
              <View style={styles.inlineRow}>
                <TextInput
                  style={[styles.input, styles.inlineInput]}
                  placeholder="Duration"
                  placeholderTextColor={theme.textSecondary}
                  value={form.defaultDurationMinutes}
                  keyboardType="number-pad"
                  onChangeText={(defaultDurationMinutes) =>
                    setForm((prev) => ({ ...prev, defaultDurationMinutes }))
                  }
                />
                <TextInput
                  style={[styles.input, styles.inlineInput]}
                  placeholder="Age group"
                  placeholderTextColor={theme.textSecondary}
                  value={form.defaultAgeGroup}
                  onChangeText={(defaultAgeGroup) => setForm((prev) => ({ ...prev, defaultAgeGroup }))}
                />
              </View>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Sections (comma-separated)"
                placeholderTextColor={theme.textSecondary}
                value={form.sections}
                onChangeText={(sections) => setForm((prev) => ({ ...prev, sections }))}
                multiline
              />

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Set as default template</Text>
                <Switch
                  value={form.isDefault}
                  onValueChange={(isDefault) => setForm((prev) => ({ ...prev, isDefault }))}
                  thumbColor={form.isDefault ? '#fff' : '#ddd'}
                  trackColor={{ true: theme.primary, false: theme.border }}
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnSecondary]}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtn} onPress={saveTemplate} disabled={saving}>
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
      gap: 6,
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
    defaultBadge: {
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: '#8B5CF633',
    },
    defaultBadgeText: {
      color: theme.text,
      fontSize: 11,
      fontWeight: '700',
    },
    actionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 6,
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
    inlineRow: {
      flexDirection: 'row',
      gap: 10,
    },
    inlineInput: {
      flex: 1,
    },
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    switchLabel: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '600',
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
