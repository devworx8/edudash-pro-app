import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { View, Text, Animated, Platform, ToastAndroid, StyleSheet, TouchableOpacity, PanResponder, Dimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

export type ToastType = 'info' | 'success' | 'warn' | 'error'
export type ToastInput = { 
  message: string
  type?: ToastType
  durationMs?: number
  title?: string
  action?: { label: string; onPress: () => void }
  /** Optional stable ID for deduplication — toasts with the same id won't stack. */
  id?: string
}

// Toast config by type
const TOAST_CONFIG: Record<ToastType, {
  icon: keyof typeof Ionicons.glyphMap
  colors: [string, string]
  borderColor: string
}> = {
  success: {
    icon: 'checkmark-circle',
    colors: ['rgba(16, 185, 129, 0.95)', 'rgba(5, 150, 105, 0.95)'],
    borderColor: 'rgba(52, 211, 153, 0.5)',
  },
  error: {
    icon: 'alert-circle',
    colors: ['rgba(239, 68, 68, 0.95)', 'rgba(220, 38, 38, 0.95)'],
    borderColor: 'rgba(248, 113, 113, 0.5)',
  },
  info: {
    icon: 'information-circle',
    colors: ['rgba(59, 130, 246, 0.95)', 'rgba(37, 99, 235, 0.95)'],
    borderColor: 'rgba(96, 165, 250, 0.5)',
  },
  warn: {
    icon: 'warning',
    colors: ['rgba(245, 158, 11, 0.95)', 'rgba(217, 119, 6, 0.95)'],
    borderColor: 'rgba(251, 191, 36, 0.5)',
  },
}

const ToastContext = createContext<{
  show: (input: ToastInput) => void
} | null>(null)

let globalShow: ((input: ToastInput) => void) | null = null

export const toast = {
  show: (message: string, opts: Partial<ToastInput> = {}) => globalShow?.({ message, ...opts }),
  info: (message: string, titleOrDuration?: string | number, durationMs = 2500) => {
    const title = typeof titleOrDuration === 'string' ? titleOrDuration : undefined
    const duration = typeof titleOrDuration === 'number' ? titleOrDuration : durationMs
    globalShow?.({ message, title, type: 'info', durationMs: duration })
  },
  success: (message: string, titleOrDuration?: string | number, durationMs = 2500) => {
    const title = typeof titleOrDuration === 'string' ? titleOrDuration : undefined
    const duration = typeof titleOrDuration === 'number' ? titleOrDuration : durationMs
    globalShow?.({ message, title, type: 'success', durationMs: duration })
  },
  warn: (message: string, titleOrDuration?: string | number, durationMs = 3000) => {
    const title = typeof titleOrDuration === 'string' ? titleOrDuration : undefined
    const duration = typeof titleOrDuration === 'number' ? titleOrDuration : durationMs
    if (Platform.OS === 'android') {
      try { ToastAndroid.show(message, ToastAndroid.SHORT) } catch { /* Intentional: non-fatal */ }
    }
    globalShow?.({ message, title, type: 'warn', durationMs: duration })
  },
  error: (message: string, titleOrDuration?: string | number, durationMs = 3500) => {
    const title = typeof titleOrDuration === 'string' ? titleOrDuration : undefined
    const duration = typeof titleOrDuration === 'number' ? titleOrDuration : durationMs
    globalShow?.({ message, title, type: 'error', durationMs: duration })
  },
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

// Individual Toast Item with animations
const ToastItem: React.FC<{
  toast: ToastInput & { id: string }
  onHide: (id: string) => void
  index: number
}> = ({ toast: t, onHide, index }) => {
  const translateY = useRef(new Animated.Value(-100)).current
  const translateX = useRef(new Animated.Value(0)).current
  const opacity = useRef(new Animated.Value(0)).current
  const progressAnim = useRef(new Animated.Value(1)).current
  const config = TOAST_CONFIG[t.type || 'info']
  const duration = t.durationMs === 0 ? 0 : (t.durationMs || 3000)
  const isPersistent = duration === 0

  useEffect(() => {
    // Slide in from top
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        tension: 80,
        friction: 12,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start()

    // Skip progress bar + auto-hide for persistent toasts (durationMs: 0)
    if (!isPersistent) {
      Animated.timing(progressAnim, {
        toValue: 0,
        duration,
        useNativeDriver: false,
      }).start()

      const timer = setTimeout(() => hideToast(), duration)
      return () => clearTimeout(timer)
    }
  }, [])

  const hideToast = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onHide(t.id))
  }, [t.id, onHide])

  // Swipe to dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, { dx, dy }) => Math.abs(dx) > 10 || Math.abs(dy) > 10,
      onPanResponderMove: (_, { dx, dy }) => {
        if (dy < 0) translateY.setValue(dy)
        else translateX.setValue(dx)
      },
      onPanResponderRelease: (_, { dx, dy, vx, vy }) => {
        if (dy < -50 || vy < -0.5 || Math.abs(dx) > 100 || Math.abs(vx) > 0.5) {
          Animated.parallel([
            Animated.timing(translateY, { toValue: -200, duration: 200, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
          ]).start(() => onHide(t.id))
        } else {
          Animated.parallel([
            Animated.spring(translateY, { toValue: 0, tension: 100, friction: 10, useNativeDriver: true }),
            Animated.spring(translateX, { toValue: 0, tension: 100, friction: 10, useNativeDriver: true }),
          ]).start()
        }
      },
    })
  ).current

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        {
          transform: [{ translateY }, { translateX }],
          opacity,
          top: index * 8,
          zIndex: 100 - index,
        },
      ]}
      {...panResponder.panHandlers}
    >
      <LinearGradient
        colors={config.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.toastGradient, { borderColor: config.borderColor }]}
      >
        <View style={styles.iconContainer}>
          <Ionicons name={config.icon} size={22} color="#fff" />
        </View>
        <View style={styles.contentContainer}>
          {t.title && <Text style={styles.title} numberOfLines={1}>{t.title}</Text>}
          <Text style={[styles.message, !t.title && styles.messageOnly]} numberOfLines={2}>{t.message}</Text>
        </View>
        {t.action ? (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => { t.action?.onPress(); hideToast() }}
          >
            <Text style={styles.actionText}>{t.action.label}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.closeButton} onPress={hideToast}>
            <Ionicons name="close" size={18} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        )}
        <Animated.View
          style={[
            styles.progressBar,
            {
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </LinearGradient>
    </Animated.View>
  )
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Array<ToastInput & { id: string }>>([])
  const insets = useSafeAreaInsets()

  const show = useCallback((input: ToastInput) => {
    const stableId = input.id || String(Date.now() + Math.random());
    setQueue((q) => {
      // Deduplicate: if a toast with this id is already visible, skip
      if (input.id && q.some((t) => t.id === input.id)) return q;
      const item = { 
        id: stableId, 
        type: 'info' as ToastType, 
        durationMs: 3000, 
        ...input 
      };
      return [...q.slice(-2), item]; // Keep max 3 toasts
    });
  }, [])

  const hideToast = useCallback((id: string) => {
    setQueue((q) => q.filter((t) => t.id !== id))
  }, [])

  useEffect(() => { globalShow = show; return () => { globalShow = null } }, [show])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 8 }]}>
        {queue.map((t, index) => (
          <ToastItem key={t.id} toast={t} onHide={hideToast} index={index} />
        ))}
      </View>
    </ToastContext.Provider>
  )
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  toastContainer: {
    position: 'absolute',
    width: SCREEN_WIDTH - 24,
    maxWidth: 400,
  },
  toastGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  contentContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  message: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 17,
  },
  messageOnly: {
    fontSize: 14,
    fontWeight: '500',
  },
  actionButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 6,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  closeButton: {
    padding: 4,
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
})