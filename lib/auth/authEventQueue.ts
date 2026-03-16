/**
 * Auth Event Queue
 *
 * Serialises Supabase auth state-change events (SIGNED_IN, SIGNED_OUT,
 * TOKEN_REFRESHED, etc.) so they are processed one-at-a-time in FIFO order.
 *
 * Without this, rapid sign-out-then-sign-in can cause overlapping profile
 * fetches, partial state clears, and stale navigations.
 *
 * Usage (inside AuthContext):
 *   const queue = authEventQueue;
 *   supabase.auth.onAuthStateChange((event, session) => {
 *     queue.enqueue(event, session, async (ev, s) => { ... });
 *   });
 */

import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

type EventHandler = (
  event: AuthChangeEvent,
  session: Session | null
) => Promise<void>;

interface QueueItem {
  event: AuthChangeEvent;
  session: Session | null;
  handler: EventHandler;
  enqueuedAt: number;
}

/** Maximum time (ms) a single handler is allowed to run. */
const HANDLER_TIMEOUT_MS = 30_000;
const MAX_PENDING_EVENTS = 40;

function sessionUserId(session: Session | null): string | null {
  return session?.user?.id ?? null;
}

class AuthEventQueue {
  private queue: QueueItem[] = [];
  private processing = false;

  /**
   * Add an event to the queue and kick off processing if idle.
   */
  enqueue(
    event: AuthChangeEvent,
    session: Session | null,
    handler: EventHandler
  ): void {
    const nextUserId = sessionUserId(session);

    // Collapse redundant SIGNED_OUT — keep only the latest
    if (event === 'SIGNED_OUT') {
      this.queue = this.queue.filter((q) => q.event !== 'SIGNED_OUT' && q.event !== 'TOKEN_REFRESHED');
    }

    // Collapse TOKEN_REFRESHED bursts for the same user. Only latest matters.
    if (event === 'TOKEN_REFRESHED') {
      this.queue = this.queue.filter((q) => {
        if (q.event !== 'TOKEN_REFRESHED') return true;
        const queuedUser = sessionUserId(q.session);
        if (!nextUserId || !queuedUser) return false;
        return queuedUser !== nextUserId;
      });
    }

    // SIGNED_IN supersedes pending TOKEN_REFRESHED/SIGNED_IN for the same user.
    if (event === 'SIGNED_IN') {
      this.queue = this.queue.filter((q) => {
        const queuedUser = sessionUserId(q.session);
        const sameUser = !!nextUserId && !!queuedUser && queuedUser === nextUserId;
        if (!sameUser) return true;
        return q.event !== 'SIGNED_IN' && q.event !== 'TOKEN_REFRESHED';
      });
    }

    // Guardrail: avoid unbounded queue growth under noisy auth emitters.
    if (this.queue.length >= MAX_PENDING_EVENTS) {
      const dropIndex = this.queue.findIndex((item) => item.event === 'TOKEN_REFRESHED');
      if (dropIndex >= 0) {
        this.queue.splice(dropIndex, 1);
      } else {
        this.queue.shift();
      }
      logger.warn('AuthEventQueue', 'Dropped one pending auth event due to queue pressure', {
        pending_after_drop: this.queue.length,
      });
    }

    this.queue.push({ event, session, handler, enqueuedAt: Date.now() });
    this.processNext();
  }

  /** Number of items waiting (including the one currently running). */
  get length(): number {
    return this.queue.length + (this.processing ? 1 : 0);
  }

  /** Discard all pending items (used during forced resets). */
  clear(): void {
    this.queue = [];
  }

  // ── internal ──

  private async processNext(): Promise<void> {
    if (this.processing) return;
    const item = this.queue.shift();
    if (!item) return;

    this.processing = true;
    const label = `${item.event}@${item.enqueuedAt}`;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<void>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`AuthEventQueue: handler timed out (${label})`)),
        HANDLER_TIMEOUT_MS
      );
    });

    try {
      await Promise.race([
        item.handler(item.event, item.session),
        timeoutPromise,
      ]);
    } catch (err) {
      logger.error('AuthEventQueue', `Error processing ${label}:`, err);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      this.processing = false;
      // Process next item (if any)
      if (this.queue.length > 0) {
        // Use microtask to avoid deep recursion
        queueMicrotask(() => this.processNext());
      }
    }
  }
}

/** Singleton queue — shared by AuthContext. */
export const authEventQueue = new AuthEventQueue();
