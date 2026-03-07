/**
 * Notification Badge Manager
 * 
 * Manages the PWA app icon badge (the red dot/counter on the app icon)
 * Uses the Badging API: https://developer.mozilla.org/en-US/docs/Web/API/Badging_API
 * 
 * This enables showing unread notification counts on the app icon
 * similar to WhatsApp, Messages, etc.
 */

/**
 * Check if the Badging API is supported
 */
export function isBadgingSupported(): boolean {
  return typeof navigator !== 'undefined' && 'setAppBadge' in navigator;
}

/**
 * Set the app badge count
 * @param count - Number to display on badge. If 0, badge is cleared.
 */
export async function setAppBadge(count: number): Promise<boolean> {
  if (!isBadgingSupported()) {
    console.warn('[Badge] Badging API not supported');
    return false;
  }

  try {
    if (count > 0) {
      await (navigator as any).setAppBadge(count);
      console.log(`[Badge] Set badge count to ${count}`);
    } else {
      await (navigator as any).clearAppBadge();
      console.log('[Badge] Cleared badge');
    }
    return true;
  } catch (error) {
    console.error('[Badge] Failed to set badge:', error);
    return false;
  }
}

/**
 * Clear the app badge
 */
export async function clearAppBadge(): Promise<boolean> {
  return setAppBadge(0);
}

/**
 * Set badge with just a notification dot (no count)
 */
export async function setAppBadgeDot(): Promise<boolean> {
  if (!isBadgingSupported()) {
    console.warn('[Badge] Badging API not supported');
    return false;
  }

  try {
    // Calling setAppBadge() without arguments shows a dot
    await (navigator as any).setAppBadge();
    console.log('[Badge] Set badge dot');
    return true;
  } catch (error) {
    console.error('[Badge] Failed to set badge dot:', error);
    return false;
  }
}

/**
 * Badge Manager class for managing badge state with automatic syncing
 */
export class BadgeManager {
  private static instance: BadgeManager;
  private unreadMessages = 0;
  private unreadNotifications = 0;
  private unreadCalls = 0;
  private upcomingEvents = 0;

  private constructor() {}

  static getInstance(): BadgeManager {
    if (!BadgeManager.instance) {
      BadgeManager.instance = new BadgeManager();
    }
    return BadgeManager.instance;
  }

  /**
   * Update the message count
   */
  setUnreadMessages(count: number): void {
    this.unreadMessages = Math.max(0, count);
    this.updateBadge();
  }

  /**
   * Update the notification count
   */
  setUnreadNotifications(count: number): void {
    this.unreadNotifications = Math.max(0, count);
    this.updateBadge();
  }

  /**
   * Update missed calls count
   */
  setMissedCalls(count: number): void {
    this.unreadCalls = Math.max(0, count);
    this.updateBadge();
  }

  /**
   * Update upcoming events count (within next 24 hours)
   */
  setUpcomingEvents(count: number): void {
    this.upcomingEvents = Math.max(0, count);
    this.updateBadge();
  }

  /**
   * Increment message count
   */
  incrementMessages(): void {
    this.unreadMessages++;
    this.updateBadge();
  }

  /**
   * Increment notification count
   */
  incrementNotifications(): void {
    this.unreadNotifications++;
    this.updateBadge();
  }

  /**
   * Get total unread count
   */
  getTotalUnread(): number {
    return this.unreadMessages + this.unreadNotifications + this.unreadCalls + this.upcomingEvents;
  }

  /**
   * Update the badge with current total
   */
  private async updateBadge(): Promise<void> {
    const total = this.getTotalUnread();
    await setAppBadge(total);
  }

  /**
   * Clear all counts and badge
   */
  async clearAll(): Promise<void> {
    this.unreadMessages = 0;
    this.unreadNotifications = 0;
    this.unreadCalls = 0;
    this.upcomingEvents = 0;
    await clearAppBadge();
  }

  /**
   * Sync badge with database counts
   */
  async syncWithDatabase(counts: {
    unreadMessages?: number;
    unreadNotifications?: number;
    missedCalls?: number;
    upcomingEvents?: number;
  }): Promise<void> {
    if (counts.unreadMessages !== undefined) {
      this.unreadMessages = counts.unreadMessages;
    }
    if (counts.unreadNotifications !== undefined) {
      this.unreadNotifications = counts.unreadNotifications;
    }
    if (counts.missedCalls !== undefined) {
      this.unreadCalls = counts.missedCalls;
    }
    if (counts.upcomingEvents !== undefined) {
      this.upcomingEvents = counts.upcomingEvents;
    }
    await this.updateBadge();
  }
}

// Export singleton instance
export const badgeManager = BadgeManager.getInstance();
