import { percentWidth } from '@/lib/progress/clampPercent';
import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useOrgType } from '@/lib/hooks/useOrganizationTerminology'

interface EnhancedStatProps {
  label: string
  value: number
  limit: number | 'unlimited'
  icon: keyof typeof Ionicons.glyphMap
  gradientColors: [string, string]
}

export const EnhancedStat: React.FC<EnhancedStatProps> = ({
  label,
  value,
  limit,
  icon,
  gradientColors
}) => {
  const percentage = limit === 'unlimited' ? 100 : Math.min((value / Number(limit)) * 100, 100)
  
  return (
    <View style={styles.statCard}>
      <LinearGradient colors={gradientColors} style={styles.statGradient}>
        <Ionicons name={icon} size={20} color="#FFFFFF" />
      </LinearGradient>
      
      {/* Progress Ring */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBackground}>
          <View 
            style={[
              styles.progressFill, 
              { 
                width: percentWidth(percentage),
                backgroundColor: percentage > 80 ? '#EF4444' : percentage > 60 ? '#F59E0B' : '#10B981'
              }
            ]} 
          />
        </View>
      </View>
      
      <View style={styles.statContent}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statTitle}>{label}</Text>
        <Text style={styles.statSubtitle}>
          {limit === 'unlimited' ? 'Unlimited' : `${value} / ${limit}`}
        </Text>
      </View>
    </View>
  )
}

interface EnhancedStatsRowProps {
  aiHelp: number
  aiHelpLimit: number | 'unlimited'
  aiLessons: number 
  aiLessonsLimit: number | 'unlimited'
}

export const EnhancedStatsRow: React.FC<EnhancedStatsRowProps> = ({
  aiHelp,
  aiHelpLimit,
  aiLessons,
  aiLessonsLimit
}) => {
  const { t } = useTranslation('common')
  const { isPreschool, isK12, isCorporate, isSportsClub } = useOrgType()
  
  // Organization-aware helper label
  const aiHelperLabel = isCorporate 
    ? t('quick_actions.ai_learning_assistant', { defaultValue: 'AI Learning Assistant' })
    : isSportsClub
    ? t('quick_actions.ai_training_helper', { defaultValue: 'AI Training Helper' })
    : t('quick_actions.ai_homework_helper', { defaultValue: 'AI Homework Helper' })
  
  // Organization-aware lessons label
  const aiLessonsLabel = isCorporate
    ? t('quick_actions.ai_training_modules', { defaultValue: 'AI Training Modules' })
    : isSportsClub
    ? t('quick_actions.ai_training_sessions', { defaultValue: 'AI Training Sessions' })
    : t('quick_actions.ai_lessons', { defaultValue: 'AI Lessons' })
  
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{t('dashboard.usageLimits', { defaultValue: 'Usage Limits' })}</Text>
      <View style={styles.statsRow}>
        <EnhancedStat
          label={aiHelperLabel}
          value={aiHelp}
          limit={aiHelpLimit}
          icon="help-circle"
          gradientColors={['#00f5ff', '#0080ff']}
        />
        <EnhancedStat
          label={aiLessonsLabel}
          value={aiLessons}
          limit={aiLessonsLimit}
          icon="school"
          gradientColors={['#10B981', '#059669']}
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
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
  },
  statGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  progressContainer: {
    width: '100%',
    marginBottom: 8,
  },
  progressBackground: {
    height: 4,
    backgroundColor: '#374151',
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  statContent: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  statTitle: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 2,
  },
  statSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
})

export default EnhancedStatsRow