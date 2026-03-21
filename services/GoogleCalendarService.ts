/**
 * Google Calendar Integration Service
 * 
 * Provides seamless integration with Google Calendar API for:
 * - Creating/updating/deleting calendar events
 * - Syncing school events to teacher/parent calendars
 * - Scheduling parent meetings via voice commands
 * - Bidirectional sync with EduDash events
 */

import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CalendarEvent {
  id?: string;
  title: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  attendees?: string[]; // Email addresses
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{
      method: 'email' | 'popup';
      minutes: number;
    }>;
  };
  color?: string; // Google Calendar color ID
  visibility?: 'default' | 'public' | 'private';
  recurrence?: string[]; // RRULE format
  metadata?: {
    preschoolId?: string;
    eventType?: 'parent_meeting' | 'school_event' | 'class_activity' | 'staff_meeting';
    linkedInternalEventId?: string;
  };
}

export interface OAuthToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
}

export interface CalendarSyncStatus {
  lastSyncedAt: Date;
  totalEventsSynced: number;
  pendingSync: number;
  errors: Array<{
    eventId: string;
    error: string;
    timestamp: Date;
  }>;
}

/**
 * GoogleCalendarService interface for dependency injection
 */
export interface IGoogleCalendarService {
  initiateOAuthFlow(userId: string, preschoolId: string): Promise<string>;
  completeOAuthFlow(userId: string, authorizationCode: string, state: string): Promise<{ success: boolean; error?: string }>;
  disconnectAccount(userId: string): Promise<{ success: boolean; error?: string }>;
  isConnected(userId: string): Promise<boolean>;
  dispose(): void;
}

/**
 * Google Calendar Service
 */
