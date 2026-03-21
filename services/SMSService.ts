/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * SMS Integration Service (Twilio/ClickSend)
 * 
 * Provides reliable SMS messaging for:
 * - Bulk parent notifications
 * - Emergency alerts
 * - Individual SMS messages
 * - Delivery status tracking
 * - Opt-out management
 */

import { assertSupabase } from '@/lib/supabase';

export interface SMSMessage {
  id?: string;
  to: string; // E.164 format: +27821234567
  body: string;
  from?: string; // Twilio phone number
  mediaUrls?: string[]; // For MMS
  metadata?: {
    preschoolId?: string;
    eventType?: 'emergency' | 'reminder' | 'notification' | 'marketing';
    campaignId?: string;
    sentBy?: string;
  };
}

export interface BulkSMSOptions {
  preschoolId: string;
  message: string;
  recipientType: 'all_parents' | 'class_parents' | 'custom';
  classId?: string;
  customRecipients?: string[]; // Phone numbers
  senderId?: string; // User sending the bulk SMS
  scheduleAt?: Date; // For scheduled sending
  priority?: 'high' | 'normal' | 'low';
}

export interface SMSDeliveryStatus {
  messageId: string;
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'undelivered';
  to: string;
  sentAt?: Date;
  deliveredAt?: Date;
  error?: {
    code: string;
    message: string;
  };
  cost?: number;
  segments?: number;
}

export interface SMSCampaignResult {
  campaignId: string;
  totalRecipients: number;
  successfulSends: number;
  failedSends: number;
  totalCost: number;
  deliveryRate?: number; // Percentage
  messages: SMSDeliveryStatus[];
}

/**
 * SMSService interface for dependency injection
 */
export interface ISMSService {
  sendSMS(message: SMSMessage, options?: { validateOptOut?: boolean }): Promise<{ success: boolean; messageId?: string; error?: string }>;
  sendBulkSMS(options: BulkSMSOptions): Promise<{ success: boolean; result?: SMSCampaignResult; error?: string }>;
  getDeliveryStatus(messageId: string): Promise<SMSDeliveryStatus | null>;
  updateDeliveryStatus(twilioPayload: any): Promise<void>;
  dispose(): void;
}

/**
 * SMS Service
 */
export class SMSService implements ISMSService {
  private readonly TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';
  private readonly SMS_SEGMENT_LENGTH = 160; // Characters per segment
  private readonly SMS_COST_PER_SEGMENT = 0.4; // ZAR (approximate)

  /**
   * Get Twilio credentials from environment
   */
  private getTwilioCredentials(): {
    accountSid: string;
    authToken: string;
    phoneNumber: string;
  } {
    const accountSid = process.env.EXPO_PUBLIC_TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN; // Server-side only!
    const phoneNumber = process.env.EXPO_PUBLIC_TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !phoneNumber) {
      throw new Error('Twilio credentials not configured');
    }

