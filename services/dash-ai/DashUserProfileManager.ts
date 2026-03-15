/**
 * DashUserProfileManager
 * 
 * Manages user profiles, preferences, and personalization for Dash AI:
 * - User profile CRUD
 * - Language preferences (UI & voice)
 * - Communication style settings
 * - Interaction patterns tracking
 * - Goal management
 * 
 * Design principles:
 * - Persistent storage with AsyncStorage/SecureStore
 * - Role-based personalization
 * - Privacy-respecting (no PII in profiles)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { DashUserProfile, DashPersonality } from './types';

// Dynamically import SecureStore for cross-platform compatibility
let SecureStore: any = null;
try {
  if (Platform.OS !== 'web') {
    SecureStore = require('expo-secure-store');
  }
} catch (e) {
  console.debug(
    '[DashProfile] SecureStore import failed (web or unsupported platform)',
    e
  );
}

/**
 * User profile manager configuration
 */
export interface UserProfileManagerConfig {
  /** Storage key for user profile */
  userProfileKey?: string;
  /** Whether to use SecureStore */
  useSecureStorage?: boolean;
  /** Current user session data */
  currentUser?: {
    id: string;
    role: string;
    name?: string;
    organizationId?: string;
    /** Organization type for context-aware AI persona */
    organizationType?: string;
    /** User's age group for content adaptation */
    ageGroup?: 'child' | 'teen' | 'adult';
    /** Date of birth for age calculation */
    dateOfBirth?: string;
  };
}

/**
 * DashUserProfileManager
 * Manages user profiles and preferences
 */
export class DashUserProfileManager {
  private config: UserProfileManagerConfig;
  private userProfile: DashUserProfile | null = null;