export class GoogleCalendarService implements IGoogleCalendarService {
  private readonly GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
  private readonly REQUIRED_SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
  ];

  /**
   * Initialize Google Calendar OAuth flow
   * Returns authorization URL for user to grant permissions
   */
  public async initiateOAuthFlow(userId: string, preschoolId: string): Promise<string> {
    try {
      const supabase = await assertSupabase();
      
      // Generate state parameter for security
      const state = btoa(JSON.stringify({
        userId,
        preschoolId,
        timestamp: Date.now(),
        nonce: Math.random().toString(36).substring(7),
      }));

      // Store state in AsyncStorage for verification after redirect
      await AsyncStorage.setItem(`oauth_state_${userId}`, state);

      const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
      const redirectUri = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI;

      if (!clientId || !redirectUri) {
        throw new Error('Google OAuth credentials not configured');
      }

      // Build Google OAuth authorization URL
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', this.REQUIRED_SCOPES.join(' '));
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('access_type', 'offline'); // For refresh token
      authUrl.searchParams.set('prompt', 'consent'); // Force consent screen

      return authUrl.toString();
    } catch (error) {
      console.error('[GoogleCalendar] Failed to initiate OAuth flow:', error);
      throw error;
    }
  }

  /**
   * Complete OAuth flow after user authorization
   * Exchange authorization code for access/refresh tokens
   */
  public async completeOAuthFlow(
    userId: string,
    authorizationCode: string,
    state: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const supabase = await assertSupabase();

      // Verify state parameter
      const storedState = await AsyncStorage.getItem(`oauth_state_${userId}`);
      if (storedState !== state) {
        throw new Error('Invalid OAuth state - possible CSRF attack');
      }

      // Exchange code for tokens
      const tokenResponse = await this.exchangeCodeForTokens(authorizationCode);

      // Store tokens in database
      const { error: dbError } = await supabase.from('oauth_tokens').upsert({
        user_id: userId,
        provider: 'google',
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        token_type: tokenResponse.token_type,
        expires_at: new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString(),
        scopes: this.REQUIRED_SCOPES,
        last_used_at: new Date().toISOString(),
      });

      if (dbError) {
        throw dbError;
      }

      // Log successful connection
      await this.logAuditEvent(userId, 'oauth_connected', {
        provider: 'google',
        scopes: this.REQUIRED_SCOPES,
      });

      // Clean up state
      await AsyncStorage.removeItem(`oauth_state_${userId}`);

      return { success: true };
    } catch (error) {
      console.error('[GoogleCalendar] Failed to complete OAuth flow:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OAuth flow failed',
      };
    }
  }

  /**
   * Exchange authorization code for access/refresh tokens
   */
  private async exchangeCodeForTokens(code: string): Promise<any> {
    const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Google OAuth credentials not configured');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Token exchange failed: ${error.error_description || error.error}`);
    }

    return response.json();
  }

  /**
   * Get valid access token (refresh if expired)
   */
  private async getValidToken(userId: string): Promise<string> {
    const supabase = await assertSupabase();

    // Fetch token from database
    const { data: tokenData, error } = await supabase
      .from('oauth_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .single();

    if (error || !tokenData) {
      throw new Error('No Google Calendar connection found. Please connect your account.');
    }

    // Check if token is expired (with 5-minute buffer)
    const expiresAt = new Date(tokenData.expires_at);
    const now = new Date();
    const bufferTime = 5 * 60 * 1000; // 5 minutes

    if (expiresAt.getTime() - now.getTime() > bufferTime) {
      // Token still valid
      return tokenData.access_token;
    }

    // Token expired or expiring soon - refresh it
    logger.info('GoogleCalendar', 'Refreshing expired token...');
    const newTokens = await this.refreshAccessToken(tokenData.refresh_token);

    // Update database with new tokens
    await supabase
      .from('oauth_tokens')
      .update({
        access_token: newTokens.access_token,
        expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
        last_used_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', 'google');

    return newTokens.access_token;
  }

  /**
   * Refresh OAuth access token using refresh token
   */
  private async refreshAccessToken(refreshToken: string): Promise<any> {
    const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth credentials not configured');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Token refresh failed: ${error.error_description || error.error}`);
    }

    return response.json();
  }

  /**
   * Create calendar event
   */
  public async createEvent(
    userId: string,
    event: CalendarEvent
  ): Promise<{ success: boolean; eventId?: string; error?: string }> {
    try {
      const supabase = await assertSupabase();
      const accessToken = await this.getValidToken(userId);

      // Build Google Calendar event object
      const googleEvent = {
        summary: event.title,
        description: event.description,
        location: event.location,
        start: {
          dateTime: event.startTime.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        end: {
          dateTime: event.endTime.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        attendees: event.attendees?.map((email) => ({ email })),
        reminders: event.reminders,
        colorId: event.color,
        visibility: event.visibility || 'default',
        recurrence: event.recurrence,
      };

      // Create event via Google Calendar API
      const response = await fetch(
        `${this.GOOGLE_CALENDAR_API_BASE}/calendars/primary/events`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(googleEvent),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Calendar API error: ${error.error?.message || 'Unknown error'}`);
      }

      const createdEvent = await response.json();

      // Save mapping to database
      await supabase.from('calendar_event_mappings').insert({
        preschool_id: event.metadata?.preschoolId,
        internal_event_id: event.metadata?.linkedInternalEventId,
        provider: 'google',
        external_event_id: createdEvent.id,
        external_calendar_id: 'primary',
        created_by_user_id: userId,
        sync_direction: 'to_external',
      });

      // Log audit event
      await this.logAuditEvent(userId, 'create_event', {
        eventId: createdEvent.id,
        eventTitle: event.title,
        startTime: event.startTime,
      });

      return { success: true, eventId: createdEvent.id };
    } catch (error) {
      console.error('[GoogleCalendar] Failed to create event:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create event',
      };
    }
  }

  /**
   * Update existing calendar event
   */
  public async updateEvent(
    userId: string,
    eventId: string,
    updates: Partial<CalendarEvent>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const accessToken = await this.getValidToken(userId);

      // Build update payload
      const updatePayload: any = {};
      if (updates.title) updatePayload.summary = updates.title;
      if (updates.description) updatePayload.description = updates.description;
      if (updates.location) updatePayload.location = updates.location;
      if (updates.startTime) {
        updatePayload.start = {
          dateTime: updates.startTime.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      }
      if (updates.endTime) {
        updatePayload.end = {
          dateTime: updates.endTime.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      }
      if (updates.attendees) {
        updatePayload.attendees = updates.attendees.map((email) => ({ email }));
      }

      // Update event via API
      const response = await fetch(
        `${this.GOOGLE_CALENDAR_API_BASE}/calendars/primary/events/${eventId}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatePayload),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Calendar API error: ${error.error?.message || 'Unknown error'}`);
      }

      await this.logAuditEvent(userId, 'update_event', {
        eventId,
        updates: Object.keys(updates),
      });

      return { success: true };
    } catch (error) {
      console.error('[GoogleCalendar] Failed to update event:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update event',
      };
    }
  }

  /**
   * Delete calendar event
   */
  public async deleteEvent(
    userId: string,
    eventId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const supabase = await assertSupabase();
      const accessToken = await this.getValidToken(userId);

      // Delete event via API
      const response = await fetch(
        `${this.GOOGLE_CALENDAR_API_BASE}/calendars/primary/events/${eventId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok && response.status !== 410) {
        // 410 = already deleted
        const error = await response.json();
        throw new Error(`Calendar API error: ${error.error?.message || 'Unknown error'}`);
      }

      // Remove mapping from database
      await supabase
        .from('calendar_event_mappings')
        .delete()
        .eq('external_event_id', eventId)
        .eq('provider', 'google');

      await this.logAuditEvent(userId, 'delete_event', { eventId });

      return { success: true };
    } catch (error) {
      console.error('[GoogleCalendar] Failed to delete event:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete event',
      };
    }
  }

  /**
   * List upcoming calendar events
   */
  public async listEvents(
    userId: string,
    options?: {
      maxResults?: number;
      timeMin?: Date;
      timeMax?: Date;
    }
  ): Promise<{ success: boolean; events?: any[]; error?: string }> {
    try {
      const accessToken = await this.getValidToken(userId);

      const url = new URL(`${this.GOOGLE_CALENDAR_API_BASE}/calendars/primary/events`);
      url.searchParams.set('orderBy', 'startTime');
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('maxResults', (options?.maxResults || 50).toString());
      url.searchParams.set(
        'timeMin',
        (options?.timeMin || new Date()).toISOString()
      );
      if (options?.timeMax) {
        url.searchParams.set('timeMax', options.timeMax.toISOString());
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Calendar API error: ${error.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      return { success: true, events: data.items || [] };
    } catch (error) {
      console.error('[GoogleCalendar] Failed to list events:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list events',
      };
    }
  }

  /**
   * Disconnect Google Calendar integration
   */
  public async disconnectAccount(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const supabase = await assertSupabase();

      // Revoke tokens
      const { data: tokenData } = await supabase
        .from('oauth_tokens')
        .select('access_token')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .single();

      if (tokenData?.access_token) {
        // Revoke token via Google
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${tokenData.access_token}`,
          { method: 'POST' }
        );
      }

      // Delete tokens from database
      await supabase
        .from('oauth_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('provider', 'google');

      await this.logAuditEvent(userId, 'oauth_disconnected', { provider: 'google' });

      return { success: true };
    } catch (error) {
      console.error('[GoogleCalendar] Failed to disconnect account:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to disconnect account',
      };
    }
  }

  /**
   * Check if user has connected Google Calendar
   */
  public async isConnected(userId: string): Promise<boolean> {
    try {
      const supabase = await assertSupabase();
      const { data, error } = await supabase
        .from('oauth_tokens')
        .select('id')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .single();

      return !error && !!data;
    } catch {
      return false;
    }
  }

  /**
   * Log audit event for compliance and debugging
   */
  private async logAuditEvent(
    userId: string,
    action: string,
    payload: any
  ): Promise<void> {
    try {
      const supabase = await assertSupabase();
      // Best-effort: fetch preschool_id to satisfy future/stricter RLS checks
      let preschoolId: string | null = null;
      try {
        const { data: me } = await supabase
          .from('profiles')
          .select('preschool_id, organization_id')
          .eq('id', userId)
          .maybeSingle();
        preschoolId = (me as any)?.preschool_id || (me as any)?.organization_id || null;
      } catch { /* Intentional: non-fatal */ }

      await supabase.from('integration_audit_log').insert({
        integration_type: 'google_calendar',
        action,
        user_id: userId,
        preschool_id: preschoolId,
        request_payload: payload,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });
    } catch (error) {
      // Don't throw - audit logging is non-critical
      console.error('[GoogleCalendar] Failed to log audit event:', error);
    }
  }

  /**
   * Dispose method for cleanup
   */
  dispose(): void {
    // Cleanup if needed
  }
}

