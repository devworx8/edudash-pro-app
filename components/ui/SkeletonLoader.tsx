import React, { useEffect } from 'react'
import { View, StyleSheet, Dimensions } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  interpolateColor,
} from 'react-native-reanimated'
import { useTheme } from '../../contexts/ThemeContext'

interface SkeletonLoaderProps {
  width?: number | string
  height?: number
  borderRadius?: number
  style?: any
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  width = '100%',
  height = 20,
  borderRadius = 4,
  style
}) => {
  const { isDark } = useTheme()
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1, // infinite
      false,
    )
  }, [progress])

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      isDark ? ['#2A2A2A', '#3D3D3D'] : ['#E5E7EB', '#F3F4F6'],
    ),
  }))

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
        },
        animatedStyle,
        style,
      ]}
    />
  )
}

export const SkeletonCard: React.FC = () => {
  const { theme } = useTheme()
  
  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <View style={styles.cardHeader}>
        <SkeletonLoader width={120} height={24} borderRadius={8} />
        <SkeletonLoader width={80} height={16} borderRadius={6} />
      </View>
      <View style={styles.cardContent}>
        <SkeletonLoader width="100%" height={16} style={{ marginBottom: 8 }} />
        <SkeletonLoader width="80%" height={16} style={{ marginBottom: 8 }} />
        <SkeletonLoader width="60%" height={16} />
      </View>
    </View>
  )
}

export const SkeletonStats: React.FC = () => {
  const { theme } = useTheme()
  
  return (
    <View style={styles.statsContainer}>
      <View style={[styles.statCard, { backgroundColor: theme.surface }]}>
        <SkeletonLoader width={40} height={40} borderRadius={20} style={{ marginBottom: 12 }} />
        <SkeletonLoader width={60} height={20} borderRadius={6} style={{ marginBottom: 4 }} />
        <SkeletonLoader width={80} height={14} borderRadius={4} />
      </View>
      <View style={[styles.statCard, { backgroundColor: theme.surface }]}>
        <SkeletonLoader width={40} height={40} borderRadius={20} style={{ marginBottom: 12 }} />
        <SkeletonLoader width={60} height={20} borderRadius={6} style={{ marginBottom: 4 }} />
        <SkeletonLoader width={80} height={14} borderRadius={4} />
      </View>
    </View>
  )
}

export const SkeletonQuickActions: React.FC = () => {
  const { theme } = useTheme()
  const { width } = Dimensions.get('window')
  const cardWidth = (width - 48) / 2
  
  return (
    <View style={styles.quickActionsContainer}>
      <View style={[styles.quickActionCard, { width: cardWidth, backgroundColor: theme.surface }]}>
        <SkeletonLoader width={32} height={32} borderRadius={16} style={{ marginBottom: 12 }} />
        <SkeletonLoader width="80%" height={16} borderRadius={4} style={{ marginBottom: 4 }} />
        <SkeletonLoader width="100%" height={12} borderRadius={3} />
      </View>
      <View style={[styles.quickActionCard, { width: cardWidth, backgroundColor: theme.surface }]}>
        <SkeletonLoader width={32} height={32} borderRadius={16} style={{ marginBottom: 12 }} />
        <SkeletonLoader width="80%" height={16} borderRadius={4} style={{ marginBottom: 4 }} />
        <SkeletonLoader width="100%" height={12} borderRadius={3} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeader: {
    marginBottom: 16,
  },
  cardContent: {
    // No additional styles needed
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    marginHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  quickActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  quickActionCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
})

export default SkeletonLoader