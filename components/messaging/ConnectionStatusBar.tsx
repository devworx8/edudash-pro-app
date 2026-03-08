/**
 * ConnectionStatusBar — thin animated bar shown at the top of chat when
 * the Supabase Realtime connection is degraded or lost.
 *
 * States:
 *  - connected / connecting → hidden (no bar)
 *  - reconnecting / disconnected (sustained for 2.5s) → red bar with offline message
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRealtimeConnectionState, type ConnectionState } from '@/hooks/messaging/useRealtimeConnectionState';

interface ConnectionStatusBarProps {
  /** Override internal hook state (for testing / storybook) */
  overrideState?: ConnectionState;
}

const BAR_HEIGHT = 28;
const DEGRADED_STATE_DELAY_MS = 2500;

export const ConnectionStatusBar: React.FC<ConnectionStatusBarProps> = React.memo(({ overrideState }) => {
  const { state: hookState } = useRealtimeConnectionState();
  const state = overrideState ?? hookState;
  const heightAnim = useRef(new Animated.Value(0)).current;
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showDegradedState, setShowDegradedState] = useState(false);

  const isDegraded = state === 'disconnected' || state === 'reconnecting';
  const visible = showDegradedState && isDegraded;

  useEffect(() => {
    if (delayTimerRef.current) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }

    if (!isDegraded) {
      setShowDegradedState(false);
      return;
    }

    if (showDegradedState) {
      return;
    }

    delayTimerRef.current = setTimeout(() => {
      setShowDegradedState(true);
    }, DEGRADED_STATE_DELAY_MS);

    return () => {
      if (delayTimerRef.current) {
        clearTimeout(delayTimerRef.current);
        delayTimerRef.current = null;
      }
    };
  }, [isDegraded, showDegradedState]);

  useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: visible ? BAR_HEIGHT : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [visible, heightAnim]);

  if (!visible) {
    return <Animated.View style={{ height: heightAnim }} />;
  }

  const bgColor = '#dc2626';
  const icon = 'cloud-offline-outline';
  const label = 'No connection. Messages will be sent when you\u2019re back online.';

  return (
    <Animated.View style={[styles.bar, { height: heightAnim, backgroundColor: bgColor }]}>
      <View style={styles.inner}>
        <Ionicons name={icon} size={14} color="#fff" />
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  bar: {
    overflow: 'hidden',
    justifyContent: 'center',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 6,
  },
  label: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
