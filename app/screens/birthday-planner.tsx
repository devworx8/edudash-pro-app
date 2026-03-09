/**
 * Birthday Planner Screen - Parent View
 * 
 * Allows parents to:
 * - View their child's upcoming birthday
 * - Set celebration preferences
 * - Manage allergies/dietary info
 * - Opt in/out of school celebrations
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Switch, RefreshControl } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useBirthdayPlanner } from '@/hooks/useBirthdayPlanner';
import type { BirthdayCelebrationPreferences } from '@/services/BirthdayPlannerService';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
// Theme options for birthday celebrations
const BIRTHDAY_THEMES = [
  { id: 'princess', label: '👸 Princess', color: '#EC4899' },
  { id: 'superhero', label: '🦸 Superhero', color: '#3B82F6' },
  { id: 'animals', label: '🦁 Animals', color: '#F59E0B' },
  { id: 'space', label: '🚀 Space', color: '#6366F1' },
  { id: 'dinosaur', label: '🦕 Dinosaur', color: '#10B981' },
  { id: 'rainbow', label: '🌈 Rainbow', color: '#8B5CF6' },
  { id: 'sports', label: '⚽ Sports', color: '#EF4444' },
  { id: 'ocean', label: '🐠 Ocean', color: '#06B6D4' },
  { id: 'simple', label: '🎈 Simple', color: '#6B7280' },
];

// Common allergies
const COMMON_ALLERGIES = [
  'Nuts', 'Peanuts', 'Dairy', 'Eggs', 'Gluten', 'Soy', 'Fish', 'Shellfish',
];

// Dietary restrictions
const DIETARY_OPTIONS = [
  'Vegetarian', 'Vegan', 'Halal', 'Kosher', 'No Sugar', 'No Artificial Colors',
];

export default function BirthdayPlannerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { user, profile } = useAuth();
  const { showAlert, alertProps } = useAlertModal();
  const organizationId = profile?.organization_id ?? profile?.preschool_id ?? null;
  const { studentId } = useLocalSearchParams<{ studentId?: string }>();
  
  // Get the child's ID - either from params or first child
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(studentId || null);
  
  // Birthday data
  const {
    studentBirthday,
    loading,
    refreshing,
    error,
    refresh,
    loadStudentBirthday,
    savePreferences,
  } = useBirthdayPlanner({ studentId: selectedStudentId });

  // Form state
  const [formData, setFormData] = useState<Partial<BirthdayCelebrationPreferences>>({
    wantsSchoolCelebration: true,
    allergies: [],
    dietaryRestrictions: [],
    preferredTheme: undefined,
    specialRequests: '',
    parentBringingTreats: false,
    treatsDescription: '',
    notifyClassmates: true,
  });
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load form data from preferences
  useEffect(() => {
    if (studentBirthday?.celebrationPreferences) {
      const prefs = studentBirthday.celebrationPreferences;
      setFormData({
        wantsSchoolCelebration: prefs.wantsSchoolCelebration ?? true,
        allergies: prefs.allergies || [],
        dietaryRestrictions: prefs.dietaryRestrictions || [],
        preferredTheme: prefs.preferredTheme,
        specialRequests: prefs.specialRequests || '',
        parentBringingTreats: prefs.parentBringingTreats ?? false,
        treatsDescription: prefs.treatsDescription || '',
        notifyClassmates: prefs.notifyClassmates ?? true,
      });
    }
  }, [studentBirthday?.celebrationPreferences]);

  const styles = createStyles(theme, isDark, insets);

  // Toggle allergy
  const toggleAllergy = (allergy: string) => {
    const current = formData.allergies || [];
    const updated = current.includes(allergy)
      ? current.filter(a => a !== allergy)
      : [...current, allergy];
    setFormData(prev => ({ ...prev, allergies: updated }));
    setHasChanges(true);
  };

  // Toggle dietary restriction
  const toggleDietary = (item: string) => {
    const current = formData.dietaryRestrictions || [];
    const updated = current.includes(item)
      ? current.filter(d => d !== item)
      : [...current, item];
    setFormData(prev => ({ ...prev, dietaryRestrictions: updated }));
    setHasChanges(true);
  };

  // Select theme
  const selectTheme = (themeId: string) => {
    setFormData(prev => ({ 
      ...prev, 
      preferredTheme: prev.preferredTheme === themeId ? undefined : themeId 
    }));
    setHasChanges(true);
  };

  // Save preferences
  const handleSave = async () => {
    if (!selectedStudentId) return;
    
    setSaving(true);
    try {
      const result = await savePreferences(selectedStudentId, formData);
      
      if (result.success) {
        showAlert({ title: 'Success', message: 'Birthday preferences saved successfully!', type: 'success' });
        setHasChanges(false);
      } else {
        showAlert({ title: 'Error', message: result.error || 'Failed to save preferences', type: 'error' });
      }
    } catch (err) {
      showAlert({ title: 'Error', message: 'Failed to save preferences', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Format birthday date
  const formatBirthdayDate = (date: Date) => {
    return date.toLocaleDateString('en-ZA', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  // Get countdown text
  const getCountdownText = (daysUntil: number) => {
    if (daysUntil === 0) return "🎉 Today's the day!";
    if (daysUntil === 1) return "🎂 Tomorrow!";
    if (daysUntil <= 7) return `🎈 In ${daysUntil} days`;
    if (daysUntil <= 30) return `📅 In ${daysUntil} days`;
    return `📆 In ${Math.floor(daysUntil / 7)} weeks`;
  };

  if (loading && !studentBirthday) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Stack.Screen options={{ title: 'Birthday Planner' }} />
        <EduDashSpinner size="large" color={theme.primary} />
        <Text style={styles.loadingText}>Loading birthday info...</Text>
      </View>
    );
  }

  if (!studentBirthday) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Stack.Screen options={{ title: 'Birthday Planner' }} />
        <Ionicons name="calendar-outline" size={64} color={theme.textSecondary} />
        <Text style={styles.emptyTitle}>No Birthday Found</Text>
        <Text style={styles.emptySubtitle}>
          Please ensure your child's date of birth is set in their profile.
        </Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => router.back()}
        >
          <Text style={styles.retryButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: 'Birthday Planner',
          headerRight: () => hasChanges ? (
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              <Text style={[styles.saveButton, saving && { opacity: 0.5 }]}>
                {saving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          ) : null,
        }} 
      />
      
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            colors={[theme.primary]}
            tintColor={theme.primary}
          />
        }
      >
        {/* Birthday Card */}
        <View style={styles.birthdayCard}>
          <View style={styles.birthdayHeader}>
            <View style={styles.cakeIcon}>
              <Text style={styles.cakeEmoji}>🎂</Text>
            </View>
            <View style={styles.birthdayInfo}>
              <Text style={styles.childName}>
                {studentBirthday.firstName}'s Birthday
              </Text>
              <Text style={styles.birthdayDate}>
                {formatBirthdayDate(studentBirthday.birthDate)}
              </Text>
              <Text style={styles.turningAge}>
                Turning {studentBirthday.age} years old
              </Text>
            </View>
          </View>
          
          <View style={styles.countdownBadge}>
            <Text style={styles.countdownText}>
              {getCountdownText(studentBirthday.daysUntil)}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.memoriesButton}
          onPress={() => {
            const eventDate = studentBirthday.birthDate.toISOString().slice(0, 10);
            router.push({
              pathname: '/screens/birthday-memories',
              params: {
                organizationId: organizationId || '',
                birthdayStudentId: studentBirthday.studentId,
                eventDate,
              },
            } as any);
          }}
        >
          <Text style={styles.memoriesButtonText}>View birthday memories</Text>
        </TouchableOpacity>

        {/* School Celebration Toggle */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>School Celebration</Text>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Celebrate at School</Text>
              <Text style={styles.toggleDescription}>
                Allow teachers to organize a small celebration with classmates
              </Text>
            </View>
            <Switch
              value={formData.wantsSchoolCelebration}
              onValueChange={(value) => {
                setFormData(prev => ({ ...prev, wantsSchoolCelebration: value }));
                setHasChanges(true);
              }}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {formData.wantsSchoolCelebration && (
          <>
            {/* Theme Selection */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Preferred Theme (Optional)</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.themeScroll}
                contentContainerStyle={styles.themeContainer}
              >
                {BIRTHDAY_THEMES.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.themeChip,
                      formData.preferredTheme === item.id && {
                        backgroundColor: item.color,
                        borderColor: item.color,
                      },
                    ]}
                    onPress={() => selectTheme(item.id)}
                  >
                    <Text style={[
                      styles.themeChipText,
                      formData.preferredTheme === item.id && { color: '#fff' },
                    ]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Allergies */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Allergies</Text>
              <Text style={styles.sectionSubtitle}>
                Select any allergies so teachers can plan safely
              </Text>
              <View style={styles.chipContainer}>
                {COMMON_ALLERGIES.map(allergy => (
                  <TouchableOpacity
                    key={allergy}
                    style={[
                      styles.chip,
                      formData.allergies?.includes(allergy) && styles.chipSelected,
                    ]}
                    onPress={() => toggleAllergy(allergy)}
                  >
                    <Text style={[
                      styles.chipText,
                      formData.allergies?.includes(allergy) && styles.chipTextSelected,
                    ]}>
                      {allergy}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Dietary Restrictions */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Dietary Preferences</Text>
              <View style={styles.chipContainer}>
                {DIETARY_OPTIONS.map(item => (
                  <TouchableOpacity
                    key={item}
                    style={[
                      styles.chip,
                      formData.dietaryRestrictions?.includes(item) && styles.chipSelected,
                    ]}
                    onPress={() => toggleDietary(item)}
                  >
                    <Text style={[
                      styles.chipText,
                      formData.dietaryRestrictions?.includes(item) && styles.chipTextSelected,
                    ]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Parent Bringing Treats */}
            <View style={styles.section}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleLabel}>I'll Bring Treats</Text>
                  <Text style={styles.toggleDescription}>
                    Would you like to provide treats for the class?
                  </Text>
                </View>
                <Switch
                  value={formData.parentBringingTreats}
                  onValueChange={(value) => {
                    setFormData(prev => ({ ...prev, parentBringingTreats: value }));
                    setHasChanges(true);
                  }}
                  trackColor={{ false: theme.border, true: theme.primary }}
                  thumbColor="#fff"
                />
              </View>
              
              {formData.parentBringingTreats && (
                <TextInput
                  style={styles.textInput}
                  placeholder="What will you bring? (e.g., cupcakes, fruit platter)"
                  placeholderTextColor={theme.textSecondary}
                  value={formData.treatsDescription}
                  onChangeText={(text) => {
                    setFormData(prev => ({ ...prev, treatsDescription: text }));
                    setHasChanges(true);
                  }}
                  multiline
                />
              )}
            </View>

            {/* Special Requests */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Special Requests</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Any special requests or notes for the teachers..."
                placeholderTextColor={theme.textSecondary}
                value={formData.specialRequests}
                onChangeText={(text) => {
                  setFormData(prev => ({ ...prev, specialRequests: text }));
                  setHasChanges(true);
                }}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            {/* Notify Classmates */}
            <View style={styles.section}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleLabel}>Notify Classmates' Parents</Text>
                  <Text style={styles.toggleDescription}>
                    Allow the school to inform other parents about the birthday
                  </Text>
                </View>
                <Switch
                  value={formData.notifyClassmates}
                  onValueChange={(value) => {
                    setFormData(prev => ({ ...prev, notifyClassmates: value }));
                    setHasChanges(true);
                  }}
                  trackColor={{ false: theme.border, true: theme.primary }}
                  thumbColor="#fff"
                />
              </View>
            </View>
          </>
        )}

        {/* Save Button (Mobile) */}
        {hasChanges && (
          <TouchableOpacity
            style={[styles.saveButtonMobile, saving && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <EduDashSpinner color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.saveButtonMobileText}>Save Preferences</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
      <AlertModal {...alertProps} />
    </View>
  );
}

const createStyles = (theme: any, isDark: boolean, insets: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: theme.textSecondary,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.text,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 24,
    backgroundColor: theme.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  saveButton: {
    color: theme.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  
  // Birthday Card
  birthdayCard: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  birthdayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cakeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cakeEmoji: {
    fontSize: 32,
  },
  birthdayInfo: {
    marginLeft: 16,
    flex: 1,
  },
  childName: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.text,
  },
  birthdayDate: {
    fontSize: 14,
    color: theme.textSecondary,
    marginTop: 4,
  },
  turningAge: {
    fontSize: 14,
    color: '#F59E0B',
    fontWeight: '600',
    marginTop: 2,
  },
  countdownBadge: {
    marginTop: 16,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  countdownText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B45309',
  },
  memoriesButton: {
    backgroundColor: theme.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 24,
  },
  memoriesButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  
  // Sections
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: theme.textSecondary,
    marginBottom: 12,
  },
  
  // Toggle Row
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 16,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.text,
  },
  toggleDescription: {
    fontSize: 13,
    color: theme.textSecondary,
    marginTop: 4,
  },
  
  // Theme Selection
  themeScroll: {
    marginHorizontal: -16,
  },
  themeContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  themeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    marginRight: 8,
  },
  themeChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.text,
  },
  
  // Chips
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  chipSelected: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  chipText: {
    fontSize: 14,
    color: theme.text,
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: '500',
  },
  
  // Text Input
  textInput: {
    backgroundColor: theme.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.text,
    marginTop: 12,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  
  // Save Button Mobile
  saveButtonMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.primary,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
    gap: 8,
  },
  saveButtonMobileText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
