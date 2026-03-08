import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';

interface RoleOption {
  id: string;
  title: string;
  description: string;
  icon: string;
  route: string;
  gradient: string[];
  badge?: string;
}

// Individual user roles - people joining existing schools/orgs
const INDIVIDUAL_ROLES: RoleOption[] = [
  {
    id: 'parent',
    title: 'Parent / Guardian',
    description: 'Monitor your children\'s progress, communicate with teachers, and stay connected with their school',
    icon: 'people-outline',
    route: '/screens/parent-registration',
    gradient: ['#f093fb', '#f5576c'],
    badge: 'Most Popular',
  },
  {
    id: 'learner',
    title: 'Student / Learner',
    description: 'Join programs, track your progress, submit assignments, and access learning materials',
    icon: 'school-outline',
    route: '/screens/learner-registration',
    gradient: ['#667eea', '#764ba2'],
  },
  {
    id: 'teacher',
    title: 'Teacher / Educator',
    description: 'Create lessons, manage classes, grade assignments, and communicate with parents',
    icon: 'person-outline',
    route: '/screens/teacher-registration',
    gradient: ['#4facfe', '#00f2fe'],
  },
];

// Organization admins - people creating/managing organizations
const ORGANIZATION_ROLES: RoleOption[] = [
  {
    id: 'school',
    title: 'Register a School',
    description: 'Preschools, primary schools, high schools - set up your institution on EduDash Pro',
    icon: 'business-outline',
    route: '/screens/principal-onboarding',
    gradient: ['#43e97b', '#38f9d7'],
  },
  {
    id: 'organization',
    title: 'Skills / Training Center',
    description: 'Training centers, skills development programs, adult education, or tertiary institutions',
    icon: 'library-outline',
    route: '/screens/org-onboarding',
    gradient: ['#fa709a', '#fee140'],
  },
  {
    id: 'membership',
    title: 'Community Organization',
    description: 'NPOs, community groups, membership organizations (like EduPro)',
    icon: 'globe-outline',
    route: '/screens/membership/register',
    gradient: ['#a8edea', '#fed6e3'],
  },
];

export default function RoleSelectionScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = createStyles(theme);

  const handleRoleSelect = (route: string) => {
    router.push(route as any);
  };

  const renderRoleCard = (role: RoleOption) => (
    <TouchableOpacity
      key={role.id}
      style={[styles.roleCard, { backgroundColor: theme.card, borderColor: theme.border }]}
      onPress={() => handleRoleSelect(role.route)}
      activeOpacity={0.7}
    >
      <LinearGradient
        colors={role.gradient as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.iconGradient}
      >
        <Ionicons name={role.icon as any} size={28} color="#fff" />
      </LinearGradient>
      <View style={styles.roleContent}>
        <View style={styles.titleRow}>
          <Text style={[styles.roleTitle, { color: theme.text }]}>{role.title}</Text>
          {role.badge && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{role.badge}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.roleDescription, { color: theme.textSecondary }]}>
          {role.description}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={24} color={theme.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          title: t('auth.role_selection.title', { defaultValue: 'Create Account' }),
          headerStyle: { backgroundColor: theme.background },
          headerTitleStyle: { color: theme.text },
          headerTintColor: theme.primary,
          headerShown: true,
        }}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t('auth.role_selection.heading', { defaultValue: 'How will you use EduDash Pro?' })}</Text>
          <Text style={styles.subtitle}>
            {t('auth.role_selection.subheading', { defaultValue: 'Choose the option that best describes your role' })}
          </Text>
        </View>

        {/* Individual Roles - Joining existing organizations */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="person-add-outline" size={20} color={theme.primary} />
            <Text style={styles.sectionTitle}>{t('auth.role_selection.individuals', { defaultValue: 'Join a School or Program' })}</Text>
          </View>
          <Text style={styles.sectionHint}>
            {t('auth.role_selection.individuals_hint', { defaultValue: 'For parents, students, and educators joining an existing school' })}
          </Text>
          {INDIVIDUAL_ROLES.map(renderRoleCard)}
        </View>

        {/* Organization Roles - Creating new organizations */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="business-outline" size={20} color={theme.primary} />
            <Text style={styles.sectionTitle}>{t('auth.role_selection.organizations', { defaultValue: 'Start an Organization' })}</Text>
          </View>
          <Text style={styles.sectionHint}>
            {t('auth.role_selection.organizations_hint', { defaultValue: 'For principals, admins, and organization leaders' })}
          </Text>
          {ORGANIZATION_ROLES.map(renderRoleCard)}
        </View>

        {/* Help text */}
        <View style={styles.helpSection}>
          <Ionicons name="help-circle-outline" size={18} color={theme.textSecondary} />
          <Text style={styles.helpText}>
            {t('auth.role_selection.help', { defaultValue: 'Not sure which to choose? Parents and students typically join existing schools. School principals and org admins create new organizations.' })}
          </Text>
        </View>

        {/* Back to Sign In */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={20} color={theme.primary} />
          <Text style={[styles.backButtonText, { color: theme.primary }]}>
            {t('auth.role_selection.back_to_signin', { defaultValue: 'Back to Sign In' })}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  content: {
    padding: 20,
    gap: 24,
    paddingBottom: 40,
  },
  header: {
    gap: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: theme.text,
    textAlign: 'center',
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 15,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.text,
  },
  sectionHint: {
    fontSize: 13,
    color: theme.textSecondary,
    marginBottom: 4,
    paddingLeft: 28,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
  },
  iconGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleContent: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  badge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
  },
  roleDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  helpSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: theme.card,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  helpText: {
    flex: 1,
    fontSize: 13,
    color: theme.textSecondary,
    lineHeight: 18,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
    marginTop: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});



