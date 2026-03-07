'use client';

/**
 * useNextActivityReminder - 15/10/5 minute chime when next activity is about to start
 *
 * Parity with mobile and display page: plays sound + vibration when the next routine block
 * is 15, 10, or 5 minutes away. Used in parent daily program on web.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playNotificationSound } from '@/hooks/useNotificationSound';

const REMINDER_THRESHOLDS = [15, 10, 5] as const;
const CHECK_INTERVAL_MS = 30_000;
const OVERLAY_DURATION_MS = 9000;

export type ReminderEvent = {
  id: string;
  title: string;
  startsAtMs: number;
};

export type ReminderOverlay = {
  threshold: number;
  title: string;
};

export type UseNextActivityReminderOptions = {
  events: ReminderEvent[];
  soundEnabled?: boolean;
  enabled?: boolean;
};

export type UseNextActivityReminderReturn = {
  overlay: ReminderOverlay | null;
  notice: string | null;
  dismissOverlay: () => void;
};

function parseMinutes(value: string | null): number | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function buildReminderEventsFromBlocks(
  blocksByDay: Record<number, Array<{ id: string; title: string; start_time: string | null }>>,
  dateLabel?: string
): ReminderEvent[] {
  const today = dateLabel ? new Date(`${dateLabel}T00:00:00`) : new Date();
  const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
  const dayStart = new Date(today);
  dayStart.setHours(0, 0, 0, 0);
  const dayStartMs = dayStart.getTime();

  const blocks = blocksByDay[dayOfWeek] || [];
  const events: ReminderEvent[] = [];

  for (const block of blocks) {
    const startMinutes = parseMinutes(block.start_time);
    if (startMinutes == null) continue;
    const startsAtMs = dayStartMs + startMinutes * 60 * 1000;
    if (startsAtMs > Date.now()) {
      events.push({
        id: block.id,
        title: block.title || 'Activity',
        startsAtMs,
      });
    }
  }

  return events.sort((a, b) => a.startsAtMs - b.startsAtMs);
}

export function useNextActivityReminder({
  events,
  soundEnabled = true,
  enabled = true,
}: UseNextActivityReminderOptions): UseNextActivityReminderReturn {
  const [overlay, setOverlay] = useState<ReminderOverlay | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const firedKeysRef = useRef<Set<string>>(new Set());

  const [tick, setTick] = useState(0);
  const nextEvent = useMemo(() => events.find((e) => e.startsAtMs > Date.now()) || null, [events, tick]);

  const dismissOverlay = useCallback(() => {
    setOverlay(null);
    setNotice(null);
  }, []);

  useEffect(() => {
    if (!enabled || events.length === 0) return;
    const interval = setInterval(() => setTick((t) => t + 1), CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled, events.length]);

  useEffect(() => {
    if (!enabled || !nextEvent) return;

    const msUntil = nextEvent.startsAtMs - Date.now();
    if (msUntil <= 0 || msUntil > 15 * 60_000) return;

    const threshold = REMINDER_THRESHOLDS.find(
      (min) => msUntil <= min * 60_000 && msUntil > (min - 1) * 60_000
    );
    if (!threshold) return;

    const key = `${nextEvent.id}:${threshold}`;
    if (firedKeysRef.current.has(key)) return;

    firedKeysRef.current.add(key);
    const message = `${threshold}-minute reminder • ${nextEvent.title}`;
    setNotice(message);
    setOverlay({ threshold, title: nextEvent.title });

    if (soundEnabled && typeof window !== 'undefined') {
      try {
        playNotificationSound('notification', { vibrate: true });
      } catch (e) {
        console.warn('[NextActivityReminder] Sound failed:', e);
      }
    }

    const timeout = setTimeout(() => {
      setNotice((curr) => (curr === message ? null : curr));
      setOverlay((curr) => (curr?.title === nextEvent.title && curr?.threshold === threshold ? null : curr));
    }, OVERLAY_DURATION_MS);

    return () => clearTimeout(timeout);
  }, [nextEvent, enabled, soundEnabled, tick]);

  return { overlay, notice, dismissOverlay };
}
