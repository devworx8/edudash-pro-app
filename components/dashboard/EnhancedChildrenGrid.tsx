import { percentWidth } from '@/lib/progress/clampPercent';
import React, { useMemo, useState } from 'react'
import {
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView,
  Image,
  Dimensions,
  LayoutAnimation,
  Platform 
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@/contexts/ThemeContext'
import { useTranslation } from 'react-i18next'
import { track } from '@/lib/analytics'

interface Child {
  id: string
  firstName: string
  lastName: string
  age?: number
  grade?: string
  className?: string
  avatarUrl?: string
  lastActivity?: Date
  homeworkPending?: number
  upcomingEvents?: number
  progressScore?: number // 0-100
  status?: 'active' | 'absent' | 'late'
}

interface EnhancedChildrenGridProps {
  childrenData: Child[]
  onChildPress?: (child: Child) => void
  onViewHomework?: (child: Child) => void
  onViewProgress?: (child: Child) => void
  onQuickMessage?: (child: Child) => void
  loading?: boolean
}

const { width, height } = Dimensions.get('window')
const cardWidth = width - 32 // Full width cards with padding

export const EnhancedChildrenGrid: React.FC<EnhancedChildrenGridProps> = ({
  childrenData,
  onChildPress,
  onViewHomework,
  onViewProgress,
  onQuickMessage,
  loading = false
}) => {
  const { theme, isDark } = useTheme()
  // Translation hook loaded for future i18n support
  useTranslation()
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const [isAccordionExpanded, setIsAccordionExpanded] = useState(false)
  const [cardHeight, setCardHeight] = useState<number | null>(null)

  // Density and typography adjustments for smaller screens
  const isSmallDevice = width < 380 || height < 700
  const density = useMemo(() => ({
    cardPadding: isSmallDevice ? 12 : 16,
    avatar: isSmallDevice ? 44 : 50,
    nameFont: isSmallDevice ? 15 : 16,
    lastNameFont: isSmallDevice ? 11 : 12,
    infoFont: isSmallDevice ? 10 : 11,
    progressFont: isSmallDevice ? 9 : 10,
    badgeFont: isSmallDevice ? 9 : 10,
    actionText: isSmallDevice ? 9 : 10,
  }), [isSmallDevice])

  // Compute a sensible max height for the inner scroller to avoid taking the whole screen
  const accordionMaxHeight = useMemo(() => {
    // Estimate per-card height if not measured yet
    const EST_CARD = isSmallDevice ? 156 : 168
    const MAX_VISIBLE = (height < 700 || width < 360) ? 2 : 3
    const count = Math.min(childrenData.length, MAX_VISIBLE)
    const perCard = cardHeight || EST_CARD
    // Include vertical margins between cards and padding
    const verticalGaps = Math.max(0, count - 1) * 12
    const padding = isSmallDevice ? 20 : 24
    const computed = perCard * count + verticalGaps + padding
    // Cap scales by device height and width
    const capBase = height < 700 ? height * 0.7 : height * 0.8
    const cap = Math.min(capBase, width < 360 ? 560 : 640)
    // Enforce a sensible minimum
    const minH = width < 360 ? 180 : 220
    return Math.max(Math.min(computed, cap), minH)
  }, [childrenData.length, cardHeight, height, width, isSmallDevice])

  // Configure layout animation for smooth accordion transitions
  React.useEffect(() => {
    if (Platform.OS === 'ios') {
      LayoutAnimation.configureNext({
        duration: 300,
        create: { type: 'easeInEaseOut', property: 'opacity' },
        update: { type: 'easeInEaseOut' },
      })
    }
  }, [isAccordionExpanded])

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'absent':
        return '#EF4444' // Red
      case 'late':
        return '#F59E0B' // Amber
      case 'active':
      default:
        return '#10B981' // Green
    }
  }

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'absent':
        return 'close-circle'
      case 'late':
        return 'time'
      case 'active':
      default:
        return 'checkmark-circle'
    }
  }

  const getProgressColor = (score: number) => {
    if (score >= 80) return '#10B981' // Green
    if (score >= 60) return '#F59E0B' // Amber  
    return '#EF4444' // Red
  }

  const getAvatarColors = (firstName: string, lastName: string) => {
    const colors = [
      ['#FF6B6B', '#FF8E8E'] as const,
      ['#4ECDC4', '#7FDBDA'] as const, 
      ['#45B7D1', '#96C9DC'] as const,
      ['#FFA07A', '#FFB499'] as const,
      ['#98D8C8', '#B5E2D6'] as const,
      ['#F7DC6F', '#F9E79F'] as const
    ] as const
    const colorIndex = (firstName.charCodeAt(0) + lastName.charCodeAt(0)) % colors.length
    return colors[colorIndex]
  }


  const renderQuickActions = (child: Child) => (
    <View style={styles.quickActions}>
      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: `${theme.primary}20` }]}
        onPress={() => {
          track('edudash.parent.child_progress_viewed', { child_count: 1, assignment_count: child.homeworkPending || 0 })
          onViewHomework?.(child)
        }}
      >
        <Ionicons name="book" size={14} color={theme.primary} />
        <Text style={[styles.actionText, { color: theme.primary }]}>
          {child.homeworkPending || 0}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: `${getProgressColor(child.progressScore || 0)}20` }]}
        onPress={() => {
          track('edudash.parent.child_progress_viewed', { child_count: 1, assignment_count: child.homeworkPending || 0 })
          onViewProgress?.(child)
        }}
      >
        <Ionicons name="trending-up" size={14} color={getProgressColor(child.progressScore || 0)} />
        <Text style={[styles.actionText, { color: getProgressColor(child.progressScore || 0) }]}>
          {child.progressScore || 0}%
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: '#25D36620' }]}
        onPress={() => {
          track('edudash.parent.teacher_message_sent', { message_length: 0 })
          onQuickMessage?.(child)
        }}
      >
        <Ionicons name="chatbubble" size={14} color="#25D366" />
      </TouchableOpacity>
    </View>
  )

  const toggleAccordion = () => {
    if (Platform.OS === 'ios') {
      LayoutAnimation.configureNext({
        duration: 300,
        create: { type: 'easeInEaseOut', property: 'opacity' },
        update: { type: 'easeInEaseOut' },
      })
    }
    setIsAccordionExpanded(!isAccordionExpanded)
    track('edudash.parent.children_accordion_toggled', { 
      expanded: !isAccordionExpanded, 
      children_count: childrenData.length 
    })
  }

  const renderChildCard = (child: Child, index: number) => {
    const isExpanded = expandedCard === child.id
    const statusColor = getStatusColor(child.status)
    const statusIcon = getStatusIcon(child.status)

    return (
      <TouchableOpacity
        key={child.id}
        style={[
          styles.childCard,
          {
            backgroundColor: isDark ? '#2a2a2a' : '#ffffff',
            width: cardWidth,
            marginBottom: 12,
          }
        ]}
        onLayout={index === 0 ? (e) => {
          const h = e.nativeEvent.layout.height
          if (!cardHeight || Math.abs(cardHeight - h) > 2) setCardHeight(h)
        } : undefined}
        onPress={() => {
          track('edudash.parent.child_progress_viewed', { child_count: 1, assignment_count: child.homeworkPending || 0 })
          setExpandedCard(isExpanded ? null : child.id)
          onChildPress?.(child)
        }}
        activeOpacity={0.7}
      >
        <LinearGradient
          colors={isDark 
            ? ['#2a2a2a', '#3a3a3a']
            : ['#ffffff', '#f8f9fa']
          }
          style={[styles.cardGradient, { padding: density.cardPadding }]}
        >
          {/* Header with Status and Badges */}
          <View style={styles.cardHeader}>
            <View style={styles.headerLeftRow}>
              <View style={[styles.statusIndicator, { backgroundColor: statusColor }]}>
                <Ionicons name={statusIcon as any} size={10} color="#FFFFFF" />
              </View>
            <Text style={[styles.lastActivity, { color: theme.textTertiary, fontSize: density.progressFont }]}>
              {child.lastActivity ? 
                `${Math.floor((Date.now() - child.lastActivity.getTime()) / (1000 * 60 * 60))}h ago` :
                'No activity'
              }
            </Text>
            </View>
            <View style={styles.headerBadges}>
              {child.homeworkPending && child.homeworkPending > 0 && (
                <View style={[styles.badge, { backgroundColor: '#EF4444' }]}>
                  <Text style={[styles.badgeText, { fontSize: density.badgeFont }]}>{child.homeworkPending}</Text>
                </View>
              )}
              {child.upcomingEvents && child.upcomingEvents > 0 && (
                <View style={[styles.badge, { backgroundColor: '#F59E0B' }]}>
                  <Text style={[styles.badgeText, { fontSize: density.badgeFont }]}>{child.upcomingEvents}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Avatar and Name */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarContainer}>
              {child.avatarUrl ? (
                <Image source={{ uri: child.avatarUrl }} style={[styles.avatarImage, { width: density.avatar, height: density.avatar, borderRadius: density.avatar / 2 }]} />
              ) : (
                <LinearGradient
                  colors={getAvatarColors(child.firstName, child.lastName)}
                  style={[styles.avatarGradient, { width: density.avatar, height: density.avatar, borderRadius: density.avatar / 2 }]}
                >
                  <Text style={styles.avatarText}>{`${child.firstName[0]}${child.lastName[0]}`.toUpperCase()}</Text>
                </LinearGradient>
              )}
            </View>
            <Text style={[styles.childName, { color: theme.text, fontSize: density.nameFont }]}>
              {child.firstName}
            </Text>
            <Text style={[styles.childLastName, { color: theme.textSecondary, fontSize: density.lastNameFont }]}>
              {child.lastName}
            </Text>
          </View>

          {/* Info Section */}
          <View style={styles.infoSection}>
            {child.age && (
              <Text style={[styles.infoText, { color: theme.textSecondary, fontSize: density.infoFont }]}>
                Age {child.age}
              </Text>
            )}
            {child.grade && (
              <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                {child.grade}
              </Text>
            )}
            {child.className && (
              <Text style={[styles.classText, { color: theme.textTertiary, fontSize: density.infoFont }]}>
                {child.className}
              </Text>
            )}
          </View>

          {/* Progress Bar */}
          {child.progressScore !== undefined && (
            <View style={styles.progressSection}>
              <View style={[styles.progressBar, { backgroundColor: `${theme.textTertiary}20` }]}>
                <View 
                  style={[
                    styles.progressFill,
                    { 
                      backgroundColor: getProgressColor(child.progressScore),
                      width: percentWidth(child.progressScore)
                    }
                  ]} 
                />
              </View>
              <Text style={[styles.progressText, { color: theme.textSecondary, fontSize: density.progressFont }]}>
                Progress
              </Text>
            </View>
          )}

          {/* Quick Actions */}
          {renderQuickActions(child)}
        </LinearGradient>
      </TouchableOpacity>
    )
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Loading children...
        </Text>
      </View>
    )
  }

  if (childrenData.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="people-outline" size={48} color={theme.textTertiary} />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>
          No Children Found
        </Text>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          Add your first child to get started with tracking their progress
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Accordion Header */}
      <TouchableOpacity 
        style={styles.accordionHeader} 
        onPress={toggleAccordion}
        activeOpacity={0.7}
      >
        <View style={styles.headerContent}>
            <View style={styles.headerLeft}>
            <Ionicons 
              name="people" 
              size={24} 
              color={theme.primary} 
              style={styles.headerIcon} 
            />
            <View>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                My Children
              </Text>
              <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
                {childrenData.length} {childrenData.length === 1 ? 'child' : 'children'}
              </Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            {!isAccordionExpanded && childrenData.length > 0 && (
              <View style={styles.previewAvatars}>
                {childrenData.slice(0, 3).map((child, index) => (
                  <View key={child.id} style={[styles.miniAvatar, { marginLeft: index > 0 ? -8 : 0 }]}>
                    {child.avatarUrl ? (
                      <Image source={{ uri: child.avatarUrl }} style={styles.miniAvatarImage} />
                    ) : (
                      <LinearGradient
                        colors={getAvatarColors(child.firstName, child.lastName)}
                        style={styles.miniAvatarGradient}
                      >
                        <Text style={styles.miniAvatarText}>
                          {child.firstName[0]}{child.lastName[0]}
                        </Text>
                      </LinearGradient>
                    )}
                  </View>
                ))}
                {childrenData.length > 3 && (
                  <View style={[styles.miniAvatar, styles.moreIndicator, { marginLeft: -8 }]}>
                    <Text style={styles.moreText}>+{childrenData.length - 3}</Text>
                  </View>
                )}
              </View>
            )}
            <Ionicons 
              name={isAccordionExpanded ? 'chevron-up' : 'chevron-down'} 
              size={20} 
              color={theme.textSecondary} 
            />
          </View>
        </View>
      </TouchableOpacity>

      {/* Accordion Content */}
      {isAccordionExpanded && (
        <View style={[styles.accordionContent, { maxHeight: accordionMaxHeight }]}>
          <ScrollView 
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            directionalLockEnabled
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.stackContainer}>
              {childrenData.map((child, idx) => renderChildCard(child, idx))}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  )
}

export default EnhancedChildrenGrid

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  accordionHeader: {
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerIcon: {
    marginRight: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewAvatars: {
    flexDirection: 'row',
    marginRight: 12,
  },
  miniAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  miniAvatarImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  miniAvatarGradient: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniAvatarText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  moreIndicator: {
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
  },
  accordionContent: {
    maxHeight: 400,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  stackContainer: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  childCard: {
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
  },
  cardGradient: {
    borderRadius: 16,
    padding: 16,
    position: 'relative',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBadges: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lastActivity: {
    fontSize: 10,
    fontWeight: '500',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarContainer: {
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  avatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarGradient: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  childName: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 2,
  },
  childLastName: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  infoSection: {
    alignItems: 'center',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  classText: {
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
  },
  progressSection: {
    marginBottom: 12,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 40,
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
  },
  badgeContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
  },
  badge: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 4,
    minWidth: 20,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
})