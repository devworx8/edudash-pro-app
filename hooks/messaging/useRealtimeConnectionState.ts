/**
 * useRealtimeConnectionState — tracks Supabase Realtime WebSocket health.
 *
 * Exposes a reactive connection state for UI consumption (e.g. ConnectionStatusBar).
 * Implements exponential-backoff reconnection when the socket drops.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';

export interface RealtimeConnectionInfo {
  state: ConnectionState;
  lastConnectedAt: number | null;
  reconnectAttempts: number;
}

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

function backoffDelay(attempt: number): number {
  return Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);
}

export function useRealtimeConnectionState(): RealtimeConnectionInfo {
  const [state, setState] = useState<ConnectionState>('connecting');
  const [lastConnectedAt, setLastConnectedAt] = useState<number | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    clearTimer();
    const delay = backoffDelay(attemptsRef.current);
    logger.debug('RealtimeConnection', `Scheduling reconnect in ${delay}ms (attempt ${attemptsRef.current + 1})`);
    setState('reconnecting');

    reconnectTimer.current = setTimeout(() => {
      attemptsRef.current += 1;
      setReconnectAttempts(attemptsRef.current);

      if (!supabase) return;
      try {
        supabase.realtime.connect();
      } catch (err) {
        logger.warn('RealtimeConnection', 'Reconnect attempt failed:', err);
        scheduleReconnect();
      }
    }, delay);
  }, [clearTimer]);

  useEffect(() => {
    if (!supabase) {
      setState('disconnected');
      return;
    }

    const channel = supabase
      .channel('connection-probe')
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setState('connected');
          setLastConnectedAt(Date.now());
          attemptsRef.current = 0;
          setReconnectAttempts(0);
          clearTimer();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setState('disconnected');
          scheduleReconnect();
        } else if (status === 'CLOSED') {
          setState('disconnected');
        }
      });

    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active' && supabase) {
        setState((prev) => (prev === 'connected' ? prev : 'connecting'));
        try {
          supabase.realtime.connect();
        } catch (err) {
          logger.warn('RealtimeConnection', 'Realtime connect on foreground failed:', err);
        }
      }
    };

    const appSub = AppState.addEventListener('change', handleAppState);

    return () => {
      clearTimer();
      appSub.remove();
      supabase.removeChannel(channel);
    };
  }, [clearTimer, scheduleReconnect]);

  return { state, lastConnectedAt, reconnectAttempts };
}
