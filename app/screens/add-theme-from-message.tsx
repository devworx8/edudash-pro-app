/**
 * Add theme from message — Principal creates a curriculum theme from a teacher's message.
 * Pre-fills title and objectives; principal sets week and can publish.
 * After save, can open Daily Program Planner for that week.
 */

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { extractOrganizationId } from '@/lib/tenant/compat';
import { assertSupabase } from '@/lib/supabase';
import { parseThemeFromMessage } from '@/lib/messaging/parseThemeFromMessage';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';

function startOfWeekMonday(value: Date | string): string {
  const date = typeof value === 'string'
    ? new Date(`${String(value).slice(0, 10)}T12:00:00.000Z`)
    : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const day = safeDate.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  safeDate.setUTCDate(safeDate.getUTCDate() + offset);
  return safeDate.toISOString().slice(0, 10);
}

function fridayOfWeek(monday: string): string {
  const d = new Date(`${monday}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 4);
  return d.toISOString().slice(0, 10);
}

export default function AddThemeFromMessageScreen() {
  const params = useLocalSearchParams<{
    message?: string;
    title?: string;
    objectives?: string;
  }>();
  const { theme } = useTheme();
  const { profile, user } = useAuth();
  const { showAlert, alertProps } = useAlertModal();
  const organizationId = extractOrganizationId(profile);
  const createdBy = (profile as { id?: string })?.id || user?.id;

  const parsed = useMemo(() => {
    const msg = params.message ?? '';
    const title = params.title ?? '';
    const objectivesStr = params.objectives ?? '';
    const parsedFromMessage = msg ? parseThemeFromMessage(msg) : { title: null, objectives: [] as string[] };
    const fallbackObjectives = objectivesStr
      ? (() => {
          try {
            const arr = JSON.parse(objectivesStr) as unknown;
            return Array.isArray(arr) ? arr.map(String).filter(Boolean) : objectivesStr.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean);
          } catch {
            return objectivesStr.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean);
          }
        })()
      : [];

    return {
      title: parsedFromMessage.title || title || null,
      objectives: parsedFromMessage.objectives.length > 0 ? parsedFromMessage.objectives : fallbackObjectives,
    };
  }, [params.message, params.title, params.objectives]);

  const [title, setTitle] = useState(parsed.title ?? '');
  const [objectivesText, setObjectivesText] = useState(
    Array.isArray(parsed.objectives) && parsed.objectives.length > 0
      ? parsed.objectives.join('\n')
      : ''
  );
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [publishNow, setPublishNow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedThemeId, setSavedThemeId] = useState<string | null>(null);

  useEffect(() => {
    if (parsed.title && !title) setTitle(parsed.title);
    if (parsed.objectives?.length && !objectivesText) setObjectivesText(parsed.objectives.join('\n'));
  }, [parsed.title, parsed.objectives, title, objectivesText]);

  const objectivesList = useMemo(
    () =>
      objectivesText
        .split(/\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    [objectivesText]
  );

  const save = useCallback(async () => {
    if (!organizationId || !createdBy) {
      showAlert({ title: 'Error', message: 'Missing school or user.', type: 'warning' });
      return;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      showAlert({ title: 'Validation', message: 'Theme title is required.', type: 'warning' });
      return;
    }
    const monday = startOfWeekMonday(weekStart);
    const friday = fridayOfWeek(monday);

    setSaving(true);
    try {
      const supabase = assertSupabase();
      const { data, error } = await supabase
        .from('curriculum_themes')
        .insert({
          preschool_id: organizationId,
          created_by: createdBy,
          title: trimmedTitle,
          description: `Weekly theme from teacher message. Week ${monday}–${friday}.`,
          learning_objectives: objectivesList.length > 0 ? objectivesList : [trimmedTitle],
          start_date: monday,
          end_date: friday,
          is_published: publishNow,
        })
        .select('id')
        .single();

      if (error) throw error;
      setSavedThemeId(data?.id ?? null);
      showAlert({
        title: 'Theme saved',
        message: publishNow
          ? 'Theme is published. Teachers can use it for lesson generation for this week.'
          : 'Theme saved as draft. Publish it from Curriculum Themes for teachers to use it.',
        type: 'info',
        buttons: [
          { text: 'OK', style: 'cancel' },
          {
            text: 'Open Daily Program',
            onPress: () => {
              router.replace('/screens/principal-daily-program-planner' as any);
            },
          },
        ],
      });
    } catch (err: any) {
      showAlert({
        title: 'Save failed',
        message: err?.message ?? 'Could not save theme.',
        type: 'warning',
      });
    } finally {
      setSaving(false);
    }
  }, [organizationId, createdBy, title, objectivesList, weekStart, publishNow, showAlert]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        safeArea: { flex: 1, backgroundColor: theme.background },
        scroll: { flex: 1, backgroundColor: theme.background },
        scrollContent: { flexGrow: 1 },
        inner: { padding: 16, paddingBottom: 32 },
        label: { fontSize: 14, fontWeight: '600', color: theme.textSecondary, marginBottom: 6 },
        input: {
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: 10,
          padding: 12,
          fontSize: 16,
          color: theme.text,
          backgroundColor: theme.cardBackground,
          minHeight: 48,
        },
        textArea: { minHeight: 120, textAlignVertical: 'top' },
        row: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
        checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, marginRight: 10, alignItems: 'center', justifyContent: 'center' },
        button: {
          backgroundColor: theme.primary,
          paddingVertical: 14,
          borderRadius: 12,
          alignItems: 'center',
          marginTop: 24,
        },
        buttonText: { color: theme.onPrimary ?? '#fff', fontSize: 16, fontWeight: '600' },
        hint: { fontSize: 12, color: theme.textTertiary ?? theme.textSecondary, marginTop: 6 },
      }),
    [theme]
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Add to weekly program',
          headerBackTitle: 'Back',
        }}
      />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.inner}>
            <Text style={styles.label}>Theme title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Oral orientation"
              placeholderTextColor={theme.textTertiary}
            />
            <Text style={[styles.label, { marginTop: 16 }]}>Learning objectives (one per line)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={objectivesText}
              onChangeText={setObjectivesText}
              placeholder="e.g. please\ncan I have\nThank you\nmy Name and surname\nAge and gender"
              placeholderTextColor={theme.textTertiary}
              multiline
            />
            <Text style={[styles.label, { marginTop: 16 }]}>Week start (Monday)</Text>
            <TextInput
              style={styles.input}
              value={weekStart}
              onChangeText={setWeekStart}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.textTertiary}
            />
            <Text style={styles.hint}>Use the Monday of the week this theme applies to.</Text>
            <TouchableOpacity
              style={styles.row}
              onPress={() => setPublishNow(!publishNow)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, { borderColor: theme.primary, backgroundColor: publishNow ? theme.primary : 'transparent' }]}>
                {publishNow && <Ionicons name="checkmark" size={16} color="#fff" />}
              </View>
              <Text style={{ color: theme.text, fontSize: 15 }}>Publish so teachers can use it for lesson generation</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save theme</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
      <AlertModal {...alertProps} />
    </>
  );
}