  constructor(config: UserProfileManagerConfig = {}) {
    this.config = {
      userProfileKey: config.userProfileKey || 'dash_user_profile',
      useSecureStorage: config.useSecureStorage ?? true,
      ...config,
    };
  }

  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  /**
   * Initialize and load user profile
   */
  public async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.isInitialized) {
      return Promise.resolve();
    }

    // If initialization is in progress, return the existing promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start new initialization
    this.initializationPromise = this._doInitialize();
    return this.initializationPromise;
  }

  private async _doInitialize(): Promise<void> {
    try {
      await this.loadUserProfile();
      this.isInitialized = true;
      console.log(
        `[DashProfile] Initialized user profile for ${this.userProfile?.role || 'unknown'}`
      );
    } catch (error) {
      this.isInitialized = false;
      this.initializationPromise = null;
      console.error('[DashProfile] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Load user profile from storage
   */
  private async loadUserProfile(): Promise<void> {
    try {
      const storage = this.getStorage();
      const profileData = await storage.getItem(this.config.userProfileKey!);

      if (profileData) {
        this.userProfile = JSON.parse(profileData);
        console.log(
          `[DashProfile] Loaded user profile for ${this.userProfile?.role || 'unknown'}`
        );
      } else {
        // Create basic profile from current user
        await this.createDefaultProfile();
      }
    } catch (error) {
      console.error('[DashProfile] Failed to load user profile:', error);
    }
  }

  /**
   * Create default profile from current user
   */
  private async createDefaultProfile(): Promise<void> {
    if (!this.config.currentUser) {
      return;
    }

    this.userProfile = {
      userId: this.config.currentUser.id,
      role: this.config.currentUser.role as any,
      name: this.config.currentUser.name || '',
      preferences: {
        communication_style: 'friendly',
        notification_frequency: 'daily_digest',
        task_management_style: 'summary',
        ai_autonomy_level: 'medium',
      },
      context: {
        organization_id: this.config.currentUser.organizationId,
        organization_type: this.config.currentUser.organizationType,
        age_group: this.config.currentUser.ageGroup,
      },
      goals: {
        short_term: [],
        long_term: [],
        completed: [],
      },
      interaction_patterns: {
        most_active_times: [],
        preferred_task_types: [],
        common_requests: [],
        success_metrics: {},
      },
      memory_preferences: {
        remember_personal_details: true,
        remember_work_patterns: true,
        remember_preferences: true,
        auto_suggest_tasks: true,
        proactive_reminders: true,
      },
    };

    await this.saveUserProfile();
  }

  /**
   * Save user profile to storage
   */
  private async saveUserProfile(): Promise<void> {
    if (!this.userProfile) return;

    try {
      const storage = this.getStorage();
      await storage.setItem(
        this.config.userProfileKey!,
        JSON.stringify(this.userProfile)
      );
    } catch (error) {
      console.error('[DashProfile] Failed to save user profile:', error);
    }
  }

  /**
   * Get storage backend
   */
  private getStorage(): any {
    return this.config.useSecureStorage && SecureStore
      ? SecureStore
      : AsyncStorage;
  }

  /**
   * Get user profile
   */
  public getUserProfile(): DashUserProfile | null {
    return this.userProfile;
  }

  /**
   * Update user preferences
   */
  public async updatePreferences(
    preferences: Partial<DashUserProfile['preferences']>
  ): Promise<void> {
    if (!this.userProfile) return;

    this.userProfile.preferences = {
      ...this.userProfile.preferences,
      ...preferences,
    };

    await this.saveUserProfile();
    console.log('[DashProfile] Updated user preferences');
  }

  /**
   * Set language preference (for both UI and voice)
   */
  public async setLanguage(language: string): Promise<void> {
    if (!this.userProfile) return;

    // Update context with language preference
    if (!this.userProfile.context) {
      this.userProfile.context = {};
    }

    this.userProfile.context.preferred_language = language;
    await this.saveUserProfile();
    
    console.log(`[DashProfile] Set language to: ${language}`);
  }

  /**
   * Update user context (age group, grade levels, organization type, etc.)
   */
  public async updateContext(
    contextUpdates: Partial<DashUserProfile['context']> & Record<string, any>
  ): Promise<void> {
    if (!this.userProfile) return;

    if (!this.userProfile.context) {
      this.userProfile.context = {};
    }

    Object.entries(contextUpdates).forEach(([key, value]) => {
      if (value === null) {
        delete (this.userProfile as any).context[key];
        return;
      }
      if (typeof value !== 'undefined') {
        (this.userProfile as any).context[key] = value;
      }
    });

    await this.saveUserProfile();
    console.log('[DashProfile] Updated user context');
  }

  /**
   * Get language preference
   */
  public getLanguage(): string | undefined {
    return this.userProfile?.context?.preferred_language as string | undefined;
  }

  /**
   * Track interaction pattern
   */
  public async trackInteraction(type: string, data?: any): Promise<void> {
    if (!this.userProfile) return;

    const timestamp = Date.now();

    // Update most active times
    const hour = new Date(timestamp).getHours();
    const timeSlot = `${hour}:00-${hour + 1}:00`;
    if (!this.userProfile.interaction_patterns.most_active_times.includes(timeSlot)) {
      this.userProfile.interaction_patterns.most_active_times.push(timeSlot);
      // Keep only top 5 most active times
      if (this.userProfile.interaction_patterns.most_active_times.length > 5) {
        this.userProfile.interaction_patterns.most_active_times.shift();
      }
    }

    // Update common requests
    const existingRequest = this.userProfile.interaction_patterns.common_requests.find(
      (r) => r.pattern === type
    );
    if (existingRequest) {
      existingRequest.frequency++;
      existingRequest.last_used = timestamp;
    } else {
      this.userProfile.interaction_patterns.common_requests.push({
        pattern: type,
        frequency: 1,
        last_used: timestamp,
      });
    }

    // Save periodically (not on every interaction)
    if (Math.random() < 0.1) {
      await this.saveUserProfile();
    }
  }

  /**
   * Get personalized greeting based on role + time of day
   */
  public getPersonalizedGreeting(personality: DashPersonality): string {
    const hour = new Date().getHours();
    const timePrefix = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const name = this.userProfile?.name?.split(' ')[0] || '';

    const roleGreeting =
      personality.role_specializations[this.userProfile?.role || '']?.greeting;
    const baseGreeting = roleGreeting || personality.greeting;
    const greeting = name ? `${timePrefix}, ${name}! ${baseGreeting}` : `${timePrefix}! ${baseGreeting}`;
    return greeting;
  }

  /**
   * Get user role
   */
  public getUserRole(): string | undefined {
    return this.userProfile?.role;
  }

  /**
   * Clear user profile (logout/reset)
   */
  public async clearProfile(): Promise<void> {
    try {
      const storage = this.getStorage();
      await storage.removeItem(this.config.userProfileKey!);
      this.userProfile = null;
      console.log('[DashProfile] User profile cleared');
    } catch (error) {
      console.error('[DashProfile] Failed to clear profile:', error);
    }
  }

  /**
   * Get personality settings from user profile
   * Returns settings like strict_language_mode
   */
  public getPersonality(): { strict_language_mode?: boolean } | null {
    if (!this.userProfile?.preferences) {
      return null;
    }
    return {
      strict_language_mode: (this.userProfile.preferences as any).strict_language_mode,
    };
  }

  /**
   * Dispose and clean up resources
   */
  public dispose(): void {
    console.log('[DashProfile] Disposing DashUserProfileManager...');
    
    // Save any pending changes
    if (this.userProfile) {
      this.saveUserProfile().catch((err) =>
        console.error('[DashProfile] Final save failed:', err)
      );
    }

    console.log('[DashProfile] Disposal complete');
  }
}

export default DashUserProfileManager;
