/**
 * Principal Dashboard - Welcome Section
 * 
 * The welcome header card with school name, greeting, and tier badge.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import TierBadge from '@/components/ui/TierBadge';
import { useNotificationCounts } from '@/contexts/NotificationContext';
import { navigateToUpgrade } from '@/lib/upgrade/upgradeRoutes';

const { width } = Dimensions.get('window');
const isTablet = width > 768;
const isSmallScreen = width < 380;

interface PrincipalWelcomeSectionProps {
  userName?: string;
  schoolName?: string;
  tier: string;
  subscriptionReady: boolean;
  pendingRegistrations?: number;
  pendingPayments?: number;
  pendingPOPUploads?: number;
}

export const PrincipalWelcomeSection: React.FC<PrincipalWelcomeSectionProps> = ({
  userName,
  schoolName,
  tier,
  subscriptionReady,
  pendingRegistrations = 0,
  pendingPayments = 0,
  pendingPOPUploads = 0,
}) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const notificationCounts = useNotificationCounts();

  const displayName = useMemo(() => {
    if (!userName) return t('roles.principal', { defaultValue: 'Principal' });
    // Prefer first name on small screens for space.
    const parts = userName.trim().split(' ').filter(Boolean);
    if (isSmallScreen && parts.length > 0) return parts[0];
    return userName;
  }, [t, userName]);

  const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return t('dashboard.good_morning', { defaultValue: 'Good morning' });
    if (hour < 18) return t('dashboard.good_afternoon', { defaultValue: 'Good afternoon' });
    return t('dashboard.good_evening', { defaultValue: 'Good evening' });
  };

  const unreadMessages = notificationCounts.messages || 0;
  const nextAction = useMemo(() => {
    if (pendingRegistrations > 0) return { label: t('dashboard.review_registrations', { defaultValue: 'Review registrations' }), route: '/screens/principal-registrations' };
    if (pendingPOPUploads > 0) return { label: t('dashboard.verify', { defaultValue: 'Verify POPs' }), route: '/screens/pop-review' };
    if (pendingPayments > 0) return { label: t('dashboard.unpaid_fees', { defaultValue: 'Unpaid fees' }), route: '/screens/finance-control-center?tab=receivables' };
    if (unreadMessages > 0) return { label: t('dashboard.messages', { defaultValue: 'Messages' }), route: '/screens/principal-messages' };
    return { label: t('dashboard.open_dashboard', { defaultValue: 'Open dashboard' }), route: '/screens/principal-dashboard' };
  }, [pendingPayments, pendingPOPUploads, pendingRegistrations, t, unreadMessages]);

  return (
    <View style={styles.welcomeCard}>
      <View style={styles.welcomeContent}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.iconBadge}>
              <Ionicons name="grid" size={18} color={theme.onPrimary} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {t('dashboard.principal_command', { defaultValue: 'Principal Command' })}
              </Text>
              <View style={styles.schoolRow}>
                <Text style={styles.schoolName} numberOfLines={1}>
                  {schoolName || t('dashboard.your_school', { defaultValue: 'Your School' })}
                </Text>
                {subscriptionReady ? (
                  <TierBadge size="sm" showManageButton={false} />
                ) : null}
                {subscriptionReady ? (
                  <TouchableOpacity
                    style={styles.manageButton}
                    onPress={() => navigateToUpgrade({ source: 'principal_welcome_manage' })}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.manageButtonText}>
                      {t('common.manage', { defaultValue: 'Manage' })}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
        </View>

        <Text style={styles.greeting} numberOfLines={1}>
          {getGreeting()}, {displayName}
        </Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {t('dashboard.principal_welcome_hint', { defaultValue: 'Tap a button below to manage people, payments, and learning.' })}
        </Text>

        <View style={styles.actionsRow}>
          <ActionPill
            icon="person-add"
            label={t('dashboard.registrations', { defaultValue: 'Registrations' })}
            badge={pendingRegistrations}
            onPress={() => router.push('/screens/principal-registrations')}
            theme={theme}
          />
          <ActionPill
            icon="chatbubbles"
            label={t('dashboard.messages', { defaultValue: 'Messages' })}
            badge={unreadMessages}
            onPress={() => router.push('/screens/principal-messages')}
            theme={theme}
          />
          <ActionPill
            icon="people"
            label={t('dashboard.manage_teachers', { defaultValue: 'Teachers' })}
            onPress={() => router.push('/screens/teacher-management')}
            theme={theme}
          />
        </View>

        <TouchableOpacity
          style={styles.primaryCta}
          onPress={() => router.push(nextAction.route as any)}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryCtaText} numberOfLines={1}>
            {nextAction.label}
          </Text>
          <Ionicons name="arrow-forward" size={16} color={theme.primary} />
        </TouchableOpacity>
        
        {/* Upgrade prompt for free tier */}
        {tier === 'free' && subscriptionReady && (
          <View style={styles.upgradePrompt}>
            <View style={styles.upgradePromptContent}>
              <Ionicons name="diamond" size={16} color="#FFD700" />
              <Text style={styles.upgradePromptText}>{t('dashboard.unlock_features')}</Text>
            </View>
            <TouchableOpacity
              style={styles.upgradePromptButton}
              onPress={() => navigateToUpgrade({ source: 'principal_welcome_prompt', reason: 'feature_needed' })}
            >
              <Text style={styles.upgradePromptButtonText}>{t('common.upgrade')}</Text>
              <Ionicons name="arrow-forward" size={12} color={theme.primary} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

const ActionPill: React.FC<{
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  badge?: number;
  onPress: () => void;
  theme: any;
}> = ({ icon, label, badge, onPress, theme }) => {
  const showBadge = typeof badge === 'number' && badge > 0;
  return (
    <TouchableOpacity style={pillStyles(theme).pill} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name={icon} size={16} color={theme.onPrimary} />
      <Text style={pillStyles(theme).pillText} numberOfLines={1}>
        {label}
      </Text>
      {showBadge ? (
        <View style={pillStyles(theme).badge}>
          <Text style={pillStyles(theme).badgeText}>{badge > 99 ? '99+' : String(badge)}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

const pillStyles = (theme: any) =>
  StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.16)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
    },
    pillText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.onPrimary,
      maxWidth: isSmallScreen ? 92 : 140,
    },
    badge: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.error || '#EF4444',
      marginLeft: 2,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#FFFFFF',
      lineHeight: 13,
    },
  });

