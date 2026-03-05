/**
 * CountdownTimer — Visual countdown for movement/timed activity rounds
 *
 * Features:
 * - Circular progress ring that drains as time passes
 * - Large second display with pulse at 3-2-1
 * - Calls onComplete when timer hits zero
 * - Calls onTick with remaining seconds
 * - Pause/resume via `paused` prop
 *
 * ≤200 lines (WARP.md compliant)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';

interface CountdownTimerProps {
  /** Total seconds for countdown */
  durationSeconds: number;
  /** Called when countdown reaches zero */
  onComplete: () => void;
  /** Called each second with remaining time */
  onTick?: (remaining: number) => void;
  /** Called at 3, 2, 1 for sound effects */
  onFinalCountdown?: (remaining: number) => void;
  /** Pause the timer */
  paused?: boolean;
  /** Color of the progress ring */
  color?: string;
  /** Size of the timer circle */
  size?: number;
}

export function CountdownTimer({
  durationSeconds,
  onComplete,
  onTick,
  onFinalCountdown,
  paused = false,
  color = '#6D28D9',
  size = 140,
}: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(durationSeconds);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ringProgress = useRef(new Animated.Value(1)).current;
  const completedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Reset on duration change
  useEffect(() => {
    setRemaining(durationSeconds);
    ringProgress.setValue(1);
    completedRef.current = false;
  }, [durationSeconds]);

  // Tick logic
  useEffect(() => {
    if (paused || completedRef.current) return;

    const interval = setInterval(() => {
      if (!mountedRef.current) return;
      setRemaining((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(interval);
          if (!completedRef.current) {
            completedRef.current = true;
            onComplete();
          }
          return 0;
        }
        onTick?.(next);
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [paused, durationSeconds, onComplete, onTick]);

  // Animate ring
  useEffect(() => {
    if (paused) return;
    const fraction = remaining / durationSeconds;
    Animated.timing(ringProgress, {
      toValue: fraction,
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [remaining, paused, durationSeconds]);

  // Pulse at 3-2-1
  useEffect(() => {
    if (remaining <= 3 && remaining > 0) {
      onFinalCountdown?.(remaining);
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.25, duration: 150, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [remaining]);

  const progress = remaining / durationSeconds;
  const isUrgent = remaining <= 3 && remaining > 0;
  const ringColor = isUrgent ? '#EF4444' : color;

  // Simple ring using border trick (avoids SVG dependency)
  const borderWidth = 8;
  const innerSize = size - borderWidth * 2;

  const ringOpacity = ringProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 1],
  });

  return (
    <View style={[s.container, { width: size, height: size }]}>
      {/* Background ring */}
      <View
        style={[
          s.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth,
            borderColor: 'rgba(0,0,0,0.08)',
          },
        ]}
      />
      {/* Foreground ring (animated opacity) */}
      <Animated.View
        style={[
          s.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth,
            borderColor: ringColor,
            opacity: ringOpacity,
          },
        ]}
      />
      {/* Center content */}
      <Animated.View
        style={[
          s.center,
          {
            width: innerSize,
            height: innerSize,
            borderRadius: innerSize / 2,
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        <Text style={[s.timeText, isUrgent && s.timeTextUrgent]}>
          {remaining}
        </Text>
        <Text style={s.label}>
          {remaining === 0 ? 'Done!' : 'seconds'}
        </Text>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  ring: {
    position: 'absolute',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  timeText: {
    fontSize: 48,
    fontWeight: '900',
    color: '#1E293B',
  },
  timeTextUrgent: {
    color: '#EF4444',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: -2,
  },
});
