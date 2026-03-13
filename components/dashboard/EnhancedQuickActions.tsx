import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useSubscription } from '@/contexts/SubscriptionContext'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/contexts/ThemeContext'
import { useOrganizationTerminology, useOrgType } from '@/lib/hooks/useOrganizationTerminology'
import { useRewardedFeature } from '@/contexts/AdsContext'

interface EnhancedQuickActionProps {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  description: string
  gradientColors: [string, string]
  onPress: () => void
  disabled?: boolean
  isPremium?: boolean
  premiumDescription?: string
  /** Stable key for rewarded-ad unlock state. Defaults to slugified title. */
  featureKey?: string
}

const EnhancedQuickAction: React.FC<EnhancedQuickActionProps> = ({
  icon,
  title,
  description,
  gradientColors,
  onPress,
  disabled = false,
  isPremium = false,
  premiumDescription,
  featureKey,
}) => {
  const { t } = useTranslation('common')
  const { width } = Dimensions.get('window')
  const cardWidth = (width - 48) / 2
  const { tier } = useSubscription()
  const normalizedTier = String(tier || '').toLowerCase().replace(/-/g, '_')

  // Stable feature key for rewarded unlock tracking
  const resolvedFeatureKey = featureKey || title.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  const { isUnlocked } = useRewardedFeature(resolvedFeatureKey)

  // Check if feature is premium-gated and user doesn't have a paid tier
  // For parents: parent_starter or parent_plus unlock premium features
  // For schools: premium or enterprise unlock premium features
  const isPaidTier = [
    'parent_starter',
    'parent_plus',
    'premium',
    'enterprise',
    'pro',
    'starter',
    'school_starter',
    'school_premium',
    'school_pro',
  ].includes(normalizedTier)
  const isPremiumBlocked = isPremium && !isPaidTier && !isUnlocked

  const handlePress = () => {
    if (isPremiumBlocked) {
      // Navigate to premium feature banner screen
      router.push({
        pathname: '/premium-feature-modal',
        params: {
          featureName: title,
          description: premiumDescription || description,
          screen: 'quick-actions',
          icon: icon,
          featureKey: resolvedFeatureKey,
        },
      })
      return
    }
    onPress()
  }

  return (
    <TouchableOpacity
      style={[
        styles.quickActionCard,
        { width: cardWidth, borderLeftColor: (disabled && !isPremiumBlocked) ? '#6B7280' : gradientColors[0], shadowColor: (disabled && !isPremiumBlocked) ? '#6B7280' : gradientColors[0] },
        (disabled || isPremiumBlocked) && styles.disabledCard
      ]}
      onPress={handlePress}
      disabled={disabled && !isPremiumBlocked} // Allow press for premium blocked to show upgrade
      activeOpacity={0.8}
    >
      <LinearGradient 
        colors={(disabled && !isPremiumBlocked) ? ['#6B7280', '#9CA3AF'] : gradientColors} 
        style={styles.quickActionGradient}
      >
        {isPremiumBlocked && (
          <View style={styles.premiumBadge}>
            <Ionicons name="diamond" size={12} color="#FFD700" />
            <Text style={styles.premiumBadgeText}>{t('subscription.plus_feature', { defaultValue: 'Plus' })}</Text>
          </View>
        )}
        <View style={styles.iconContainer}>
          <Ionicons name={icon} size={28} color="#FFFFFF" />
        </View>
        <Text style={styles.quickActionTitle} numberOfLines={1} ellipsizeMode="tail">{title}</Text>
        <Text style={styles.quickActionDescription} numberOfLines={2} ellipsizeMode="tail">
          {isPremiumBlocked ? t('quick_actions.upgrade_to_unlock', { defaultValue: 'Upgrade to unlock' }) : description}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  )
}

interface EnhancedQuickActionsProps {
  aiHelpUsage: number
  aiHelpLimit: number | 'unlimited'
  onHomeworkPress: () => void
  onWhatsAppPress: () => void
  onUpgradePress: () => void
}

