/**
 * useDashAIScroll — Scroll management for Dash AI chat views.
 *
 * Encapsulates:
 * - Cross-platform scrollToBottom (FlashList native + web DOM fallbacks + sentinel)
 * - Near-bottom detection / unread count tracking
 * - Scroll throttling to prevent competing loops
 * - Follow-up scroll cascade for layout-shift resilience
 */

import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';

// ─── Options ────────────────────────────────────────────────

export interface UseDashAIScrollOptions {
  /** Ref to FlashList (or FlatList-compatible) component */
  flashListRef: React.MutableRefObject<any>;
  /** Cached web DOM scroll node (populated by onScroll handler) */
  webScrollNodeRef: React.MutableRefObject<any>;
  /** Ref tracking current messages length (for scrollToIndex) */
  messagesLengthRef: React.MutableRefObject<number>;
}

// ─── Return type ────────────────────────────────────────────

export interface UseDashAIScrollReturn {
  scrollToBottom: (opts?: { animated?: boolean; delay?: number; force?: boolean }) => void;
  isNearBottom: boolean;
  setIsNearBottom: React.Dispatch<React.SetStateAction<boolean>>;
  isNearBottomRef: React.MutableRefObject<boolean>;
  unreadCount: number;
  setUnreadCount: React.Dispatch<React.SetStateAction<number>>;
  bottomScrollRequestId: number;
  setBottomScrollRequestId: React.Dispatch<React.SetStateAction<number>>;
  /** Ref that prevents auto-scroll right after conversation switch */
  initialConversationScrollRef: React.MutableRefObject<string | null>;
  /** Ref tracking forced scroll window */
  forcedBottomUntilRef: React.MutableRefObject<number>;
}

// ─── Hook ───────────────────────────────────────────────────

export function useDashAIScroll(options: UseDashAIScrollOptions): UseDashAIScrollReturn {
  const { flashListRef, webScrollNodeRef, messagesLengthRef } = options;

  const [isNearBottom, setIsNearBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [bottomScrollRequestId, setBottomScrollRequestId] = useState(0);

  const isNearBottomRef = useRef<boolean>(true);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollFollowUpTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const lastAutoScrollAtRef = useRef<number>(0);
  const forcedBottomUntilRef = useRef<number>(0);
  const initialConversationScrollRef = useRef<string | null>(null);

  const scrollToBottom = useCallback(
    (opts?: { animated?: boolean; delay?: number; force?: boolean }) => {
      const delay = opts?.delay ?? 120;
      const animated = opts?.animated ?? true;
      const force = opts?.force ?? false;
      const now = Date.now();

      if (force) {
        forcedBottomUntilRef.current = now + 1800;
        setBottomScrollRequestId((prev) => prev + 1);
      }

      // Prevent competing scroll loops while still allowing explicit user-triggered jumps.
      if (!force && now - lastAutoScrollAtRef.current < (animated ? 180 : 120)) {
        return;
      }

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
      if (scrollFollowUpTimersRef.current.length > 0) {
        scrollFollowUpTimersRef.current.forEach((timer) => clearTimeout(timer));
        scrollFollowUpTimersRef.current = [];
      }

      const performScroll = (animatedPass: boolean) => {
        const list = flashListRef.current;
        if (!list) return;
        const lastIndex = Math.max(0, (messagesLengthRef.current || 1) - 1);
        let didScroll = false;

        if (Platform.OS === 'web') {
          try {
            const scrollNode: any =
              webScrollNodeRef.current ??
              list.getScrollableNode?.() ??
              list.getNativeScrollRef?.() ??
              (list as any)._listRef?.getScrollableNode?.() ??
              (list as any)._listRef?.current?.getScrollableNode?.() ??
              (list as any).rlvRef?.current?._scrollComponent?.getScrollableNode?.() ??
              (list as any).rlvRef?.current?.scrollComponent?.getScrollableNode?.();

            if (scrollNode) {
              if (!webScrollNodeRef.current) webScrollNodeRef.current = scrollNode;
              if (typeof scrollNode.scrollTo === 'function') {
                scrollNode.scrollTo({
                  top: (scrollNode.scrollHeight ?? 0) + 9999,
                  behavior: animatedPass ? 'smooth' : 'auto',
                });
                didScroll = true;
              } else if (typeof scrollNode.scrollTop === 'number') {
                scrollNode.scrollTop = (scrollNode.scrollHeight ?? 0) + 9999;
                didScroll = true;
              }
            }

            if (!didScroll) {
              const sentinel =
                typeof document !== 'undefined'
                  ? document.getElementById('dash-scroll-sentinel')
                  : null;
              if (sentinel) {
                sentinel.scrollIntoView({
                  behavior: animatedPass ? 'smooth' : 'auto',
                  block: 'end',
                });
                didScroll = true;
              }
            }
          } catch {
            // Web DOM scroll failed — fall through
          }

          if (!didScroll) {
            try {
              list.scrollToEnd?.({ animated: animatedPass });
              didScroll = true;
            } catch {
              // ignore
            }
          }

          if (didScroll) lastAutoScrollAtRef.current = Date.now();
          return;
        }

        // Native scroll strategies
        try {
          if (typeof list.scrollToEnd === 'function') {
            list.scrollToEnd({ animated: animatedPass });
            didScroll = true;
          }
        } catch {
          // ignore
        }
        try {
          if (typeof list.scrollToOffset === 'function') {
            list.scrollToOffset({ offset: 999999, animated: false });
            didScroll = true;
          }
        } catch {
          // ignore
        }
        try {
          if (typeof list.scrollToIndex === 'function') {
            list.scrollToIndex({ index: lastIndex, animated: false, viewPosition: 1 });
            didScroll = true;
          }
        } catch {
          // ignore
        }

        if (didScroll) {
          lastAutoScrollAtRef.current = Date.now();
        }
      };

      const queueFollowUpScroll = (timeoutMs: number) => {
        const timer = setTimeout(() => {
          requestAnimationFrame(() => {
            performScroll(false);
          });
        }, timeoutMs);
        scrollFollowUpTimersRef.current.push(timer);
      };

      if (delay <= 0 || force) {
        requestAnimationFrame(() => {
          performScroll(animated);
        });
        queueFollowUpScroll(force ? 90 : 140);
        queueFollowUpScroll(force ? 240 : 320);
        if (force) {
          queueFollowUpScroll(520);
          queueFollowUpScroll(900);
        }
        return;
      }

      scrollTimeoutRef.current = setTimeout(() => {
        requestAnimationFrame(() => {
          performScroll(animated);
        });
        queueFollowUpScroll(animated ? 180 : 110);
        queueFollowUpScroll(animated ? 360 : 240);
      }, delay);
    },
    [flashListRef, webScrollNodeRef, messagesLengthRef],
  );

  return {
    scrollToBottom,
    isNearBottom,
    setIsNearBottom,
    isNearBottomRef,
    unreadCount,
    setUnreadCount,
    bottomScrollRequestId,
    setBottomScrollRequestId,
    initialConversationScrollRef,
    forcedBottomUntilRef,
  };
}
