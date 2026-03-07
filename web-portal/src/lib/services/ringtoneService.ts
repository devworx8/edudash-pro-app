// ================================================
// Ringtone Settings Service
// Manages user ringtone preferences with localStorage and Supabase sync
// ================================================

import { createClient } from '@/lib/supabase/client';
import type { RingtonePreferences } from '@/lib/types/ringtone';
import { DEFAULT_RINGTONE_PREFERENCES, getRingtoneUrl } from '@/lib/types/ringtone';

const STORAGE_KEY = 'edudash_ringtone_preferences';

export class RingtoneService {
  private static supabase = createClient();
  private static audioCache = new Map<string, HTMLAudioElement>();

  /**
   * Get user's ringtone preferences (localStorage first, then Supabase)
   */
  static async getRingtonePreferences(): Promise<RingtonePreferences> {
    try {
      // Try localStorage first for instant load
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as RingtonePreferences;
        // Return cached but still sync from server in background
        this.syncFromServer().catch(console.error);
        return parsed;
      }

      // Load from Supabase
      return await this.syncFromServer();
    } catch (error) {
      console.error('Failed to load ringtone preferences:', error);
      return DEFAULT_RINGTONE_PREFERENCES;
    }
  }

  /**
   * Sync preferences from Supabase server
   */
  private static async syncFromServer(): Promise<RingtonePreferences> {
    const { data: user } = await this.supabase.auth.getUser();
    if (!user?.user) {
      return DEFAULT_RINGTONE_PREFERENCES;
    }

    const { data, error } = await this.supabase
      .from('profiles')
      .select('ringtone_preferences')
      .eq('id', user.user.id)
      .single();

    if (error || !data?.ringtone_preferences) {
      return DEFAULT_RINGTONE_PREFERENCES;
    }

    const prefs = data.ringtone_preferences as RingtonePreferences;
    
    // Cache in localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    
    return prefs;
  }

  /**
   * Update user's ringtone preferences
   */
  static async updateRingtonePreferences(
    preferences: Partial<RingtonePreferences>
  ): Promise<RingtonePreferences> {
    try {
      const current = await this.getRingtonePreferences();
      const updated: RingtonePreferences = {
        ...current,
        ...preferences,
        updatedAt: new Date().toISOString(),
      };

      // Update localStorage immediately
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

      // Update Supabase in background
      const { data: user } = await this.supabase.auth.getUser();
      if (user?.user) {
        await this.supabase
          .from('profiles')
          .update({
            ringtone_preferences: updated,
          })
          .eq('id', user.user.id);
      }

      return updated;
    } catch (error) {
      console.error('Failed to update ringtone preferences:', error);
      throw error;
    }
  }

  /**
   * Upload a custom ringtone file to Supabase Storage
   */
  static async uploadCustomRingtone(file: File): Promise<string> {
    try {
      const { data: user } = await this.supabase.auth.getUser();
      if (!user?.user) {
        throw new Error('User not authenticated');
      }

      // Validate file type (audio only)
      if (!file.type.startsWith('audio/')) {
        throw new Error('File must be an audio file');
      }

      // Validate file size (max 5MB)
      const MAX_SIZE = 5 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        throw new Error('File size must be less than 5MB');
      }

      // Generate unique filename
      const ext = file.name.split('.').pop();
      const filename = `${user.user.id}_${Date.now()}.${ext}`;
      const filePath = `ringtones/${filename}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await this.supabase.storage
        .from('user-media')
        .upload(filePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = this.supabase.storage
        .from('user-media')
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Failed to upload custom ringtone:', error);
      throw error;
    }
  }

  /**
   * Delete a custom ringtone from storage
   */
  static async deleteCustomRingtone(url: string): Promise<void> {
    try {
      // Extract path from URL
      const urlObj = new URL(url);
      const path = urlObj.pathname.split('/storage/v1/object/public/user-media/')[1];
      
      if (!path) return;

      await this.supabase.storage
        .from('user-media')
        .remove([path]);
    } catch (error) {
      console.error('Failed to delete custom ringtone:', error);
    }
  }

  /**
   * Preload and cache audio for faster playback
   */
  static async preloadRingtone(type: 'incoming' | 'outgoing'): Promise<HTMLAudioElement | null> {
    try {
      const prefs = await this.getRingtonePreferences();
      const ringtoneType = type === 'incoming' ? prefs.incomingRingtone : prefs.outgoingRingback;
      const customUrl = type === 'incoming' ? prefs.incomingCustomUrl : prefs.outgoingCustomUrl;
      
      const url = getRingtoneUrl(ringtoneType, customUrl);
      if (!url) return null;

      // Check cache first
      if (this.audioCache.has(url)) {
        return this.audioCache.get(url)!;
      }

      // Create and preload audio
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.volume = type === 'incoming' ? prefs.incomingVolume : prefs.outgoingVolume;
      
      // Cache it
      this.audioCache.set(url, audio);
      
      return audio;
    } catch (error) {
      console.error('Failed to preload ringtone:', error);
      return null;
    }
  }

  /**
   * Play a ringtone (with user preferences)
   */
  static async playRingtone(
    type: 'incoming' | 'outgoing',
    options?: { loop?: boolean }
  ): Promise<HTMLAudioElement | null> {
    try {
      console.log(`[RingtoneService] 🔊 Playing ${type} ringtone...`);
      
      const prefs = await this.getRingtonePreferences();
      console.log(`[RingtoneService] Preferences:`, { 
        type: type === 'incoming' ? prefs.incomingRingtone : prefs.outgoingRingback,
        volume: type === 'incoming' ? prefs.incomingVolume : prefs.outgoingVolume 
      });
      
      const audio = await this.preloadRingtone(type);
      
      if (!audio) {
        console.warn('[RingtoneService] No audio element from preload, creating fallback');
        // Create a fallback audio element with default sound
        const fallbackUrl = type === 'incoming' ? '/sounds/ringtone.mp3' : '/sounds/ringback.mp3';
        const fallbackAudio = new Audio(fallbackUrl);
        fallbackAudio.preload = 'auto';
        fallbackAudio.volume = type === 'incoming' ? prefs.incomingVolume : prefs.outgoingVolume;
        fallbackAudio.loop = options?.loop ?? false;
        
        await fallbackAudio.play();
        console.log('[RingtoneService] ✅ Fallback audio playing');
        return fallbackAudio;
      }

      audio.loop = options?.loop ?? false;
      audio.currentTime = 0;
      
      // Handle vibration
      const shouldVibrate = type === 'incoming' ? prefs.vibrateOnIncoming : prefs.vibrateOnOutgoing;
      if (shouldVibrate && 'vibrate' in navigator) {
        try {
          // Vibrate pattern for ringing
          navigator.vibrate([500, 200, 500, 200, 500]);
        } catch (e) {
          // Ignore vibration errors
        }
      }

      await audio.play();
      console.log(`[RingtoneService] ✅ ${type} ringtone playing successfully`);
      return audio;
    } catch (error) {
      console.error(`[RingtoneService] ❌ Failed to play ${type} ringtone:`, error);
      return null;
    }
  }

  /**
   * Stop a ringtone
   */
  static stopRingtone(audio: HTMLAudioElement | null): void {
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    
    // Stop vibration
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch (e) {
        // Ignore
      }
    }
  }

  /**
   * Preview a ringtone (plays once, no loop)
   */
  static async previewRingtone(
    type: string,
    customUrl?: string,
    volume: number = 0.8
  ): Promise<void> {
    try {
      const url = getRingtoneUrl(type as any, customUrl);
      if (!url) return;

      const audio = new Audio(url);
      audio.volume = volume;
      await audio.play();
    } catch (error) {
      console.error('Failed to preview ringtone:', error);
    }
  }

  /**
   * Clear audio cache (useful for cleanup)
   */
  static clearCache(): void {
    this.audioCache.forEach(audio => {
      audio.pause();
      audio.src = '';
    });
    this.audioCache.clear();
  }
}

export default RingtoneService;