    return { accountSid, authToken, phoneNumber };
  }

  /**
   * Calculate SMS segments (for cost estimation)
   */
  private calculateSegments(message: string): number {
    // GSM 7-bit encoding: 160 chars per segment (153 for multi-part)
    // UCS-2 encoding (unicode): 70 chars per segment (67 for multi-part)
    const hasUnicode = Array.from(message).some((ch) => (ch.codePointAt(0) || 0) > 0x7f);
    const singleSegmentLimit = hasUnicode ? 70 : 160;
    const multiSegmentLimit = hasUnicode ? 67 : 153;

    if (message.length <= singleSegmentLimit) {
      return 1;
    }

    return Math.ceil(message.length / multiSegmentLimit);
  }

  /**
   * Send individual SMS via Twilio
   */
  public async sendSMS(
    message: SMSMessage,
    options?: { validateOptOut?: boolean }
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const supabase = await assertSupabase();
      const { accountSid, authToken, phoneNumber } = this.getTwilioCredentials();

      // Check opt-out status if requested
      if (options?.validateOptOut && message.metadata?.preschoolId) {
        const isOptedOut = await this.isPhoneOptedOut(
          message.metadata.preschoolId,
          message.to
        );
        if (isOptedOut) {
          return {
            success: false,
            error: 'Recipient has opted out of SMS notifications',
          };
        }
      }

      // Calculate segments and cost
      const segments = this.calculateSegments(message.body);
      const estimatedCost = segments * this.SMS_COST_PER_SEGMENT;

      // Build Twilio request
      const twilioPayload = new URLSearchParams({
        To: message.to,
        From: message.from || phoneNumber,
        Body: message.body,
      });

      // Add media URLs for MMS (if provided)
      if (message.mediaUrls && message.mediaUrls.length > 0) {
        message.mediaUrls.forEach((url, index) => {
          twilioPayload.append(`MediaUrl[${index}]`, url);
        });
      }

      // Send via Twilio API
      const response = await fetch(
        `${this.TWILIO_API_BASE}/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: twilioPayload,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Twilio API error: ${error.message || 'Unknown error'}`);
      }

      const twilioResponse = await response.json();

      // Save to database
      const { error: dbError } = await supabase.from('sms_messages').insert({
        preschool_id: message.metadata?.preschoolId,
        from_number: twilioResponse.from,
        to_number: twilioResponse.to,
        body: message.body,
        status: twilioResponse.status,
        provider: 'twilio',
        provider_message_id: twilioResponse.sid,
        sent_by_user_id: message.metadata?.sentBy,
        sent_at: new Date().toISOString(),
        segments,
        cost_per_segment: this.SMS_COST_PER_SEGMENT,
      });

      if (dbError) {
        console.error('[SMS] Failed to save message to database:', dbError);
      }

      // Log audit event
      await this.logAuditEvent('send_sms', {
        messageId: twilioResponse.sid,
        to: message.to,
        segments,
        cost: estimatedCost,
      });

      return { success: true, messageId: twilioResponse.sid };
    } catch (error) {
      console.error('[SMS] Failed to send SMS:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send SMS',
      };
    }
  }

  /**
   * Send bulk SMS to multiple recipients
   */
  public async sendBulkSMS(
    options: BulkSMSOptions
  ): Promise<{ success: boolean; result?: SMSCampaignResult; error?: string }> {
    try {
      const supabase = await assertSupabase();

      // Get recipients based on type
      const recipients = await this.getRecipients(options);

      if (recipients.length === 0) {
        return {
          success: false,
          error: 'No eligible recipients found',
        };
      }

      // Filter out opted-out numbers
      const activeRecipients = await this.filterOptedOutRecipients(
        options.preschoolId,
        recipients
      );

      console.log(
        `[SMS] Sending bulk SMS to ${activeRecipients.length}/${recipients.length} recipients`
      );

      // Generate campaign ID
      const campaignId = `campaign_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      // Send to all recipients
      const results = await Promise.allSettled(
        activeRecipients.map((phone) =>
          this.sendSMS({
            to: phone,
            body: options.message,
            metadata: {
              preschoolId: options.preschoolId,
              campaignId,
              sentBy: options.senderId,
              eventType: 'notification',
            },
          })
        )
      );

      // Calculate metrics
      const successful = results.filter((r) => r.status === 'fulfilled' && r.value.success);
      const failed = results.filter((r) => r.status === 'rejected' || !r.value.success);
      const segments = this.calculateSegments(options.message);
      const totalCost = successful.length * segments * this.SMS_COST_PER_SEGMENT;

      const campaignResult: SMSCampaignResult = {
        campaignId,
        totalRecipients: recipients.length,
        successfulSends: successful.length,
        failedSends: failed.length,
        totalCost,
        deliveryRate: (successful.length / activeRecipients.length) * 100,
        messages: results.map((r, index) => ({
          messageId: r.status === 'fulfilled' ? r.value.messageId || '' : '',
          status: r.status === 'fulfilled' && r.value.success ? 'sent' : 'failed',
          to: activeRecipients[index],
          sentAt: new Date(),
          error:
            r.status === 'rejected' || !r.value.success
              ? {
                  code: 'SEND_FAILED',
                  message: r.status === 'rejected' ? r.reason : r.value.error || 'Unknown',
                }
              : undefined,
        })),
      };

      await this.logAuditEvent('send_bulk_sms', {
        campaignId,
        preschoolId: options.preschoolId,
        totalRecipients: activeRecipients.length,
        successful: successful.length,
        failed: failed.length,
        totalCost,
      });

      return { success: true, result: campaignResult };
    } catch (error) {
      console.error('[SMS] Failed to send bulk SMS:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send bulk SMS',
      };
    }
  }

  /**
   * Get recipients based on bulk SMS options
   */
  private async getRecipients(options: BulkSMSOptions): Promise<string[]> {
    const supabase = await assertSupabase();

    try {
      if (options.recipientType === 'custom' && options.customRecipients) {
        return options.customRecipients;
      }

      // Fetch recipients
      let data: any[] | null = null;
      let error: any = null;

      if (options.recipientType === 'class_parents' && options.classId) {
        // Parents of students in a specific class (join)
        const res = await supabase
          .from('students')
          .select('parents(phone_number)')
          .eq('class_id', options.classId)
          .not('parents.phone_number', 'is', null);
        data = res.data as any[] | null;
        error = res.error;
      } else {
        // All parents in preschool
        const res = await supabase
          .from('parents')
          .select('phone_number')
          .eq('preschool_id', options.preschoolId)
          .not('phone_number', 'is', null);
        data = res.data as any[] | null;
        error = res.error;
      }

      if (error) {
        console.error('[SMS] Failed to fetch recipients:', error);
        return [];
      }

      const rows = Array.isArray(data) ? data : [];
      // Extract phone numbers from either shape
      const phoneNumbers = rows
        .flatMap((item: any) => {
          if (item.phone_number) return [item.phone_number];
          if (Array.isArray(item.parents)) return item.parents.map((p: any) => p?.phone_number).filter(Boolean);
          if (item.parent?.phone_number) return [item.parent.phone_number];
          return [];
        })
        .filter(Boolean);

      // Deduplicate
      return Array.from(new Set(phoneNumbers));
    } catch (error) {
      console.error('[SMS] Error getting recipients:', error);
      return [];
    }
  }

  /**
   * Filter out opted-out phone numbers
   */
  private async filterOptedOutRecipients(
    preschoolId: string,
    phoneNumbers: string[]
  ): Promise<string[]> {
    const supabase = await assertSupabase();

    try {
      const { data: optOuts } = await supabase
        .from('sms_opt_outs')
        .select('phone_number')
        .eq('preschool_id', preschoolId)
        .is('opted_in_at', null) // Still opted out
        .in('phone_number', phoneNumbers);

      const optedOutNumbers = new Set(optOuts?.map((o) => o.phone_number) || []);

      return phoneNumbers.filter((phone) => !optedOutNumbers.has(phone));
    } catch (error) {
      console.error('[SMS] Error filtering opt-outs:', error);
      return phoneNumbers; // Return all if check fails (safer to send)
    }
  }

  /**
   * Check if phone number has opted out
   */
  private async isPhoneOptedOut(preschoolId: string, phoneNumber: string): Promise<boolean> {
    const supabase = await assertSupabase();

    try {
      const { data } = await supabase
        .from('sms_opt_outs')
        .select('id')
        .eq('preschool_id', preschoolId)
        .eq('phone_number', phoneNumber)
        .is('opted_in_at', null)
        .single();

      return !!data;
    } catch {
      return false; // Assume not opted out if check fails
    }
  }

  /**
   * Handle inbound SMS (from Twilio webhook)
   */
  public async handleInboundSMS(twilioPayload: any): Promise<{
    success: boolean;
    response?: string;
    error?: string;
  }> {
    try {
      const supabase = await assertSupabase();
      const from = twilioPayload.From;
      const body = twilioPayload.Body?.trim() || '';
      const messageSid = twilioPayload.MessageSid;

      console.log(`[SMS] Inbound SMS from ${from}: ${body}`);

      // Check for STOP keyword (opt-out)
      if (/^STOP$/i.test(body)) {
        await this.optOutPhone(from, 'sms_reply');
        return {
          success: true,
          response: "You've been unsubscribed from SMS alerts. Reply START to opt back in.",
        };
      }

      // Check for START keyword (opt-in)
      if (/^START$/i.test(body)) {
        await this.optInPhone(from);
        return {
          success: true,
          response: 'Welcome back! You will now receive SMS alerts from EduDash Pro.',
        };
      }

      // Check for HELP keyword
      if (/^HELP$/i.test(body)) {
        return {
          success: true,
          response:
            'EduDash Pro SMS Service. Reply STOP to unsubscribe. Support: support@edudashpro.app',
        };
      }

      // Otherwise, forward to WhatsApp inbox or create support ticket
      await this.forwardToInbox(from, body, messageSid);

      return {
        success: true,
        response: 'Thank you! Your message has been received.',
      };
    } catch (error) {
      console.error('[SMS] Failed to handle inbound SMS:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process message',
      };
    }
  }

  /**
   * Opt out phone number from SMS
   */
  private async optOutPhone(
    phoneNumber: string,
    method: 'sms_reply' | 'app_settings' | 'admin'
  ): Promise<void> {
    const supabase = await assertSupabase();

    // Find preschool for this phone number
    const { data: parent } = await supabase
      .from('parents')
      .select('preschool_id')
      .eq('phone_number', phoneNumber)
      .single();

    if (!parent) {
      console.warn('[SMS] No parent found for phone:', phoneNumber);
      return;
    }

    await supabase.from('sms_opt_outs').upsert({
      preschool_id: parent.preschool_id,
      phone_number: phoneNumber,
      opt_out_method: method,
      opted_out_at: new Date().toISOString(),
      opted_in_at: null,
    });

    console.log(`[SMS] Phone ${phoneNumber} opted out via ${method}`);
  }

  /**
   * Opt in phone number to SMS (after previous opt-out)
   */
  private async optInPhone(phoneNumber: string): Promise<void> {
    const supabase = await assertSupabase();

    await supabase
      .from('sms_opt_outs')
      .update({ opted_in_at: new Date().toISOString() })
      .eq('phone_number', phoneNumber)
      .is('opted_in_at', null);

    console.log(`[SMS] Phone ${phoneNumber} opted back in`);
  }

  /**
   * Forward inbound SMS to teacher inbox
   */
  private async forwardToInbox(
    from: string,
    body: string,
    messageSid: string
  ): Promise<void> {
    const supabase = await assertSupabase();

    // Find parent for this phone number
    const { data: parent } = await supabase
      .from('parents')
      .select('id, first_name, last_name, preschool_id')
      .eq('phone_number', from)
      .single();

    if (!parent) {
      console.warn('[SMS] No parent found for phone:', from);
      return;
    }

    // Create message in WhatsApp inbox (or create new inbox table for SMS)
    // This allows teachers to see and respond to parent SMS
    const parentName = [parent.first_name, parent.last_name].filter(Boolean).join(' ') || 'Unknown';
    console.log(`[SMS] Forwarding message from ${parentName} to inbox:`, body);

    // TODO: Integrate with existing message/inbox system
  }

  /**
   * Get delivery status for SMS
   */
  public async getDeliveryStatus(messageId: string): Promise<SMSDeliveryStatus | null> {
    try {
      const supabase = await assertSupabase();

      const { data, error } = await supabase
        .from('sms_messages')
        .select('*')
        .eq('provider_message_id', messageId)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        messageId: data.provider_message_id,
        status: data.status,
        to: data.to_number,
        sentAt: data.sent_at ? new Date(data.sent_at) : undefined,
        deliveredAt: data.delivered_at ? new Date(data.delivered_at) : undefined,
        cost: data.total_cost,
        segments: data.segments,
        error: data.error_code
          ? {
              code: data.error_code,
              message: data.error_message,
            }
          : undefined,
      };
    } catch (error) {
      console.error('[SMS] Failed to get delivery status:', error);
      return null;
    }
  }

  /**
   * Update delivery status from Twilio webhook
   */
  public async updateDeliveryStatus(twilioPayload: any): Promise<void> {
    try {
      const supabase = await assertSupabase();
      const messageSid = twilioPayload.MessageSid;
      const status = twilioPayload.MessageStatus;

      await supabase
        .from('sms_messages')
        .update({
          status,
          delivered_at: status === 'delivered' ? new Date().toISOString() : null,
          error_code: twilioPayload.ErrorCode || null,
          error_message: twilioPayload.ErrorMessage || null,
        })
        .eq('provider_message_id', messageSid);

      console.log(`[SMS] Updated delivery status for ${messageSid}: ${status}`);
    } catch (error) {
      console.error('[SMS] Failed to update delivery status:', error);
    }
  }

  /**
   * Log audit event
   */
  private async logAuditEvent(action: string, payload: any): Promise<void> {
    try {
      const supabase = await assertSupabase();
      await supabase.from('integration_audit_log').insert({
        integration_type: 'twilio_sms',
        action,
        preschool_id: payload?.preschoolId || null,
        request_payload: payload,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });
    } catch (error) {
      // Don't throw - audit logging is non-critical
      console.error('[SMS] Failed to log audit event:', error);
    }
  }

  /**
   * Dispose method for cleanup
   */
  dispose(): void {
    // Cleanup if needed
  }
}