export const EnhancedQuickActions: React.FC<EnhancedQuickActionsProps> = ({
  aiHelpUsage,
  aiHelpLimit,
  onHomeworkPress,
  onWhatsAppPress,
  onUpgradePress: _onUpgradePress
}) => {
  const { theme } = useTheme()
  const { t } = useTranslation('common')
  const { terminology } = useOrganizationTerminology()
  const { isCorporate, isSportsClub } = useOrgType()
  const remaining = aiHelpLimit === 'unlimited' ? 'unlimited' : Number(aiHelpLimit) - aiHelpUsage
  const isHomeworkDisabled = aiHelpLimit !== 'unlimited' && aiHelpUsage >= Number(aiHelpLimit)

  // Organization-aware labels
  const aiHelperTitle = isCorporate 
    ? t('quick_actions.ai_learning_assistant', { defaultValue: 'AI Learning Assistant' })
    : isSportsClub
    ? t('quick_actions.ai_training_helper', { defaultValue: 'AI Training Helper' })
    : t('quick_actions.ai_homework_helper', { defaultValue: 'AI Homework Helper' })
  
  const connectDescription = t('quick_actions.connect_with_instructors', { 
    defaultValue: `Connect with ${terminology.instructors.toLowerCase()}` 
  })
  
  const whatsappPremiumDesc = t('quick_actions.whatsapp_premium_description_org', {
    defaultValue: `Get instant communication with your ${terminology.instructors.toLowerCase()} and receive real-time updates on assignments and progress`
  })
  
  const learningResourcesDesc = isCorporate
    ? t('quick_actions.access_training_materials', { defaultValue: 'Access training materials' })
    : isSportsClub
    ? t('quick_actions.access_training_materials', { defaultValue: 'Access training materials' })
    : t('quick_actions.access_study_materials', { defaultValue: 'Access study materials' })

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('quick_actions.quick_actions', { defaultValue: 'Quick Actions' })}</Text>
      <View style={styles.quickActionsGrid}>
        <EnhancedQuickAction
          icon="chatbubbles"
          title={t('quick_actions.dash_chat', { defaultValue: 'Chat with Dash' })}
          description={t('quick_actions.ai_assistant', { defaultValue: 'Your AI teaching assistant' })}
          gradientColors={['#6366F1', '#8B5CF6']}
          onPress={() => router.push('/screens/dash-assistant')}
        />
        
        <EnhancedQuickAction
          icon="help-circle"
          title={aiHelperTitle}
          description={
            isHomeworkDisabled
              ? t('quick_actions.limit_reached', 'Limit reached')
              : t('quick_actions.requests_left', `${typeof remaining === 'number' ? remaining : 0} requests left`, { count: typeof remaining === 'number' ? remaining : 0 })
          }
          gradientColors={['#00f5ff', '#0080ff']}
          onPress={onHomeworkPress}
          disabled={isHomeworkDisabled}
        />
        
        <EnhancedQuickAction
          icon="logo-whatsapp"
          title={t('quick_actions.whatsapp_connect', { defaultValue: 'WhatsApp Connect' })}
          description={connectDescription}
          gradientColors={['#25D366', '#128C7E']}
          onPress={onWhatsAppPress}
          isPremium={true}
          premiumDescription={whatsappPremiumDesc}
        />
        
        <EnhancedQuickAction
          icon="library"
          title={t('quick_actions.learning_resources', { defaultValue: 'Learning Resources' })}
          description={learningResourcesDesc}
          gradientColors={['#8B5CF6', '#7C3AED']}
          onPress={() => router.push('/screens/learning-resources')}
          isPremium={true}
          premiumDescription={t('quick_actions.learning_resources_premium_description', { defaultValue: 'Access premium study materials, interactive content, and curated educational resources' })}
        />
        
        <EnhancedQuickAction
          icon="analytics"
          title={t('quick_actions.progress_analytics', { defaultValue: 'Progress Analytics' })}
          description={t('quick_actions.track_your_performance', { defaultValue: 'Track your performance' })}
          gradientColors={['#F59E0B', '#D97706']}
          onPress={() => router.push('/screens/analytics')}
          isPremium={true}
          premiumDescription={t('quick_actions.progress_analytics_premium_description', { defaultValue: 'Get detailed insights into your learning progress with advanced analytics and performance tracking' })}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    // Use margins for RN Android consistency; gap support can vary across platforms
    marginHorizontal: -6,
  },
  quickActionCard: {
    borderRadius: 16,
    borderLeftWidth: 4,
    // Do not use overflow: 'hidden' on Android when using elevation; it will clip shadows
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
    marginBottom: 12,
    marginHorizontal: 6,
  },
  disabledCard: {
    opacity: 0.6,
    shadowOpacity: 0.05,
    elevation: 2,
  },
  quickActionGradient: {
    padding: 20,
    alignItems: 'center',
    height: 150,
    justifyContent: 'center',
    borderRadius: 16,
    overflow: 'hidden',
  },
  iconContainer: {
    marginBottom: 12,
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
  },
  quickActionTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 6,
    textAlign: 'center',
  },
  quickActionDescription: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 16,
  },
  premiumBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    zIndex: 1,
  },
  premiumBadgeText: {
    color: '#FFD700',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
  },
})

export default EnhancedQuickActions
