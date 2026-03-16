/* eslint-disable i18next/no-literal-string */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { extractOrganizationId } from '@/lib/tenant/compat';
import { MenuParsingService } from '@/lib/services/menuParsingService';
import { SchoolMenuAnnouncementService } from '@/lib/services/schoolMenuAnnouncementService';
import { SchoolMenuService } from '@/lib/services/schoolMenuService';
import type { WeeklyMenuDay, WeeklyMenuDraft } from '@/lib/services/schoolMenu.types';
import { isWeeklyMenuBridgeEnabled, isWeeklyMenuDedicatedEnabled } from '@/lib/services/schoolMenuFeatureFlags';

function listToText(value: string[]): string {
  return value.join(', ');
}

function textToList(value: string): string[] {
  return value
    .split(/[\n,;|]/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function getCurrentMonday(): string {
  return SchoolMenuService.startOfWeekMonday(new Date());
}

interface PickedFile {
  uri: string;
  mimeType: string;
  name: string;
}

export default function PrincipalMenuScreen() {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();

  const preschoolId = extractOrganizationId(profile);
  const weeklyMenuPublishingEnabled = isWeeklyMenuBridgeEnabled() || isWeeklyMenuDedicatedEnabled();
  const [weekStartDate, setWeekStartDate] = useState(getCurrentMonday());
  const [draft, setDraft] = useState<WeeklyMenuDraft>(() => SchoolMenuService.buildEmptyWeekDraft(getCurrentMonday()));
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasExistingMenu, setHasExistingMenu] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showWeekPicker, setShowWeekPicker] = useState(false);
  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allowBlankDays, setAllowBlankDays] = useState(false);
  const [allowIncompleteMeals, setAllowIncompleteMeals] = useState(false);
  const [parseNeedsReview, setParseNeedsReview] = useState(false);
  const [confirmParseReview, setConfirmParseReview] = useState(false);

  const loadData = useCallback(async (forWeek?: string) => {
    if (!preschoolId) return;
    const week = forWeek ?? weekStartDate;
    setLoading(true);
    try {
      const [weeks, menu] = await Promise.all([
        SchoolMenuService.getAvailableWeeks(preschoolId),
        SchoolMenuService.getWeekMenuWithFallback(preschoolId, week),
      ]);
      const normalizedWeek = SchoolMenuService.startOfWeekMonday(week);
      const merged = Array.from(new Set([normalizedWeek, ...weeks])).sort((a, b) => b.localeCompare(a));
      setAvailableWeeks(merged);
      if (menu) {
        setDraft(menu);
        setWeekStartDate(menu.week_start_date);
        setHasExistingMenu(true);
      } else {
        setDraft(SchoolMenuService.buildEmptyWeekDraft(normalizedWeek));
        setWeekStartDate(normalizedWeek);
        setHasExistingMenu(false);
      }
    } catch {
      const normalized = SchoolMenuService.startOfWeekMonday(week);
      setDraft(SchoolMenuService.buildEmptyWeekDraft(normalized));
      setWeekStartDate(normalized);
      setHasExistingMenu(false);
    } finally {
      setLoading(false);
    }
  }, [preschoolId, weekStartDate]);

  useEffect(() => {
    if (!preschoolId) return;
    const id = setTimeout(() => {
      loadData(weekStartDate);
    }, 300);
    return () => clearTimeout(id);
  }, [preschoolId, weekStartDate, loadData]);

  const selectWeek = useCallback((week: string) => {
    setShowWeekPicker(false);
    const normalized = SchoolMenuService.startOfWeekMonday(week);
    setWeekStartDate(normalized);
    setLoading(true);
    SchoolMenuService.getWeekMenuWithFallback(preschoolId!, normalized)
      .then((menu) => {
        if (menu) {
          setDraft(menu);
          setHasExistingMenu(true);
        } else {
          setDraft(SchoolMenuService.buildEmptyWeekDraft(normalized));
          setHasExistingMenu(false);
        }
      })
      .catch(() => {
        setDraft(SchoolMenuService.buildEmptyWeekDraft(normalized));
        setHasExistingMenu(false);
      })
      .finally(() => setLoading(false));
  }, [preschoolId]);

  const handleDeleteMenu = useCallback(() => {
    if (!preschoolId) return;
    Alert.alert(
      'Delete menu',
      `Delete the menu for week of ${weekStartDate}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await SchoolMenuService.deleteWeekMenu(preschoolId, weekStartDate);
              setDraft(SchoolMenuService.buildEmptyWeekDraft(weekStartDate));
              setHasExistingMenu(false);
            } catch {
              Alert.alert('Error', 'Failed to delete menu. Please try again.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  }, [preschoolId, weekStartDate]);

  const styles = useMemo(() => createStyles(theme), [theme]);

  const blankDays = useMemo(() => {
    return draft.days.filter((day) => {
      const notes = (day.notes || '').trim();
      return day.breakfast.length === 0 && day.lunch.length === 0 && day.snack.length === 0 && notes.length === 0;
    });
  }, [draft.days]);

  const incompleteMealDays = useMemo(() => {
    return draft.days.filter((day) => {
      const notes = (day.notes || '').trim();
      const isCompletelyBlank = day.breakfast.length === 0 && day.lunch.length === 0 && day.snack.length === 0 && notes.length === 0;
      if (isCompletelyBlank) return false;
      return day.breakfast.length === 0 || day.lunch.length === 0 || day.snack.length === 0;
    });
  }, [draft.days]);

  const updateDay = (date: string, patch: Partial<WeeklyMenuDay>) => {
    setDraft((prev) => ({
      ...prev,
      days: prev.days.map((day) => (day.date === date ? { ...day, ...patch } : day)),
    }));
  };

  const updateWeekStart = (text: string) => {
    setWeekStartDate(text);
    setAllowBlankDays(false);
    setAllowIncompleteMeals(false);
    setParseNeedsReview(false);
    setConfirmParseReview(false);
  };

  const handlePickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setPickedFile({
      uri: asset.uri,
      mimeType: asset.mimeType || 'application/octet-stream',
      name: asset.name || `menu-${Date.now()}`,
    });
    setAllowIncompleteMeals(false);
    setParseNeedsReview(false);
    setConfirmParseReview(false);
  };

  const handleParse = async () => {
    if (!pickedFile) {
      Alert.alert('Menu file required', 'Please choose a weekly menu file first.');
      return;
    }

    setParsing(true);
    try {
      let imageDataUrl: string | undefined;
      let fileBase64: string | undefined;

      const base64 = await LegacyFileSystem.readAsStringAsync(pickedFile.uri, {
        encoding: LegacyFileSystem.EncodingType.Base64,
      });

      fileBase64 = base64;
      if (pickedFile.mimeType.startsWith('image/')) {
        imageDataUrl = `data:${pickedFile.mimeType};base64,${base64}`;
      }

      const result = await MenuParsingService.parseWeeklyMenuFromUpload({
        weekStartDate,
        mimeType: pickedFile.mimeType,
        fileName: pickedFile.name,
        imageDataUrl,
        fileBase64,
      });

      setDraft(result.draft);
      setWeekStartDate(result.draft.week_start_date);
      setAllowIncompleteMeals(false);
      setParseNeedsReview(result.lowConfidence);
      setConfirmParseReview(false);

      if (result.issues.length > 0) {
        Alert.alert('Parse completed with review needed', result.issues.join('\n'));
      } else {
        Alert.alert('Parse complete', 'Review the menu and publish when ready.');
      }
    } catch (error: unknown) {
      Alert.alert('Parse failed', error instanceof Error ? error.message : 'Could not parse menu.');
    } finally {
      setParsing(false);
    }
  };

  const handlePublish = async () => {
    if (!weeklyMenuPublishingEnabled) {
      Alert.alert('Feature disabled', 'Weekly menu publishing is currently disabled by feature flag.');
      return;
    }

    if (!preschoolId || !user?.id) {
      Alert.alert('Missing school info', 'Please sign in again and try.');
      return;
    }

    if (blankDays.length > 0 && !allowBlankDays) {
      Alert.alert('Blank days detected', 'Please confirm intentionally blank days before publishing.');
      return;
    }

    if (incompleteMealDays.length > 0 && !allowIncompleteMeals) {
      Alert.alert('Missing meal slots', 'Please confirm days with missing breakfast/lunch/snack items before publishing.');
      return;
    }

    if (parseNeedsReview && !confirmParseReview) {
      Alert.alert('Review required', 'Please confirm you reviewed and corrected low-confidence OCR results before publishing.');
      return;
    }

    setSaving(true);
    try {
      await SchoolMenuAnnouncementService.publishWeeklyMenu({
        preschoolId,
        publishedBy: user.id,
        draft,
        priority: 'low',
        sourceFile: pickedFile
          ? {
              fileName: pickedFile.name,
              mimeType: pickedFile.mimeType,
              uri: pickedFile.uri,
            }
          : undefined,
      });

      Alert.alert('Published', 'Weekly menu published for parents.', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error: unknown) {
      Alert.alert('Publish failed', error instanceof Error ? error.message : 'Could not publish weekly menu.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 12 }]}
      >
        <View style={styles.headerCard}>
          <Text style={styles.title}>Weekly Menu</Text>
          <Text style={styles.subtitle}>Publish a school-wide menu parents can view in their Menu tab.</Text>
          {!weeklyMenuPublishingEnabled && (
            <Text style={[styles.subtitle, { color: theme.error, marginTop: 8 }]}>
              Weekly menu publishing is disabled by feature flag.
            </Text>
          )}
        </View>

        {loading && (
          <View style={styles.card}>
            <Text style={[styles.subtitle, { margin: 0 }]}>Loading menu...</Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.label}>Week</Text>
          <TouchableOpacity
            style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
            onPress={() => setShowWeekPicker(true)}
          >
            <Text style={{ color: theme.text, fontSize: 14 }}>
              {new Date(`${weekStartDate}T00:00:00.000Z`).toLocaleDateString('en-ZA', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </Text>
            <Ionicons name="chevron-down" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
          <TextInput
            value={weekStartDate}
            onChangeText={updateWeekStart}
            placeholder="Or type YYYY-MM-DD"
            autoCapitalize="none"
            style={[styles.input, { marginTop: 8 }]}
          />

          {hasExistingMenu && (
            <TouchableOpacity
              style={[styles.deleteButton, deleting && styles.buttonDisabled]}
              onPress={handleDeleteMenu}
              disabled={deleting}
            >
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
              <Text style={styles.deleteButtonText}>{deleting ? 'Deleting...' : 'Delete this menu'}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.secondaryButton} onPress={handlePickFile}>
            <Ionicons name="attach-outline" size={18} color="#fff" />
            <Text style={styles.buttonText}>{pickedFile ? `File: ${pickedFile.name}` : 'Choose Menu File'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, parsing && styles.buttonDisabled]}
            onPress={handleParse}
            disabled={parsing}
          >
            <Ionicons name="sparkles-outline" size={18} color="#fff" />
            <Text style={styles.buttonText}>{parsing ? 'Parsing...' : 'Parse with Dash OCR'}</Text>
          </TouchableOpacity>

          <Text style={styles.hint}>OCR parsing works best with clear JPG/PNG scans. PDF parsing is supported, but always review extracted rows before publishing.</Text>
        </View>

        {draft.days.map((day) => (
          <View key={day.date} style={styles.card}>
            <Text style={styles.dayTitle}>
              {new Date(`${day.date}T00:00:00.000Z`).toLocaleDateString('en-ZA', {
                weekday: 'long',
                day: 'numeric',
                month: 'short',
              })}
            </Text>

            <Text style={styles.label}>Breakfast</Text>
            <TextInput
              value={listToText(day.breakfast)}
              onChangeText={(text) => updateDay(day.date, { breakfast: textToList(text) })}
              placeholder="Porridge, fruit"
              style={styles.input}
            />

            <Text style={styles.label}>Lunch</Text>
            <TextInput
              value={listToText(day.lunch)}
              onChangeText={(text) => updateDay(day.date, { lunch: textToList(text) })}
              placeholder="Rice, chicken stew"
              style={styles.input}
            />

            <Text style={styles.label}>Snack</Text>
            <TextInput
              value={listToText(day.snack)}
              onChangeText={(text) => updateDay(day.date, { snack: textToList(text) })}
              placeholder="Yoghurt, crackers"
              style={styles.input}
            />

            <Text style={styles.label}>Notes (optional)</Text>
            <TextInput
              value={day.notes || ''}
              onChangeText={(text) => updateDay(day.date, { notes: text })}
              placeholder="Allergen notes or substitutions"
              style={[styles.input, styles.textArea]}
              multiline
              numberOfLines={3}
            />
          </View>
        ))}

        {blankDays.length > 0 && (
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setAllowBlankDays((prev) => !prev)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={allowBlankDays ? 'checkbox-outline' : 'square-outline'}
              size={22}
              color={theme.primary}
            />
            <Text style={styles.checkboxText}>
              I confirm {blankDays.length} day(s) are intentionally blank.
            </Text>
          </TouchableOpacity>
        )}

        {incompleteMealDays.length > 0 && (
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setAllowIncompleteMeals((prev) => !prev)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={allowIncompleteMeals ? 'checkbox-outline' : 'square-outline'}
              size={22}
              color={theme.primary}
            />
            <Text style={styles.checkboxText}>
              I confirm {incompleteMealDays.length} day(s) intentionally have missing meal slots.
            </Text>
          </TouchableOpacity>
        )}

        {parseNeedsReview && (
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setConfirmParseReview((prev) => !prev)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={confirmParseReview ? 'checkbox-outline' : 'square-outline'}
              size={22}
              color={theme.primary}
            />
            <Text style={styles.checkboxText}>
              I reviewed and corrected low-confidence OCR results.
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.primaryButton, saving && styles.buttonDisabled]}
          onPress={handlePublish}
          disabled={saving}
        >
          <Ionicons name="send-outline" size={18} color="#fff" />
          <Text style={styles.buttonText}>{saving ? 'Publishing...' : (hasExistingMenu ? 'Update menu' : 'Publish Weekly Menu')}</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showWeekPicker} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowWeekPicker(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <Text style={[styles.dayTitle, { marginBottom: 12 }]}>Select week</Text>
            <FlatList
              data={availableWeeks}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.weekOption,
                    item === weekStartDate && { backgroundColor: theme.primary + '20', borderColor: theme.primary },
                  ]}
                  onPress={() => selectWeek(item)}
                >
                  <Text style={[styles.weekOptionText, { color: theme.text }]}>
                    {new Date(`${item}T00:00:00.000Z`).toLocaleDateString('en-ZA', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                  {item === weekStartDate && <Ionicons name="checkmark" size={20} color={theme.primary} />}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowWeekPicker(false)}>
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  headerCard: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.text,
  },
  subtitle: {
    marginTop: 4,
    color: theme.textSecondary,
    fontSize: 13,
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 14,
  },
  dayTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  label: {
    color: theme.text,
    fontWeight: '600',
    fontSize: 13,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    backgroundColor: theme.background,
    color: theme.text,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    color: theme.textSecondary,
  },
  secondaryButton: {
    marginTop: 10,
    backgroundColor: '#334155',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: theme.primary,
    borderRadius: 12,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  checkboxRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkboxText: {
    flex: 1,
    color: theme.textSecondary,
    fontSize: 13,
  },
  deleteButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  deleteButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: '70%',
  },
  weekOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 8,
  },
  weekOptionText: {
    fontSize: 15,
  },
});