const createStyles = (theme: any) => StyleSheet.create({
  welcomeCard: {
    backgroundColor: theme.primary,
    borderRadius: isSmallScreen ? 12 : 16,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  welcomeContent: {
    padding: isSmallScreen ? 12 : 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    width: '100%',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    marginRight: 10,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: isSmallScreen ? 14 : 15,
    fontWeight: '800',
    color: theme.onPrimary,
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    // kept for backwards compatibility (older layouts); not currently rendered
    marginTop: 2,
    fontSize: 12,
    color: theme.onPrimary,
    opacity: 0.85,
  },
  schoolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  schoolName: {
    fontSize: isSmallScreen ? 14 : 15,
    fontWeight: '800',
    color: theme.onPrimary,
    opacity: 0.95,
    maxWidth: isSmallScreen ? 220 : 320,
  },
  manageButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  manageButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.onPrimary,
  },
  greeting: {
    fontSize: isSmallScreen ? 18 : 20,
    fontWeight: '800',
    color: theme.onPrimary,
    marginTop: 8,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: isSmallScreen ? 12 : 13,
    color: theme.onPrimary,
    opacity: 0.9,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
    marginBottom: 12,
  },
  primaryCta: {
    height: 42,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: theme.onPrimary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  primaryCtaText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '800',
    color: theme.primary,
  },
  upgradePrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
  },
  upgradePromptContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  upgradePromptText: {
    fontSize: isSmallScreen ? 12 : 14,
    color: theme.onPrimary,
    flex: 1,
    opacity: 0.9,
  },
  upgradePromptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.16)',
    gap: 4,
  },
  upgradePromptButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.onPrimary,
  },
});

export default PrincipalWelcomeSection;
