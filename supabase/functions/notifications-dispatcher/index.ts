// @ts-nocheck - Deno Edge Function with URL imports
/* eslint-disable @typescript-eslint/no-unused-vars */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { renderEduDashProEmail } from "../_shared/edudashproEmail.ts";

// Type definitions for Deno environment
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

// Notification context type
interface NotificationContext {
  sender_name?: string;
  thread_id?: string;
  message_id?: string;
  message_preview?: string;
  announcement_title?: string;
  announcement_preview?: string;
  priority?: string;
  announcement_id?: string;
  assignment_title?: string;
  assignment_id?: string;
  submission_id?: string;
  student_id?: string;
  student_name?: string;
  subject?: string;
  due_text?: string;
  school_name?: string;
  plan_tier?: string;
  amount?: number;
  subscription_id?: string;
  payment_url?: string;
  message?: string;
  plan_name?: string;
  action_required?: string;
  payment_deadline?: string;
  trial_end_text?: string;
  requester_email?: string;
  report_id?: string;
  teacher_name?: string;
  rejection_reason?: string;
  invoice_id?: string;
  invoice_number?: string;
  total_amount?: number;
  due_date?: string;
  status?: string;
  overdue_days?: number;
  invite_code?: string;
  invite_link?: string;
  student_code?: string;
  donation_amount?: number;
  reminder_kind?: string;
  pop_upload_prompt?: string;
  call_id?: string;
  caller_id?: string;
  caller_name?: string;
  call_type?: string;
  meeting_url?: string;
  // School calendar events
  event_id?: string;
  meeting_id?: string;
  excursion_id?: string;
  event_title?: string;
  event_date?: string;
  event_type?: string;
  event_location?: string;
  reminder_offset_days?: number;
  reminder_label?: string;
  target_role?: string;
  // Attendance
  attendance_date?: string;
  attendance_status?: string;
  class_name?: string;
  present_count?: number;
  late_count?: number;
  absent_count?: number;
  total_count?: number;
  // Birthday
  birthday_date?: string;
  age?: number;
  days_until?: number;
  // Child Registration
  child_name?: string;
  parent_name?: string;
  registration_id?: string;
  // POP uploads
  pop_upload_id?: string;
  upload_type?: string;
  payment_amount?: number;
  payment_reference?: string;
  // Job applications
  job_application_id?: string;
  job_posting_id?: string;
  job_title?: string;
  candidate_name?: string;
  candidate_email?: string;
  stage_label?: string;
  interview_date?: string;
  interview_time?: string;
  teacher_name?: string;
  teacher_email?: string;
  // Forms
  form_id?: string;
  form_title?: string;
  form_audience?: string[];
  // Learner inactivity lifecycle
  absence_streak?: number;
  trigger_absence_days?: number;
  grace_days?: number;
  warning_deadline_at?: string;
  warning_deadline_date?: string;
  resolution_reason?: string;
  inactive_on?: string;
  // Build update notifications
  version?: string;
  build_number?: string;
  store_url?: string;
  mandatory?: boolean;
  platform?: string;
}

// Notification template type
interface NotificationTemplate {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string | null;
  badge?: number;
  priority?: string;
  channelId?: string;
  _contentAvailable?: boolean;
  categoryId?: string;
}

// Notification request type
interface NotificationRequest {
  event_type: string;
  user_ids?: string[];
  platform_filter?: Array<'android' | 'ios' | 'web'>;
  role_targets?: string[];
  preschool_id?: string;
  thread_id?: string;
  message_id?: string;
  announcement_id?: string;
  assignment_id?: string;
  student_id?: string;
  report_id?: string;
  invoice_id?: string;
  subscription_id?: string;
  plan_tier?: string;
  call_id?: string;
  caller_id?: string;
  caller_name?: string;
  call_type?: string;
  meeting_url?: string;
  rejection_reason?: string;
  // School calendar events
  event_id?: string;
  meeting_id?: string;
  excursion_id?: string;
  target_audience?: string[] | string;
  // Attendance
  attendance_date?: string;
  student_ids?: string[];
  class_id?: string;
  attendance_status?: string;
  // Child Registration
  registration_id?: string;
  child_name?: string;
  parent_name?: string;
  parent_id?: string;
  // POP uploads
  pop_upload_id?: string;
  upload_type?: string;
  payment_amount?: number;
  payment_reference?: string;
  // Job applications
  job_application_id?: string;
  job_posting_id?: string;
  job_title?: string;
  candidate_name?: string;
  candidate_email?: string;
  teacher_user_id?: string;
  recipient_email?: string;
  recipient_emails?: string[];
  context?: Record<string, unknown>;
  form_id?: string;
  form_title?: string;
  form_audience?: string[];
  // Custom payload
  custom_payload?: Record<string, unknown>;
  template_override?: Partial<NotificationTemplate>;
  send_immediately?: boolean;
  include_email?: boolean;
  test?: boolean;
  target_user_id?: string;
  channel?: string;
  case_id?: string;
  // Build update notifications
  version?: string;
  build_number?: string;
  store_url?: string;
  mandatory?: boolean;
  platform?: string;
  email_template_override?: {
    subject?: string;
    text?: string;
    html?: string;
  };
}

// Push device type
interface PushDevice {
  user_id: string;
  expo_push_token: string;
  fcm_token?: string | null;
  platform?: 'android' | 'ios' | 'web';
  language?: string;
  device_metadata?: Record<string, unknown> | null;
}

// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN');
const WEB_PUSH_URL = Deno.env.get('WEB_PUSH_URL') || Deno.env.get('APP_URL') || '';

// Create Supabase client with service role for bypassing RLS
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

/**
 * Get notification template for different event types
 */
function getNotificationTemplate(eventType: string, context: NotificationContext = {}): NotificationTemplate {
  const templates: Record<string, NotificationTemplate> = {
    new_message: {
      title: "New Message",
      body: context.sender_name ? `${context.sender_name} sent you a message` : "You have a new message",
      data: {
        type: 'message',
        thread_id: context.thread_id,
        threadId: context.thread_id,
        conversation_id: context.thread_id,
        message_id: context.message_id,
        screen: 'messages'
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'messages'
    },
    new_announcement: {
      title: "School Announcement",
      body: context.announcement_title || "New announcement from your school",
      data: {
        type: 'announcement',
        announcement_id: context.announcement_id,
        screen: 'announcements'
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'announcements'
    },
    form_published: {
      title: "New Form Available",
      body: context.form_title ? `${context.form_title} needs your response` : "A new form needs your response",
      data: {
        type: 'form',
        form_id: context.form_id,
        screen: 'forms'
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'forms'
    },
    homework_graded: {
      title: "Homework Graded",
      body: context.assignment_title ? `${context.assignment_title} has been graded` : "Your child's homework has been graded",
      data: {
        type: 'homework',
        assignment_id: context.assignment_id,
        submission_id: context.submission_id,
        student_id: context.student_id,
        screen: 'homework-details'
      },
      sound: 'default',
      badge: 1,
      priority: 'normal',
      channelId: 'homework'
    },
    assignment_due_soon: {
      title: "Assignment Due Soon",
      body: context.assignment_title ? `${context.assignment_title} is due ${context.due_text || 'soon'}` : "You have an assignment due soon",
      data: {
        type: 'homework',
        assignment_id: context.assignment_id,
        screen: 'homework-submit'
      },
      sound: 'default',
      priority: 'normal',
      channelId: 'homework'
    },
    progress_update: {
      title: "Progress Update",
      body: context.student_name ? `${context.student_name}'s progress report is ready` : "New progress update available",
      data: {
        type: 'progress',
        student_id: context.student_id,
        screen: 'progress'
      },
      sound: 'default',
      priority: 'normal',
      channelId: 'progress'
    },
    whatsapp_opt_in: {
      title: "WhatsApp Integration",
      body: "Connect with your school via WhatsApp for instant updates",
      data: {
        type: 'whatsapp',
        action: 'opt_in',
        screen: 'dashboard'
      },
      sound: 'default',
      priority: 'normal',
      channelId: 'general'
    },
    subscription_created: {
      title: 'Subscription Created',
      body: context.school_name ? `A ${context.plan_tier || 'plan'} subscription was created for ${context.school_name}` : `A ${context.plan_tier || 'plan'} subscription was created`,
      data: {
        type: 'billing',
        screen: 'subscriptions',
        plan_tier: context.plan_tier
      },
      sound: 'default',
      priority: 'high',
      channelId: 'billing'
    },
    payment_success: {
      title: 'Payment Successful',
      body: context.amount ? `Payment received (${context.amount}). Subscription active.` : 'Payment received. Subscription active.',
      data: {
        type: 'billing',
        screen: 'subscriptions',
        plan_tier: context.plan_tier
      },
      sound: 'default',
      priority: 'high',
      channelId: 'billing'
    },
    trial_started: {
      title: 'Trial Started',
      body: context.trial_end_text ? `Your ${context.plan_tier || 'plan'} trial started. Ends ${context.trial_end_text}.` : `Your ${context.plan_tier || 'plan'} trial has started.`,
      data: {
        type: 'billing',
        screen: 'subscriptions'
      },
      sound: 'default',
      priority: 'normal',
      channelId: 'billing'
    },
    trial_ending: {
      title: 'Trial Ending Soon',
      body: context.trial_end_text ? `Your trial ends ${context.trial_end_text}. Add payment to continue.` : 'Your trial ends soon. Add payment to continue.',
      data: {
        type: 'billing',
        screen: 'subscriptions'
      },
      sound: 'default',
      priority: 'high',
      channelId: 'billing'
    },
    trial_ended: {
      title: 'Trial Ended',
      body: 'Your trial period has ended. Upgrade to regain premium features.',
      data: {
        type: 'billing',
        screen: 'subscriptions'
      },
      sound: 'default',
      priority: 'high',
      channelId: 'billing'
    },
    seat_request_created: {
      title: 'Seat Request',
      body: context.requester_email ? `${context.requester_email} requested a teacher seat` : 'A teacher requested a seat',
      data: {
        type: 'seats',
        screen: 'seat-management'
      },
      sound: 'default',
      priority: 'high',
      channelId: 'admin'
    },
    seat_request_approved: {
      title: 'Seat Approved',
      body: 'Your teacher seat has been approved. You now have full access.',
      data: {
        type: 'seats',
        screen: 'dashboard'
      },
      sound: 'default',
      priority: 'high',
      channelId: 'admin'
    },
    payment_required: {
      title: 'Payment Required',
      body: context.message || `Payment required for ${context.plan_tier || 'plan'} upgrade`,
      data: {
        type: 'billing',
        screen: 'payment-checkout',
        subscription_id: context.subscription_id,
        payment_url: context.payment_url
      },
      sound: 'default',
      priority: 'high',
      channelId: 'billing'
    },
    subscription_pending_payment: {
      title: 'Payment Pending',
      body: context.action_required || `Complete payment for ${context.plan_name || 'your subscription'}`,
      data: {
        type: 'billing',
        screen: 'payment-checkout',
        subscription_id: context.subscription_id
      },
      sound: 'default',
      priority: 'high',
      channelId: 'billing'
    },
    new_invoice: {
      title: 'New Invoice',
      body: context.invoice_number ? `Invoice ${context.invoice_number} has been created` : 'A new invoice has been created for you',
      data: {
        type: 'invoice',
        invoice_id: context.invoice_id,
        screen: 'invoice-details'
      },
      sound: 'default',
      priority: 'normal',
      channelId: 'invoices'
    },
    invoice_sent: {
      title: 'Invoice Sent',
      body: context.invoice_number ? `Invoice ${context.invoice_number} has been sent` : 'Your invoice has been sent',
      data: {
        type: 'invoice',
        invoice_id: context.invoice_id,
        screen: 'invoice-details'
      },
      sound: 'default',
      priority: 'normal',
      channelId: 'invoices'
    },
    overdue_reminder: {
      title: 'Invoice Overdue',
      body: context.invoice_number ? `Invoice ${context.invoice_number} is overdue - please pay to avoid late fees` : 'You have an overdue invoice - please pay to avoid late fees',
      data: {
        type: 'invoice',
        invoice_id: context.invoice_id,
        screen: 'invoice-details'
      },
      sound: 'default',
      priority: 'high',
      channelId: 'invoices'
    },
    payment_confirmed: {
      title: 'Payment Received',
      body: context.invoice_number ? `Payment received for Invoice ${context.invoice_number} - thank you!` : 'Payment received - thank you!',
      data: {
        type: 'invoice',
        invoice_id: context.invoice_id,
        screen: 'invoice-details'
      },
      sound: 'default',
      priority: 'normal',
      channelId: 'invoices'
    },
    payment_receipt: {
      title: 'Payment Receipt Ready',
      body: context.student_name
        ? `Receipt ready for ${context.student_name}`
        : 'Your payment receipt is ready',
      data: {
        type: 'receipt',
        student_id: context.student_id,
        receipt_url: context.receipt_url,
        screen: 'parent-payments'
      },
      sound: 'default',
      priority: 'normal',
      channelId: 'billing'
    },
    invoice_viewed: {
      title: 'Invoice Viewed',
      body: context.invoice_number ? `Invoice ${context.invoice_number} was viewed` : 'Your invoice was viewed',
      data: {
        type: 'invoice',
        invoice_id: context.invoice_id,
        screen: 'invoice-details'
      },
      sound: null,
      priority: 'normal',
      channelId: 'invoices'
    },
    report_submitted_for_review: {
      title: 'Progress Report Submitted',
      body: context.student_name && context.teacher_name ? `${context.teacher_name} submitted a progress report for ${context.student_name}` : 'A progress report has been submitted for review',
      data: {
        type: 'report',
        report_id: context.report_id,
        student_id: context.student_id,
        screen: 'principal-report-review'
      },
      sound: 'default',
      priority: 'high',
      channelId: 'reports'
    },
    report_approved: {
      title: 'Progress Report Approved',
      body: context.student_name ? `Your progress report for ${context.student_name} has been approved` : 'Your progress report has been approved',
      data: {
        type: 'report',
        report_id: context.report_id,
        student_id: context.student_id,
        screen: 'progress-report-creator'
      },
      sound: 'default',
      priority: 'normal',
      channelId: 'reports'
    },
    report_rejected: {
      title: 'Progress Report Needs Revision',
      body: context.student_name && context.rejection_reason ? `Report for ${context.student_name} needs revision: ${context.rejection_reason}` : context.rejection_reason || 'Your progress report needs revision',
      data: {
        type: 'report',
        report_id: context.report_id,
        student_id: context.student_id,
        rejection_reason: context.rejection_reason,
        screen: 'progress-report-creator'
      },
      sound: 'default',
      priority: 'high',
      channelId: 'reports'
    },
    incoming_call: {
      title: context.call_type === 'video' ? '📹 Incoming Video Call' : '📞 Incoming Voice Call',
      body: context.caller_name ? `${context.caller_name} is calling...` : 'Incoming call...',
      data: {
        type: 'incoming_call',
        call_id: context.call_id,
        callId: context.call_id,
        caller_id: context.caller_id,
        caller_name: context.caller_name,
        call_type: context.call_type || 'voice',
        callType: context.call_type || 'voice',
        thread_id: context.thread_id,
        threadId: context.thread_id,
        meeting_url: context.meeting_url,
        screen: 'incoming-call'
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'incoming-calls',
      _contentAvailable: true,
      categoryId: 'incoming_call'
    },
    build_update_available: {
      title: context.mandatory ? 'Required App Update' : 'New App Version Available',
      body: context.version
        ? `Version ${context.version}${context.build_number ? ` (${context.build_number})` : ''} is ready. Open the store to update.`
        : 'A new app build is available. Open the store to update.',
      data: {
        type: 'build_update_available',
        store_url: context.store_url,
        version: context.version,
        build_number: context.build_number,
        mandatory: context.mandatory ?? false,
        platform: context.platform || 'android',
        screen: 'store'
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'default'
    },
    lesson_assigned: (() => {
      // Contextual title/body based on delivery_mode so parents receive
      // appropriate messaging instead of generic "assigned a lesson" text.
      const deliveryMode = context.delivery_mode as string | undefined;
      const childName = context.student_name as string | undefined;
      const activityTitle = context.assignment_title as string | undefined;

      let title: string;
      let body: string;

      if (deliveryMode === 'playground') {
        title = '🎮 New Dash Activity';
        body = childName
          ? `New Dash activity for ${childName}: ${activityTitle || 'a fun practice activity'}`
          : `New Dash activity: ${activityTitle || 'a fun practice activity'}`;
      } else if (deliveryMode === 'take_home') {
        title = '🏠 Take-Home Activity';
        body = childName
          ? `Take-home activity for ${childName}: ${activityTitle || 'a reinforcement activity'}`
          : `Take-home activity: ${activityTitle || 'a reinforcement activity'}`;
      } else {
        // class_activity — informational, not homework
        title = '📚 Today\'s Class';
        body = childName
          ? `${childName}'s class will work on: ${activityTitle || 'a new lesson today'}`
          : `Class activity: ${activityTitle || 'a new lesson today'}`;
      }

      return {
        title,
        body,
        data: {
          type: 'lesson_assignment',
          assignment_id: context.assignment_id,
          student_id: context.student_id,
          delivery_mode: deliveryMode,
          screen: deliveryMode === 'playground' ? 'dash-playground' : 'lesson-detail',
        },
        sound: 'default',
        badge: 1,
        priority: 'normal',
        channelId: 'homework',
      };
    })(),
    // School calendar events
    school_event_created: {
      title: '📅 New School Event',
      body: context.event_title 
        ? `${context.event_title}${context.event_date ? ` on ${context.event_date}` : ''}`
        : 'A new school event has been scheduled',
      data: {
        type: 'school_event',
        event_id: context.event_id,
        event_type: context.event_type,
        screen: 'calendar'
      },
      sound: 'default',
      badge: 1,
      priority: 'normal',
      channelId: 'calendar'
    },
    school_event_reminder: {
      title: '🔔 Event Reminder',
      body: context.event_title 
        ? `Reminder (${context.reminder_label || 'upcoming'}): ${context.event_title}${context.event_date ? ` is ${context.event_date}` : ' is coming up'}`
        : 'You have an upcoming school event',
      data: {
        type: 'school_event_reminder',
        event_id: context.event_id,
        event_type: context.event_type,
        reminder_offset_days: context.reminder_offset_days,
        reminder_label: context.reminder_label,
        screen: 'calendar'
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'calendar'
    },
    school_meeting_reminder: {
      title: '📅 Meeting Reminder',
      body: context.event_title 
        ? `Reminder (${context.reminder_label || 'upcoming'}): ${context.event_title}${context.event_date ? ` is ${context.event_date}` : ' is coming up'}`
        : 'You have an upcoming school meeting',
      data: {
        type: 'school_meeting_reminder',
        meeting_id: context.meeting_id,
        reminder_offset_days: context.reminder_offset_days,
        reminder_label: context.reminder_label,
        screen: 'calendar'
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'calendar'
    },
    school_excursion_reminder: {
      title: '🚌 Excursion Reminder',
      body: context.event_title 
        ? `Reminder (${context.reminder_label || 'upcoming'}): ${context.event_title}${context.event_date ? ` is ${context.event_date}` : ' is coming up'}`
        : 'You have an upcoming school excursion',
      data: {
        type: 'school_excursion_reminder',
        excursion_id: context.excursion_id,
        reminder_offset_days: context.reminder_offset_days,
        reminder_label: context.reminder_label,
        screen: 'calendar'
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'calendar'
    },
    school_event_updated: {
      title: '📅 Event Updated',
      body: context.event_title 
        ? `${context.event_title} has been updated`
        : 'A school event has been updated',
      data: {
        type: 'school_event',
        event_id: context.event_id,
        event_type: context.event_type,
        screen: 'calendar'
      },
      sound: 'default',
      priority: 'normal',
      channelId: 'calendar'
    },
    school_event_cancelled: {
      title: '❌ Event Cancelled',
      body: context.event_title 
        ? `${context.event_title} has been cancelled`
        : 'A school event has been cancelled',
      data: {
        type: 'school_event',
        event_id: context.event_id,
        event_type: context.event_type,
        screen: 'calendar'
      },
      sound: 'default',
      priority: 'high',
      channelId: 'calendar'
    },
    
    // Birthday notifications
    birthday_reminder_week: {
      title: '🎂 Birthday Coming Up!',
      body: context.student_name 
        ? `${context.student_name}'s birthday is in 1 week (${context.birthday_date}). They'll be turning ${context.age}!`
        : 'A birthday is coming up in 1 week!',
      data: {
        type: 'birthday_reminder',
        screen: 'birthday-planner',
        student_name: context.student_name,
        days_until: 7,
        age: context.age,
      },
      sound: 'default',
      badge: 1,
      priority: 'normal',
      channelId: 'general'
    },
    birthday_reminder_tomorrow: {
      title: '🎈 Birthday Tomorrow!',
      body: context.student_name 
        ? `${context.student_name}'s birthday is TOMORROW! They'll be turning ${context.age}! 🎉`
        : 'A birthday is tomorrow!',
      data: {
        type: 'birthday_reminder',
        screen: 'birthday-planner',
        student_name: context.student_name,
        days_until: 1,
        age: context.age,
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'general'
    },
    birthday_reminder_teacher: {
      title: '🎂 Student Birthday Tomorrow',
      body: context.student_name 
        ? `${context.student_name} from ${context.class_name || 'your class'} has a birthday tomorrow! They'll be turning ${context.age}.`
        : 'A student in your class has a birthday tomorrow!',
      data: {
        type: 'birthday_reminder',
        screen: 'dashboard',
        student_name: context.student_name,
        class_name: context.class_name,
        age: context.age,
      },
      sound: 'default',
      badge: 1,
      priority: 'normal',
      channelId: 'general'
    },
    birthday_today: {
      title: '🎉 Happy Birthday!',
      body: context.student_name 
        ? `Today is ${context.student_name}'s special day! Happy ${context.age}th birthday! 🎂🎈🎁`
        : 'Happy Birthday! 🎂🎈🎁',
      data: {
        type: 'birthday',
        screen: 'birthday-planner',
        student_name: context.student_name,
        age: context.age,
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'general'
    },
    birthday_today_teacher: {
      title: '🎂 Student Birthday Today!',
      body: context.student_name 
        ? `${context.student_name} from ${context.class_name || 'your class'} is celebrating their ${context.age}th birthday today! 🎉`
        : 'A student in your class has a birthday today!',
      data: {
        type: 'birthday',
        screen: 'dashboard',
        student_name: context.student_name,
        class_name: context.class_name,
        age: context.age,
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'general'
    },
    birthday_classmates_notification: {
      title: '🎈 Classmate Birthday!',
      body: context.student_name 
        ? `${context.student_name} has a birthday ${context.days_until === 0 ? 'today' : context.days_until === 1 ? 'tomorrow' : `in ${context.days_until} days`}!`
        : 'A classmate has an upcoming birthday!',
      data: {
        type: 'birthday',
        screen: 'dashboard',
        student_name: context.student_name,
        days_until: context.days_until,
      },
      sound: 'default',
      priority: 'normal',
      channelId: 'general'
    },
    
    // Attendance notifications
    attendance_recorded: {
      title: '📋 Attendance Recorded',
      body: context.student_name && context.attendance_status
        ? `${context.student_name} was marked ${context.attendance_status}${context.attendance_date ? ` on ${context.attendance_date}` : ''}`
        : context.class_name 
          ? `Attendance recorded for ${context.class_name}`
          : 'Attendance has been recorded for your child',
      data: {
        type: 'attendance',
        student_id: context.student_id,
        attendance_date: context.attendance_date,
        status: context.attendance_status,
        screen: 'child-progress'
      },
      sound: 'default',
      badge: 1,
      priority: 'normal',
      channelId: 'general'
    },
    attendance_absent: {
      title: '⚠️ Absence Notification',
      body: context.student_name
        ? `${context.student_name} was marked absent today (${context.attendance_date || 'today'})`
        : 'Your child was marked absent today',
      data: {
        type: 'attendance',
        student_id: context.student_id,
        attendance_date: context.attendance_date,
        status: 'absent',
        screen: 'child-progress'
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'general'
    },
    attendance_late: {
      title: '⏰ Late Arrival',
      body: context.student_name
        ? `${context.student_name} was marked late today (${context.attendance_date || 'today'})`
        : 'Your child was marked late today',
      data: {
        type: 'attendance',
        student_id: context.student_id,
        attendance_date: context.attendance_date,
        status: 'late',
        screen: 'child-progress'
      },
      sound: 'default',
      badge: 1,
      priority: 'normal',
      channelId: 'general'
    },
    student_inactivity_warning: {
      title: '⚠️ Learner Attendance Alert',
      body: context.student_name
        ? `${context.student_name} has reached ${context.absence_streak || context.trigger_absence_days || 5} consecutive absences. Please contact the school.`
        : 'A learner has reached the inactivity threshold and needs follow-up.',
      data: {
        type: 'learner_lifecycle',
        student_id: context.student_id,
        warning_deadline_at: context.warning_deadline_at,
        warning_deadline_date: context.warning_deadline_date,
        screen: 'student-management',
        action: 'contact_school',
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'attendance'
    },
    student_inactivity_resolved: {
      title: '✅ Learner Attendance Recovered',
      body: context.student_name
        ? `${context.student_name}'s inactivity warning has been resolved.`
        : 'A learner inactivity warning has been resolved.',
      data: {
        type: 'learner_lifecycle',
        student_id: context.student_id,
        resolution_reason: context.resolution_reason,
        screen: 'student-management',
      },
      sound: 'default',
      badge: 1,
      priority: 'normal',
      channelId: 'attendance'
    },
    student_inactivity_marked_inactive: {
      title: '🚫 Learner Marked Inactive',
      body: context.student_name
        ? `${context.student_name} has been marked inactive due to unresolved attendance.`
        : 'A learner has been marked inactive due to unresolved attendance.',
      data: {
        type: 'learner_lifecycle',
        student_id: context.student_id,
        inactive_on: context.inactive_on,
        screen: 'student-management',
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'attendance'
    },
    pop_uploaded: {
      title: '💳 POP Uploaded',
      body: context.student_name
        ? `${context.parent_name ? `${context.parent_name} uploaded POP for ${context.student_name}` : `${context.student_name} uploaded proof of payment`}${context.payment_amount ? ` (R${Number(context.payment_amount).toFixed(2)})` : ''}${context.payment_reference ? ` • Ref: ${context.payment_reference}` : ''}`
        : 'New proof of payment uploaded',
      data: {
        type: 'payments',
        pop_upload_id: context.pop_upload_id,
        student_id: context.student_id,
        screen: 'pop-review'
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'billing'
    },
    
    // Child Registration notifications
    child_registration_submitted: {
      title: '📝 New Registration Request',
      body: context.child_name && context.parent_name
        ? `${context.parent_name} submitted a registration for ${context.child_name}`
        : context.child_name
          ? `New registration request for ${context.child_name}`
          : 'A new child registration has been submitted',
      data: {
        type: 'registration',
        registration_id: context.registration_id,
        screen: 'registration-detail'
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'admin'
    },
    child_registration_approved: {
      title: '✅ Registration Approved!',
      body: context.child_name && context.school_name
        ? `${context.child_name}'s registration at ${context.school_name} has been approved!`
        : context.child_name
          ? `${context.child_name}'s registration has been approved!`
          : 'Your child registration has been approved!',
      data: {
        type: 'registration',
        registration_id: context.registration_id,
        student_id: context.student_id,
        screen: 'child-progress'
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'general'
    },
    child_registration_rejected: {
      title: '❌ Registration Not Approved',
      body: context.child_name && context.rejection_reason
        ? `${context.child_name}'s registration was not approved: ${context.rejection_reason}`
        : context.child_name
          ? `${context.child_name}'s registration was not approved`
          : 'Your child registration was not approved',
      data: {
        type: 'registration',
        registration_id: context.registration_id,
        rejection_reason: context.rejection_reason,
        screen: 'registrations'
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'general'
    },
    parent_invite: {
      title: context.school_name ? `You're invited to ${context.school_name}` : 'You are invited to EduDash Pro',
      body: context.child_name && context.invite_code
        ? `You've been invited to connect to ${context.child_name}. Use code ${context.invite_code}.`
        : context.invite_code
          ? `Use invite code ${context.invite_code} to join your school.`
          : 'You have been invited to join your school on EduDash Pro.',
      data: {
        type: 'parent_invite',
        invite_code: context.invite_code,
        invite_link: context.invite_link,
        student_code: context.student_code,
        screen: 'invite'
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'general'
    },
    parent_linked: {
      title: '✅ Child Linked',
      body: context.child_name
        ? `${context.child_name} has been linked to your account.`
        : 'A child has been linked to your account.',
      data: {
        type: 'parent_linked',
        student_id: context.student_id,
        student_code: context.student_code,
        screen: 'children'
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'general'
    },
    birthday_donation_reminder: {
      title: '🎂 Birthday Donation Reminder',
      body: context.child_name && typeof context.days_until === 'number'
        ? `${context.child_name}'s birthday is in ${context.days_until} days. Please contribute R${context.donation_amount || 25}.`
        : `A birthday is coming up. Please contribute R${context.donation_amount || 25}.`,
      data: {
        type: 'birthday',
        screen: 'birthday-planner',
        student_name: context.child_name || context.student_name,
        days_until: context.days_until,
        donation_amount: context.donation_amount || 25,
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'general'
    },
    birthday_donation_paid: {
      title: '✅ Birthday Donation Recorded',
      body: context.payer_child_name && context.birthday_child_name
        ? `${context.payer_child_name}'s contribution for ${context.birthday_child_name}'s birthday has been recorded.`
        : context.birthday_child_name
          ? `Your birthday contribution for ${context.birthday_child_name} has been recorded.`
          : 'Your birthday donation has been recorded.',
      data: {
        type: 'birthday',
        screen: 'birthday-planner',
        payer_child_name: context.payer_child_name,
        birthday_child_name: context.birthday_child_name,
        donation_amount: context.donation_amount || 25,
        donation_date: context.donation_date,
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'general'
    },
    fee_due_soon: {
      title: '💳 Fee Due Soon',
      body: (() => {
        const dueText = context.child_name
          ? (context.days_until === 0
            ? `${context.child_name}'s school fee is due today.`
            : context.due_date
              ? `${context.child_name}'s school fee is due on ${context.due_date}.`
              : `${context.child_name}'s school fee is due soon.`)
          : (context.days_until === 0
            ? 'School fee is due today.'
            : context.due_date
              ? `School fee is due on ${context.due_date}.`
              : 'School fee is due soon.');

        const amountText =
          typeof context.amount === 'number' && Number.isFinite(context.amount)
            ? ` Amount: R${context.amount.toFixed(2)}.`
            : '';

        const popText =
          context.pop_upload_prompt || 'If you already paid, please upload your POP in the app.';

        return `${dueText}${amountText} ${popText}`.replace(/\s+/g, ' ').trim();
      })(),
      data: {
        type: 'billing',
        screen: 'parent-payments',
        student_id: context.student_id,
        due_date: context.due_date,
        amount: context.amount,
        reminder_kind: context.reminder_kind || (context.days_until === 0 ? 'due_today' : 'due_soon'),
        pop_upload_reminder: true,
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'billing'
    },
    new_job_application: {
      title: '📋 New Job Application',
      body: context.candidate_name && context.job_title
        ? `${context.candidate_name} applied for ${context.job_title}`
        : context.candidate_name
          ? `${context.candidate_name} submitted an application`
          : 'A new job application has been received',
      data: {
        type: 'hiring',
        screen: 'hiring-hub',
        job_application_id: context.job_application_id,
        job_posting_id: context.job_posting_id,
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'admin'
    },
    job_application_under_review: {
      title: 'Application Under Review',
      body: context.job_title
        ? `Your application for ${context.job_title} is now under review`
        : 'Your application is now under review',
      data: {
        type: 'hiring',
        screen: 'application-status',
        job_application_id: context.job_application_id,
        job_posting_id: context.job_posting_id,
      },
      sound: 'default',
      badge: 1,
      priority: 'normal',
      channelId: 'career'
    },
    job_application_shortlisted: {
      title: 'You Were Shortlisted',
      body: context.job_title
        ? `Great news! You were shortlisted for ${context.job_title}`
        : 'Great news! You were shortlisted',
      data: {
        type: 'hiring',
        screen: 'application-status',
        job_application_id: context.job_application_id,
        job_posting_id: context.job_posting_id,
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'career'
    },
    job_interview_scheduled: {
      title: 'Interview Scheduled',
      body: context.job_title
        ? `Interview scheduled for ${context.job_title}${context.interview_date ? ` on ${context.interview_date}` : ''}`
        : 'Your interview has been scheduled',
      data: {
        type: 'hiring',
        screen: 'application-status',
        job_application_id: context.job_application_id,
        job_posting_id: context.job_posting_id,
        interview_date: context.interview_date,
        interview_time: context.interview_time,
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'career'
    },
    job_offer_sent: {
      title: 'Job Offer Sent',
      body: context.job_title
        ? `An offer was sent for ${context.job_title}`
        : 'A job offer has been sent to you',
      data: {
        type: 'hiring',
        screen: 'offer-letter',
        job_application_id: context.job_application_id,
        job_posting_id: context.job_posting_id,
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'career'
    },
    job_application_rejected: {
      title: 'Application Update',
      body: context.job_title
        ? `Your application for ${context.job_title} was not selected this time`
        : 'Your application was not selected this time',
      data: {
        type: 'hiring',
        screen: 'application-status',
        job_application_id: context.job_application_id,
        job_posting_id: context.job_posting_id,
      },
      sound: 'default',
      badge: 1,
      priority: 'normal',
      channelId: 'career'
    },
    job_application_hired: {
      title: 'You Were Selected',
      body: context.job_title
        ? `You were selected for ${context.job_title}. Onboarding has started`
        : 'You were selected. Onboarding has started',
      data: {
        type: 'hiring',
        screen: 'application-status',
        job_application_id: context.job_application_id,
        job_posting_id: context.job_posting_id,
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'career'
    },
    teacher_invite_accepted_pending_principal: {
      title: 'Teacher Awaiting Approval',
      body: context.teacher_name
        ? `${context.teacher_name} accepted the invite and is waiting for final approval`
        : 'A teacher accepted an invite and is waiting for approval',
      data: {
        type: 'hiring',
        screen: 'teacher-approval-dashboard',
        teacher_name: context.teacher_name,
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'admin'
    },
    teacher_account_approved: {
      title: 'Teacher Account Approved',
      body: 'Your teacher account has been approved. You can now access your dashboard.',
      data: {
        type: 'hiring',
        screen: 'teacher-dashboard',
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'admin'
    },
    teacher_account_rejected: {
      title: 'Teacher Account Update',
      body: context.rejection_reason
        ? `Your teacher account approval was declined: ${context.rejection_reason}`
        : 'Your teacher account approval was declined. Please contact the principal.',
      data: {
        type: 'hiring',
        screen: 'teacher-approval-pending',
      },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'admin'
    }
  };

  return templates[eventType] || {
    title: "EduDash Pro",
    body: "You have a new notification",
    sound: 'default',
    priority: 'normal',
    channelId: 'general'
  };
}

/**
 * Get push tokens for users
 */
function normalizeExpoProjectId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getExpoProjectIdFromMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return '';
  return normalizeExpoProjectId((metadata as Record<string, unknown>).expo_project_id);
}

type SupportedPushPlatform = 'android' | 'ios' | 'web';

function normalizePlatformFilter(value: unknown): SupportedPushPlatform[] {
  if (!Array.isArray(value)) return [];
  const valid = new Set<SupportedPushPlatform>(['android', 'ios', 'web']);
  const normalized = value
    .map((item) => String(item || '').toLowerCase().trim() as SupportedPushPlatform)
    .filter((item) => valid.has(item));
  return Array.from(new Set(normalized));
}

async function getPushTokensForUsers(
  userIds: string[],
  options?: {
    expectedExpoProjectId?: string;
    dedupeByUser?: boolean;
    platformFilter?: SupportedPushPlatform[];
  }
): Promise<PushDevice[]> {
  const { data, error } = await supabase
    .from('push_devices')
    .select('user_id, expo_push_token, fcm_token, language, device_metadata, platform')
    .in('user_id', userIds)
    .eq('is_active', true)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching push tokens:', error);
    return [];
  }

  const expectedExpoProjectId = normalizeExpoProjectId(options?.expectedExpoProjectId);
  const dedupeByUser = options?.dedupeByUser === true;
  const platformFilter = normalizePlatformFilter(options?.platformFilter || []);
  const rawCandidates = data || [];

  // Keep strict match for explicit project IDs, but allow legacy tokens with missing metadata.
  // This avoids dropping valid devices that were registered before expo_project_id was persisted.
  const projectCandidates = expectedExpoProjectId
    ? rawCandidates.filter((device: PushDevice) => {
        const deviceProjectId = getExpoProjectIdFromMetadata(device.device_metadata);
        return deviceProjectId === expectedExpoProjectId || deviceProjectId.length === 0;
      })
    : rawCandidates;
  const candidates = platformFilter.length > 0
    ? projectCandidates.filter((device: PushDevice) => {
        const platform = String(device.platform || '').toLowerCase().trim() as SupportedPushPlatform | '';
        if (!platform) {
          // Keep legacy rows without platform metadata deliverable.
          return true;
        }
        return platformFilter.includes(platform);
      })
    : projectCandidates;

  // Deduplicate by token (not user).
  // A user can legitimately have multiple active devices, and all should receive push.
  const uniqueTokens = new Map<string, PushDevice>();
  candidates.forEach((device: PushDevice) => {
    const token = String(device.expo_push_token || '').trim();
    if (!token) return;
    if (!uniqueTokens.has(token)) {
      uniqueTokens.set(token, device);
    }
  });

  if (expectedExpoProjectId) {
    console.log(
      `[push_tokens] users=${userIds.length} expected_project=${expectedExpoProjectId} raw=${rawCandidates.length} filtered=${candidates.length} unique_tokens=${uniqueTokens.size} dedupe_by_user=${dedupeByUser}`
    );
  }
  if (platformFilter.length > 0) {
    console.log(
      `[push_tokens] platform_filter=${platformFilter.join(',')} filtered=${candidates.length} raw=${rawCandidates.length}`
    );
  }

  let tokens = Array.from(uniqueTokens.values());

  // Build-update broadcasts should avoid duplicate banners on a single physical device.
  // Keep only the most recent token per user for these events.
  if (dedupeByUser) {
    const byUser = new Map<string, PushDevice>();
    for (const device of tokens) {
      if (!byUser.has(device.user_id)) {
        byUser.set(device.user_id, device);
      }
    }
    tokens = Array.from(byUser.values());
  }

  return tokens;
}

const normalizeRoleTarget = (role: string): string => {
  const normalized = String(role || '').toLowerCase().trim();
  if (normalized === 'superadmin') return 'super_admin';
  if (normalized === 'principaladmin') return 'principal_admin';
  return normalized;
};

/**
 * Get users to notify based on context
 */
async function getUsersToNotify(request: NotificationRequest): Promise<string[]> {
  if (request.user_ids && request.user_ids.length > 0) {
    return request.user_ids;
  }

  const userIds: string[] = [];
  const excludedUserIds: string[] = [];

  // Role-based targeting within a preschool
  if (request.role_targets && request.role_targets.length > 0) {
    try {
      const roles = Array.from(new Set(request.role_targets.map(normalizeRoleTarget).filter(Boolean)));
      const superAdminRoles = ['super_admin', 'superadmin'];
      const wantsSuperAdmin = roles.some((role) => superAdminRoles.includes(role));

      if (wantsSuperAdmin) {
        const { data: superAdmins } = await supabase
          .from('profiles')
          .select('id, role')
          .in('role', superAdminRoles)
          .eq('is_active', true);
        if (superAdmins) userIds.push(...superAdmins.map((r: { id: string }) => r.id));
      }

      const filteredRoles = roles.filter((role) => !superAdminRoles.includes(role));
      if (filteredRoles.length > 0 && request.preschool_id) {
        const { data: schoolUsers } = await supabase
          .from('profiles')
          .select('id, role')
          .or(`preschool_id.eq.${request.preschool_id},organization_id.eq.${request.preschool_id}`)
          .in('role', filteredRoles)
          .eq('is_active', true);
        if (schoolUsers) userIds.push(...schoolUsers.map((r: { id: string }) => r.id));
      }
    } catch (e) {
      console.error('Role-based targeting failed:', e);
    }
  }

  // Get users based on event context
  switch (request.event_type) {
    case 'build_update_available': {
      const platform = String(request.platform || request.custom_payload?.platform || '').toLowerCase();
      const expectedExpoProjectId = normalizeExpoProjectId(
        request.custom_payload?.expo_project_id ||
        request.custom_payload?.expected_expo_project_id
      );
      let query = supabase
        .from('push_devices')
        .select('user_id, device_metadata')
        .eq('is_active', true)
        .not('expo_push_token', 'is', null);

      if (platform === 'android' || platform === 'ios' || platform === 'web') {
        query = query.eq('platform', platform);
      }

      const { data: devices } = await query;
      if (devices) {
        const filtered = expectedExpoProjectId
          ? devices.filter((row: { user_id: string; device_metadata?: Record<string, unknown> }) => {
              return getExpoProjectIdFromMetadata(row.device_metadata) === expectedExpoProjectId;
            })
          : devices;
        userIds.push(...filtered.map((row: { user_id: string }) => row.user_id));
      }
      break;
    }

    case 'new_message':
      if (request.thread_id) {
        // First get direct thread participants (legacy parent_id / teacher_id fields)
        const { data: thread } = await supabase
          .from('message_threads')
          .select('parent_id, teacher_id, is_group')
          .eq('id', request.thread_id)
          .single();
        if (thread) {
          if (thread.parent_id) userIds.push(thread.parent_id);
          if (thread.teacher_id) userIds.push(thread.teacher_id);
        }

        // Also include group participants from message_participants table.
        // Respect per-thread notification_mode:
        //   'all' → notify normally
        //   'mentions' → only notify if the message content contains @mention
        //   'muted' → skip push notification entirely
        const { data: participants } = await supabase
          .from('message_participants')
          .select('user_id, notification_mode')
          .eq('thread_id', request.thread_id);

        if (participants && participants.length > 0) {
          const messageContent = (request as any).message_content || '';
          for (const p of participants) {
            const mode = p.notification_mode || 'all';
            if (mode === 'muted') continue;
            if (mode === 'mentions') {
              // Only include if message contains an @mention reference
              if (!messageContent.includes('@') && !messageContent.includes(p.user_id)) {
                continue;
              }
            }
            if (!userIds.includes(p.user_id)) {
              userIds.push(p.user_id);
            }
          }
        }
      }
      break;

    case 'new_announcement':
      if (request.preschool_id) {
        const rawAudience = request.target_audience;
        const targetAudience = Array.isArray(rawAudience)
          ? rawAudience
          : typeof rawAudience === 'string'
            ? rawAudience.split(',').map((entry) => entry.trim()).filter(Boolean)
            : [];
        const normalizedAudience = new Set(
          targetAudience.map((entry) => String(entry || '').toLowerCase()).filter(Boolean)
        );
        const includeAll = normalizedAudience.size === 0 || normalizedAudience.has('all');
        const targetRoles: string[] = [];
        if (includeAll || normalizedAudience.has('parents')) targetRoles.push('parent');
        if (includeAll || normalizedAudience.has('teachers')) targetRoles.push('teacher');
        if (includeAll || normalizedAudience.has('staff')) targetRoles.push('staff');

        if (targetRoles.length > 0) {
          const { data: recipients } = await supabase
            .from('profiles')
            .select('id')
            .or(`preschool_id.eq.${request.preschool_id},organization_id.eq.${request.preschool_id}`)
            .in('role', targetRoles)
            .eq('is_active', true);
          if (recipients) {
            userIds.push(...recipients.map((p: { id: string }) => p.id));
          }
        }
      }
      if (request.announcement_id) {
        const { data: announcement } = await supabase
          .from('announcements')
          .select('author_id')
          .eq('id', request.announcement_id)
          .maybeSingle();
        if (announcement?.author_id) {
          excludedUserIds.push(announcement.author_id);
        }
      }
      break;

    case 'form_published':
      if (request.preschool_id) {
        const targetAudience = request.target_audience && request.target_audience.length > 0
          ? request.target_audience
          : ['parents', 'teachers', 'staff'];
        const targetRoles: string[] = [];
        if (targetAudience.includes('parents')) targetRoles.push('parent');
        if (targetAudience.includes('teachers')) targetRoles.push('teacher');
        if (targetAudience.includes('staff')) targetRoles.push('staff');

        if (targetRoles.length > 0) {
          const { data: recipients } = await supabase
            .from('profiles')
            .select('id')
            .in('role', targetRoles)
            .eq('is_active', true)
            .or(`preschool_id.eq.${request.preschool_id},organization_id.eq.${request.preschool_id}`);
          if (recipients) {
            userIds.push(...recipients.map((p: { id: string }) => p.id));
          }
        }
      }
      break;

    case 'homework_graded':
      if (request.student_id) {
        const { data: student } = await supabase
          .from('students')
          .select('parent_id, guardian_id')
          .eq('id', request.student_id)
          .single();
        if (student) {
          if (student.parent_id) userIds.push(student.parent_id);
          if (student.guardian_id) userIds.push(student.guardian_id);
        }
      }
      break;

    case 'assignment_due_soon':
      if (request.assignment_id) {
        const { data: assignment } = await supabase
          .from('homework_assignments')
          .select('class_id, preschool_id')
          .eq('id', request.assignment_id)
          .single();

        if (assignment) {
          const { data: students } = await supabase
            .from('students')
            .select('parent_id, guardian_id')
            .eq('class_id', assignment.class_id)
            .eq('is_active', true);

          if (students) {
            students.forEach((student: { parent_id?: string; guardian_id?: string }) => {
              if (student.parent_id) userIds.push(student.parent_id);
              if (student.guardian_id) userIds.push(student.guardian_id);
            });
          }
        }
      }
      break;

    case 'report_submitted_for_review':
      if (request.preschool_id) {
        const { data: principals } = await supabase
          .from('profiles')
          .select('id')
          .or(`preschool_id.eq.${request.preschool_id},organization_id.eq.${request.preschool_id}`)
          .in('role', ['principal', 'principal_admin', 'super_admin'])
          .eq('is_active', true);
        if (principals) {
          userIds.push(...principals.map((p: { id: string }) => p.id));
        }
      }
      break;

    case 'report_approved':
    case 'report_rejected':
      if (request.report_id) {
        const { data: report } = await supabase
          .from('progress_reports')
          .select('teacher_id')
          .eq('id', request.report_id)
          .single();
        if (report?.teacher_id) {
          userIds.push(report.teacher_id);
        }
      }
      break;

    case 'new_invoice':
    case 'invoice_sent':
    case 'overdue_reminder':
    case 'payment_confirmed':
    case 'invoice_viewed':
      if (request.invoice_id) {
        const { data: invoice } = await supabase
          .from('invoices')
          .select('preschool_id, created_by, bill_to_email, student_id')
          .eq('id', request.invoice_id)
          .single();

        if (invoice) {
          if (invoice.created_by && ['invoice_sent', 'payment_confirmed', 'invoice_viewed'].includes(request.event_type)) {
            userIds.push(invoice.created_by);
          }

          if (invoice.student_id) {
            const { data: student } = await supabase
              .from('students')
              .select('parent_id, guardian_id')
              .eq('id', invoice.student_id)
              .single();
            if (student) {
              if (student.parent_id) userIds.push(student.parent_id);
              if (student.guardian_id) userIds.push(student.guardian_id);
            }
          } else if (invoice.bill_to_email) {
            const { data: billToUser } = await supabase
              .from('profiles')
              .select('id')
              .eq('email', invoice.bill_to_email)
              .or(`preschool_id.eq.${invoice.preschool_id},organization_id.eq.${invoice.preschool_id}`)
              .single();
            if (billToUser) {
              userIds.push(billToUser.id);
            }
          }

          if (invoice.preschool_id) {
            const { data: principals } = await supabase
              .from('profiles')
              .select('id')
              .or(`preschool_id.eq.${invoice.preschool_id},organization_id.eq.${invoice.preschool_id}`)
              .in('role', ['principal', 'principal_admin', 'super_admin'])
              .eq('is_active', true);
            if (principals) {
              userIds.push(...principals.map((p: { id: string }) => p.id));
            }
          }
        }
      }
      break;

    case 'lesson_assigned':
      // Notify the parent(s) of the student who was assigned a lesson
      if (request.student_id) {
        const { data: student } = await supabase
          .from('students')
          .select('parent_id, guardian_id')
          .eq('id', request.student_id)
          .single();
        if (student) {
          if (student.parent_id) userIds.push(student.parent_id);
          if (student.guardian_id) userIds.push(student.guardian_id);
        }
      }
      break;

    // Attendance notifications - notify parents of students whose attendance was recorded
    case 'attendance_recorded':
    case 'attendance_absent':
    case 'attendance_late':
      // If specific student IDs are provided, get their parents
      if (request.student_ids && request.student_ids.length > 0) {
        const { data: students } = await supabase
          .from('students')
          .select('parent_id, guardian_id')
          .in('id', request.student_ids);
        if (students) {
          students.forEach((student: { parent_id?: string; guardian_id?: string }) => {
            if (student.parent_id) userIds.push(student.parent_id);
            if (student.guardian_id) userIds.push(student.guardian_id);
          });
        }
      }
      // If a single student_id is provided
      else if (request.student_id) {
        const { data: student } = await supabase
          .from('students')
          .select('parent_id, guardian_id')
          .eq('id', request.student_id)
          .single();
        if (student) {
          if (student.parent_id) userIds.push(student.parent_id);
          if (student.guardian_id) userIds.push(student.guardian_id);
        }
      }
      // If class_id is provided, get all students' parents in that class
      else if (request.class_id) {
        const { data: students } = await supabase
          .from('students')
          .select('parent_id, guardian_id')
          .eq('class_id', request.class_id)
          .eq('is_active', true);
        if (students) {
          students.forEach((student: { parent_id?: string; guardian_id?: string }) => {
            if (student.parent_id) userIds.push(student.parent_id);
            if (student.guardian_id) userIds.push(student.guardian_id);
          });
        }
      }
      break;

    case 'student_inactivity_warning':
    case 'student_inactivity_resolved':
    case 'student_inactivity_marked_inactive': {
      let resolvedSchoolId = request.preschool_id || null;
      let resolvedClassId: string | null = null;

      if (request.student_id) {
        const { data: student } = await supabase
          .from('students')
          .select('parent_id, guardian_id, preschool_id, organization_id, class_id')
          .eq('id', request.student_id)
          .maybeSingle();

        if (student) {
          if (student.parent_id) userIds.push(student.parent_id);
          if (student.guardian_id) userIds.push(student.guardian_id);
          resolvedSchoolId = resolvedSchoolId || student.organization_id || student.preschool_id || null;
          resolvedClassId = student.class_id || null;
        }
      }

      if (resolvedSchoolId) {
        const { data: principals } = await supabase
          .from('profiles')
          .select('id')
          .or(`preschool_id.eq.${resolvedSchoolId},organization_id.eq.${resolvedSchoolId}`)
          .in('role', ['principal', 'principal_admin', 'admin', 'super_admin'])
          .eq('is_active', true);

        if (principals) {
          userIds.push(...principals.map((p: { id: string }) => p.id));
        }
      }

      if (request.context?.notify_teacher === true && resolvedClassId) {
        const { data: classRow } = await supabase
          .from('classes')
          .select('teacher_id')
          .eq('id', resolvedClassId)
          .maybeSingle();

        if (classRow?.teacher_id) {
          userIds.push(classRow.teacher_id);
        }
      }
      break;
    }

    // School calendar events - notify based on target_audience
    case 'school_event_created':
    case 'school_event_updated':
    case 'school_event_cancelled':
    case 'school_event_reminder':
    case 'school_meeting_reminder':
    case 'school_excursion_reminder':
      if (request.preschool_id) {
        // Get the event to determine target audience
        let targetAudience = request.target_audience || ['all'];
        
        if (request.event_id && !request.target_audience) {
          const { data: eventData } = await supabase
            .from('school_events')
            .select('target_audience')
            .eq('id', request.event_id)
            .single();
          if (eventData?.target_audience) {
            targetAudience = eventData.target_audience;
          }
        }

        // Build role filter based on target audience
        const targetRoles: string[] = [];
        if (targetAudience.includes('all')) {
          targetRoles.push('parent', 'teacher', 'student', 'principal', 'principal_admin');
        } else {
          if (targetAudience.includes('parents')) targetRoles.push('parent');
          if (targetAudience.includes('teachers')) targetRoles.push('teacher');
          if (targetAudience.includes('principals')) {
            targetRoles.push('principal', 'principal_admin');
          }
          if (targetAudience.includes('students')) targetRoles.push('student');
        }

        if (targetRoles.length > 0) {
          // Get users based on target roles
          const { data: users } = await supabase
            .from('profiles')
            .select('id')
            .or(`preschool_id.eq.${request.preschool_id},organization_id.eq.${request.preschool_id}`)
            .in('role', targetRoles)
            .eq('is_active', true);
          
          if (users) {
            userIds.push(...users.map((u: { id: string }) => u.id));
          }
        }
      }
      break;

    case 'pop_uploaded':
      if (request.preschool_id) {
        console.log(`[pop_uploaded] Looking up principals for preschool_id: ${request.preschool_id}`);
        const { data: principals, error: principalsError } = await supabase
          .from('profiles')
          .select('id, role, preschool_id, organization_id, is_active')
          .or(`preschool_id.eq.${request.preschool_id},organization_id.eq.${request.preschool_id}`)
          .in('role', ['principal', 'principal_admin', 'admin', 'super_admin'])
          .eq('is_active', true);
        console.log(`[pop_uploaded] Query result: found=${principals?.length || 0}, error=${principalsError?.message || 'none'}`);
        if (principals && principals.length > 0) {
          console.log(`[pop_uploaded] Principal IDs: ${principals.map((p: any) => `${p.id} (${p.role})`).join(', ')}`);
          userIds.push(...principals.map((p: { id: string }) => p.id));
        } else {
          // Fallback: try without is_active filter in case column is NULL
          console.log('[pop_uploaded] No active principals found, trying without is_active filter...');
          const { data: allPrincipals } = await supabase
            .from('profiles')
            .select('id, role, is_active')
            .or(`preschool_id.eq.${request.preschool_id},organization_id.eq.${request.preschool_id}`)
            .in('role', ['principal', 'principal_admin', 'admin', 'super_admin']);
          console.log(`[pop_uploaded] Without is_active filter: found=${allPrincipals?.length || 0}, is_active values: ${allPrincipals?.map((p: any) => p.is_active).join(', ')}`);
          if (allPrincipals && allPrincipals.length > 0) {
            userIds.push(...allPrincipals.map((p: { id: string }) => p.id));
          }
        }
      } else if (request.pop_upload_id) {
        const { data: upload } = await supabase
          .from('pop_uploads')
          .select('preschool_id')
          .eq('id', request.pop_upload_id)
          .single();
        if (upload?.preschool_id) {
          const { data: principals } = await supabase
            .from('profiles')
            .select('id')
            .or(`preschool_id.eq.${upload.preschool_id},organization_id.eq.${upload.preschool_id}`)
            .in('role', ['principal', 'principal_admin', 'admin', 'super_admin'])
            .eq('is_active', true);
          if (principals) {
            userIds.push(...principals.map((p: { id: string }) => p.id));
          }
        }
      }
      break;

    // Job application notifications — notify principals at the posting's school
    case 'new_job_application':
      if (request.preschool_id) {
        console.log(`[new_job_application] Looking up principals for preschool_id: ${request.preschool_id}`);
        const { data: hiringPrincipals } = await supabase
          .from('profiles')
          .select('id, role')
          .or(`preschool_id.eq.${request.preschool_id},organization_id.eq.${request.preschool_id}`)
          .in('role', ['principal', 'principal_admin', 'admin', 'super_admin'])
          .eq('is_active', true);
        if (hiringPrincipals && hiringPrincipals.length > 0) {
          console.log(`[new_job_application] Found ${hiringPrincipals.length} principals`);
          userIds.push(...hiringPrincipals.map((p: { id: string }) => p.id));
        } else {
          // Fallback without is_active filter
          const { data: allHiringPrincipals } = await supabase
            .from('profiles')
            .select('id')
            .or(`preschool_id.eq.${request.preschool_id},organization_id.eq.${request.preschool_id}`)
            .in('role', ['principal', 'principal_admin', 'admin', 'super_admin']);
          if (allHiringPrincipals && allHiringPrincipals.length > 0) {
            userIds.push(...allHiringPrincipals.map((p: { id: string }) => p.id));
          }
        }
      } else if (request.job_posting_id) {
        // Resolve preschool_id from the job posting
        const { data: posting } = await supabase
          .from('job_postings')
          .select('preschool_id')
          .eq('id', request.job_posting_id)
          .single();
        if (posting?.preschool_id) {
          const { data: postingPrincipals } = await supabase
            .from('profiles')
            .select('id')
            .or(`preschool_id.eq.${posting.preschool_id},organization_id.eq.${posting.preschool_id}`)
            .in('role', ['principal', 'principal_admin', 'admin', 'super_admin'])
            .eq('is_active', true);
          if (postingPrincipals) {
            userIds.push(...postingPrincipals.map((p: { id: string }) => p.id));
          }
        }
      }
      break;

    case 'job_application_under_review':
    case 'job_application_shortlisted':
    case 'job_interview_scheduled':
    case 'job_offer_sent':
    case 'job_application_rejected':
    case 'job_application_hired':
      if (request.job_application_id) {
        const { data: appData } = await supabase
          .from('job_applications')
          .select('candidate_profile_id')
          .eq('id', request.job_application_id)
          .maybeSingle();

        if (appData?.candidate_profile_id) {
          const { data: candidate } = await supabase
            .from('candidate_profiles')
            .select('user_id, email')
            .eq('id', appData.candidate_profile_id)
            .maybeSingle();

          if (candidate?.user_id) {
            userIds.push(candidate.user_id);
          } else if (candidate?.email) {
            const { data: candidateProfile } = await supabase
              .from('profiles')
              .select('id')
              .eq('email', candidate.email.toLowerCase())
              .limit(1)
              .maybeSingle();
            if (candidateProfile?.id) {
              userIds.push(candidateProfile.id);
            }
          }
        }
      }
      break;

    case 'teacher_invite_accepted_pending_principal':
      if (request.preschool_id) {
        const { data: principals } = await supabase
          .from('profiles')
          .select('id')
          .or(`preschool_id.eq.${request.preschool_id},organization_id.eq.${request.preschool_id}`)
          .in('role', ['principal', 'principal_admin', 'admin', 'super_admin'])
          .eq('is_active', true);
        if (principals) {
          userIds.push(...principals.map((p: { id: string }) => p.id));
        }
      }
      break;

    case 'teacher_account_approved':
    case 'teacher_account_rejected': {
      const teacherUserId = request.teacher_user_id || String(request.custom_payload?.teacher_user_id || '');
      if (teacherUserId) {
        userIds.push(teacherUserId);
      }
      break;
    }

    // Child registration notifications
    case 'child_registration_submitted':
      // Notify principals and principal_admins at the school
      if (request.preschool_id) {
        const { data: principals } = await supabase
          .from('profiles')
          .select('id')
          .or(`preschool_id.eq.${request.preschool_id},organization_id.eq.${request.preschool_id}`)
          .in('role', ['principal', 'principal_admin', 'admin', 'super_admin'])
          .eq('is_active', true);
        if (principals) {
          userIds.push(...principals.map((p: { id: string }) => p.id));
        }
      }
      break;

    case 'child_registration_approved':
    case 'child_registration_rejected':
      // Notify the parent who submitted the registration
      if (request.parent_id) {
        userIds.push(request.parent_id);
      } else if (request.registration_id) {
        // Look up the parent from the registration
        const { data: registration } = await supabase
          .from('child_registration_requests')
          .select('parent_id')
          .eq('id', request.registration_id)
          .single();
        if (registration?.parent_id) {
          userIds.push(registration.parent_id);
        }
      }
      break;
  }

  const deduped = [...new Set(userIds.filter(Boolean))];
  if (excludedUserIds.length === 0) return deduped;
  const excluded = new Set(excludedUserIds.filter(Boolean));
  return deduped.filter((id) => !excluded.has(id));
}

function normalizeRecipientEmails(request: NotificationRequest): string[] {
  const emails: string[] = [];
  if (request.recipient_email) {
    emails.push(request.recipient_email);
  }
  if (Array.isArray(request.recipient_emails)) {
    emails.push(...request.recipient_emails);
  }

  const normalized = emails
    .map((email) => String(email || '').trim().toLowerCase())
    .filter((email) => Boolean(email));

  return [...new Set(normalized)];
}

/**
 * Get notification context for template rendering
 */
async function getNotificationContext(request: NotificationRequest): Promise<NotificationContext> {
  const context: NotificationContext = {};
  if (request.context && typeof request.context === 'object') {
    Object.assign(context, request.context);
  }

  try {
    switch (request.event_type) {
      case 'new_message':
        if (request.message_id) {
          const { data: message } = await supabase
            .from('messages')
            .select(`
              *,
              sender:sender_id(first_name, last_name),
              thread:message_threads(*)
            `)
            .eq('id', request.message_id)
            .single();

          if (message) {
            context.sender_name = message.sender ? `${message.sender.first_name} ${message.sender.last_name}` : 'Unknown';
            context.thread_id = message.thread_id;
            context.message_id = message.id;
            context.message_preview = message.content?.substring(0, 50) + (message.content?.length > 50 ? '...' : '');
          }
        }
        break;

      case 'new_announcement':
        if (request.announcement_id) {
          const { data: announcement } = await supabase
            .from('announcements')
            .select('title, content, priority')
            .eq('id', request.announcement_id)
            .single();

          if (announcement) {
            context.announcement_title = announcement.title;
            context.announcement_preview = announcement.content?.substring(0, 100);
            context.priority = announcement.priority;
            context.announcement_id = request.announcement_id;
          }
        }
        break;

      case 'homework_graded':
        if (request.assignment_id) {
          const { data: assignment } = await supabase
            .from('homework_assignments')
            .select('title, subject')
            .eq('id', request.assignment_id)
            .single();

          if (assignment) {
            context.assignment_title = assignment.title;
            context.subject = assignment.subject;
            context.assignment_id = request.assignment_id;
          }
        }
        if (request.student_id) {
          const { data: student } = await supabase
            .from('students')
            .select('first_name, last_name')
            .eq('id', request.student_id)
            .single();

          if (student) {
            context.student_name = `${student.first_name} ${student.last_name}`;
            context.student_id = request.student_id;
          }
        }
        break;

      case 'assignment_due_soon': {
        if (request.assignment_id) {
          const { data: assignment } = await supabase
            .from('homework_assignments')
            .select('title, due_date, subject')
            .eq('id', request.assignment_id)
            .single();

          if (assignment) {
            context.assignment_title = assignment.title;
            context.subject = assignment.subject;
            context.assignment_id = request.assignment_id;

            const dueDate = new Date(assignment.due_date);
            const now = new Date();
            const diffHours = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60));

            if (diffHours <= 24) {
              context.due_text = diffHours <= 1 ? 'in 1 hour' : `in ${diffHours} hours`;
            } else {
              const diffDays = Math.ceil(diffHours / 24);
              context.due_text = diffDays === 1 ? 'tomorrow' : `in ${diffDays} days`;
            }
          }
        }
        break;
      }

      case 'subscription_created': {
        if (request.preschool_id) {
          const { data: school } = await supabase
            .from('preschools')
            .select('name')
            .eq('id', request.preschool_id)
            .single();
          if (school) context.school_name = school.name;
        }
        context.plan_tier = request.plan_tier;
        break;
      }

      case 'payment_success': {
        if (request.preschool_id) {
          const { data: school } = await supabase
            .from('preschools')
            .select('name')
            .eq('id', request.preschool_id)
            .single();
          if (school) context.school_name = school.name;
        }
        context.plan_tier = request.plan_tier;
        context.amount = request.custom_payload?.amount as number | undefined;
        break;
      }

      case 'payment_required': {
        context.subscription_id = request.subscription_id;
        context.plan_tier = request.plan_tier;
        context.payment_url = request.custom_payload?.payment_url as string | undefined;
        context.amount = request.custom_payload?.amount as number | undefined;
        context.message = request.custom_payload?.message as string | undefined;
        break;
      }

      case 'subscription_pending_payment': {
        context.subscription_id = request.subscription_id;
        context.plan_name = request.custom_payload?.plan_name as string | undefined;
        context.action_required = request.custom_payload?.action_required as string | undefined;
        context.payment_deadline = request.custom_payload?.payment_deadline as string | undefined;
        break;
      }

      case 'trial_started':
      case 'trial_ending':
      case 'trial_ended': {
        if (request.preschool_id) {
          const { data: school } = await supabase
            .from('preschools')
            .select('name')
            .eq('id', request.preschool_id)
            .single();
          if (school) context.school_name = school.name;
        }
        context.plan_tier = request.plan_tier;
        if (request.custom_payload?.trial_end_date) {
          const end = new Date(request.custom_payload.trial_end_date as string);
          const now = new Date();
          const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          context.trial_end_text = diffDays <= 0 ? 'today' : diffDays === 1 ? 'tomorrow' : `in ${diffDays} days`;
        }
        break;
      }

      case 'seat_request_created': {
        context.requester_email = request.custom_payload?.requester_email as string | undefined;
        break;
      }

      case 'seat_request_approved':
        break;

      case 'report_submitted_for_review':
      case 'report_approved':
      case 'report_rejected':
        if (request.report_id) {
          const { data: report } = await supabase
            .from('progress_reports')
            .select(`
              id,
              student:students(first_name, last_name),
              teacher:profiles!progress_reports_teacher_id_fkey(first_name, last_name)
            `)
            .eq('id', request.report_id)
            .single();

          if (report) {
            context.report_id = report.id;
            if (report.student) {
              context.student_name = `${report.student.first_name} ${report.student.last_name}`;
              context.student_id = request.student_id;
            }
            if (report.teacher) {
              context.teacher_name = `${report.teacher.first_name} ${report.teacher.last_name}`;
            }
            if (request.event_type === 'report_rejected') {
              context.rejection_reason = request.rejection_reason;
            }
          }
        }
        break;

      case 'new_invoice':
      case 'invoice_sent':
      case 'overdue_reminder':
      case 'payment_confirmed':
      case 'invoice_viewed':
        if (request.invoice_id) {
          const { data: invoice } = await supabase
            .from('invoices')
            .select(`
              id,
              invoice_number,
              total_amount,
              due_date,
              status,
              student:students(first_name, last_name),
              preschool:preschools(name)
            `)
            .eq('id', request.invoice_id)
            .single();

          if (invoice) {
            context.invoice_id = invoice.id;
            context.invoice_number = invoice.invoice_number;
            context.total_amount = invoice.total_amount;
            context.due_date = invoice.due_date;
            context.status = invoice.status;

            if (invoice.student) {
              context.student_name = `${invoice.student.first_name} ${invoice.student.last_name}`;
            }
            if (invoice.preschool) {
              context.school_name = invoice.preschool.name;
            }

            if (request.event_type === 'overdue_reminder' && invoice.due_date) {
              const dueDate = new Date(invoice.due_date);
              const now = new Date();
              const diffDays = Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
              context.overdue_days = diffDays > 0 ? diffDays : 0;
            }
          }
        }
        break;

      case 'incoming_call':
        context.call_id = request.call_id;
        context.caller_id = request.caller_id;
        context.caller_name = request.caller_name;
        context.call_type = request.call_type || 'voice';
        context.meeting_url = request.meeting_url;
        break;

      case 'build_update_available': {
        const customPayload = request.custom_payload || {};
        context.version =
          request.version ||
          String(customPayload.version || context.version || '').trim() ||
          undefined;
        context.build_number =
          request.build_number ||
          String(customPayload.build_number || customPayload.buildNumber || context.build_number || '').trim() ||
          undefined;
        context.store_url =
          request.store_url ||
          String(customPayload.store_url || customPayload.storeUrl || context.store_url || '').trim() ||
          undefined;
        context.platform =
          request.platform ||
          String(customPayload.platform || context.platform || 'android').trim() ||
          'android';
        context.mandatory =
          request.mandatory === true ||
          customPayload.mandatory === true ||
          context.mandatory === true;
        break;
      }

      case 'lesson_assigned':
        // Get assignment + student + delivery context for notification copy
        if (request.assignment_id) {
          const { data: assignment } = await supabase
            .from('lesson_assignments')
            .select(`
              id,
              delivery_mode,
              lesson:lessons(id, title, subject),
              interactive_activity:interactive_activities(id, title),
              student:students(id, first_name, last_name)
            `)
            .eq('id', request.assignment_id)
            .single();

          if (assignment) {
            context.assignment_id = assignment.id;
            context.delivery_mode = assignment.delivery_mode ?? 'class_activity';

            // Playground assignments use interactive activity title; others use lesson title
            const interactiveTitle = Array.isArray(assignment.interactive_activity)
              ? assignment.interactive_activity[0]?.title
              : (assignment.interactive_activity as any)?.title;
            const lessonTitle = Array.isArray(assignment.lesson)
              ? assignment.lesson[0]?.title
              : (assignment.lesson as any)?.title;
            const lessonSubject = Array.isArray(assignment.lesson)
              ? assignment.lesson[0]?.subject
              : (assignment.lesson as any)?.subject;

            context.assignment_title = (context.delivery_mode === 'playground' ? interactiveTitle : null)
              ?? lessonTitle;
            context.subject = lessonSubject;

            const student = Array.isArray(assignment.student)
              ? assignment.student[0]
              : (assignment.student as any);
            if (student) {
              context.student_id = student.id;
              context.student_name = `${student.first_name} ${student.last_name}`;
            }
          }
        } else if (request.student_id) {
          // Fallback to student_id if no assignment_id
          const { data: student } = await supabase
            .from('students')
            .select('id, first_name, last_name')
            .eq('id', request.student_id)
            .single();

          if (student) {
            context.student_id = student.id;
            context.student_name = `${student.first_name} ${student.last_name}`;
          }
        }
        break;

      // School calendar events
      case 'school_event_created':
      case 'school_event_updated':
      case 'school_event_cancelled':
      case 'school_event_reminder':
      case 'school_meeting_reminder':
      case 'school_excursion_reminder':
        if (request.context?.reminder_offset_days) {
          context.reminder_offset_days = Number(request.context.reminder_offset_days) || undefined;
        }
        if (request.context?.reminder_label) {
          context.reminder_label = String(request.context.reminder_label);
        }
        if (request.context?.target_role) {
          context.target_role = String(request.context.target_role);
        }
        const formatEventDate = (startDate: string) => {
          if (!startDate) return undefined;
          const date = new Date(startDate);
          const now = new Date();
          const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays === 0) return 'today';
          if (diffDays === 1) return 'tomorrow';
          if (diffDays > 0 && diffDays <= 7) return date.toLocaleDateString('en-US', { weekday: 'long' });
          return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
          });
        };
        if (request.event_id) {
          const { data: eventData } = await supabase
            .from('school_events')
            .select('id, title, start_date, event_type, location, preschool:preschools(name)')
            .eq('id', request.event_id)
            .single();
          if (eventData) {
            context.event_id = eventData.id;
            context.event_title = eventData.title;
            context.event_type = eventData.event_type;
            context.event_location = eventData.location;
            context.event_date = formatEventDate(eventData.start_date);
            if (eventData.preschool) context.school_name = eventData.preschool.name;
          }
        }
        if (request.meeting_id) {
          const { data: meetingData } = await supabase
            .from('school_meetings')
            .select('id, title, meeting_date, preschool:preschools(name)')
            .eq('id', request.meeting_id)
            .single();
          if (meetingData) {
            context.meeting_id = meetingData.id;
            context.event_title = meetingData.title;
            context.event_date = formatEventDate(meetingData.meeting_date);
            if (meetingData.preschool) context.school_name = meetingData.preschool.name;
          }
        }
        if (request.excursion_id) {
          const { data: excData } = await supabase
            .from('school_excursions')
            .select('id, title, excursion_date, preschool:preschools(name)')
            .eq('id', request.excursion_id)
            .single();
          if (excData) {
            context.excursion_id = excData.id;
            context.event_title = excData.title;
            context.event_date = formatEventDate(excData.excursion_date);
            if (excData.preschool) context.school_name = excData.preschool.name;
          }
        }
        break;

      case 'form_published':
        if (request.form_id) {
          context.form_id = request.form_id;
        }
        if (request.form_title) {
          context.form_title = request.form_title;
        }
        if (request.target_audience) {
          context.form_audience = request.target_audience;
        }
        break;

      // Attendance notifications
      case 'attendance_recorded':
      case 'attendance_absent':
      case 'attendance_late':
        // Set attendance date from request or use today
        context.attendance_date = request.attendance_date || new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        });
        context.attendance_status = request.attendance_status;

        // Get student info if available
        if (request.student_id) {
          const { data: student } = await supabase
            .from('students')
            .select('id, first_name, last_name, class_id')
            .eq('id', request.student_id)
            .single();

          if (student) {
            context.student_id = student.id;
            context.student_name = `${student.first_name} ${student.last_name}`;
            
            // Get class name if available
            if (student.class_id) {
              const { data: classData } = await supabase
                .from('classes')
                .select('name')
                .eq('id', student.class_id)
                .single();
              if (classData) {
                context.class_name = classData.name;
              }
            }
          }
        }

        // If class_id provided directly, get class name
        if (request.class_id && !context.class_name) {
          const { data: classData } = await supabase
            .from('classes')
            .select('name')
            .eq('id', request.class_id)
            .single();
          if (classData) {
            context.class_name = classData.name;
          }
        }

        // Add counts from custom payload if available
        if (request.custom_payload) {
          if (request.custom_payload.present_count !== undefined) {
            context.present_count = request.custom_payload.present_count as number;
          }
          if (request.custom_payload.late_count !== undefined) {
            context.late_count = request.custom_payload.late_count as number;
          }
          if (request.custom_payload.absent_count !== undefined) {
            context.absent_count = request.custom_payload.absent_count as number;
          }
          if (request.custom_payload.total_count !== undefined) {
            context.total_count = request.custom_payload.total_count as number;
          }
        }
        break;

      case 'student_inactivity_warning':
      case 'student_inactivity_resolved':
      case 'student_inactivity_marked_inactive':
        context.absence_streak = Number(request.context?.absence_streak || 0) || undefined;
        context.trigger_absence_days = Number(request.context?.trigger_absence_days || 0) || undefined;
        context.grace_days = Number(request.context?.grace_days || 0) || undefined;
        context.warning_deadline_at = (request.context?.warning_deadline_at as string | undefined) || undefined;
        context.warning_deadline_date = (request.context?.warning_deadline_date as string | undefined) || undefined;
        context.resolution_reason = (request.context?.resolution_reason as string | undefined) || undefined;
        context.inactive_on = (request.context?.inactive_on as string | undefined) || undefined;
        if (request.student_id) {
          const { data: student } = await supabase
            .from('students')
            .select('id, first_name, last_name, class_id')
            .eq('id', request.student_id)
            .maybeSingle();
          if (student) {
            context.student_id = student.id;
            context.student_name = `${student.first_name || ''} ${student.last_name || ''}`.trim();
            if (student.class_id) {
              const { data: classData } = await supabase
                .from('classes')
                .select('name')
                .eq('id', student.class_id)
                .maybeSingle();
              if (classData?.name) context.class_name = classData.name;
            }
          }
        }
        break;

      case 'pop_uploaded':
        if (request.pop_upload_id) {
          const { data: upload, error: uploadError } = await supabase
            .from('pop_uploads')
            .select(`
              id,
              upload_type,
              payment_amount,
              payment_reference,
              preschool_id,
              student_id,
              uploaded_by,
              student:students (
                first_name,
                last_name
              )
            `)
            .eq('id', request.pop_upload_id)
            .maybeSingle();

          if (uploadError) {
            console.warn('[pop_uploaded] failed to load upload context:', uploadError.message);
          }

          if (upload) {
            context.pop_upload_id = upload.id;
            context.upload_type = upload.upload_type;
            context.payment_amount = upload.payment_amount ?? undefined;
            context.payment_reference = upload.payment_reference ?? undefined;
            context.student_id = upload.student_id;
            if (upload.student) {
              context.student_name = `${upload.student.first_name || ''} ${upload.student.last_name || ''}`.trim();
            }
            if (upload.uploaded_by) {
              const { data: uploaderById } = await supabase
                .from('profiles')
                .select('first_name, last_name')
                .eq('id', upload.uploaded_by)
                .maybeSingle();

              const uploaderProfile = uploaderById
                ? uploaderById
                : (
                    await supabase
                      .from('profiles')
                      .select('first_name, last_name')
                      .eq('auth_user_id', upload.uploaded_by)
                      .maybeSingle()
                  ).data;

              if (uploaderProfile) {
                context.parent_name = `${uploaderProfile.first_name || ''} ${uploaderProfile.last_name || ''}`.trim();
              }
            }
          }
        }
        break;

      // Child registration notifications
      case 'child_registration_submitted':
      case 'child_registration_approved':
      case 'child_registration_rejected':
        // Set basic context from request
        context.child_name = request.child_name;
        context.parent_name = request.parent_name;
        context.registration_id = request.registration_id;
        context.rejection_reason = request.rejection_reason;

        // Get additional context from registration if available
        if (request.registration_id) {
          const { data: registration } = await supabase
            .from('child_registration_requests')
            .select(`
              id,
              child_first_name,
              child_last_name,
              student_id,
              parent:profiles!parent_id(first_name, last_name),
              preschool:preschools(name)
            `)
            .eq('id', request.registration_id)
            .single();

          if (registration) {
            // Set child name if not already set
            if (!context.child_name && registration.child_first_name) {
              context.child_name = `${registration.child_first_name} ${registration.child_last_name || ''}`.trim();
            }
            // Set parent name if not already set
            if (!context.parent_name && registration.parent) {
              context.parent_name = `${registration.parent.first_name || ''} ${registration.parent.last_name || ''}`.trim();
            }
            // Set school name
            if (registration.preschool) {
              context.school_name = registration.preschool.name;
            }
            // Set student ID if approved
            if (registration.student_id) {
              context.student_id = registration.student_id;
            }
          }
        }

        // Get school name from preschool_id if not yet set
        if (!context.school_name && request.preschool_id) {
          const { data: school } = await supabase
            .from('preschools')
            .select('name')
            .eq('id', request.preschool_id)
            .single();
          if (school) {
            context.school_name = school.name;
          }
        }
        break;
      case 'new_job_application':
      case 'job_application_under_review':
      case 'job_application_shortlisted':
      case 'job_interview_scheduled':
      case 'job_offer_sent':
      case 'job_application_rejected':
      case 'job_application_hired': {
        // Enrich with job posting and candidate details
        if (request.job_posting_id) {
          const { data: jobPost } = await supabase
            .from('job_postings')
            .select('title, preschool_id')
            .eq('id', request.job_posting_id)
            .single();
          if (jobPost) {
            context.job_title = jobPost.title;
            if (!request.preschool_id) request.preschool_id = jobPost.preschool_id;
          }
        }
        if (request.job_application_id) {
          const { data: appData } = await supabase
            .from('job_applications')
            .select('candidate_profile_id, job_posting_id')
            .eq('id', request.job_application_id)
            .single();
          if (appData?.candidate_profile_id) {
            const { data: candidate } = await supabase
              .from('candidate_profiles')
              .select('first_name, last_name, email')
              .eq('id', appData.candidate_profile_id)
              .single();
            if (candidate) {
              context.candidate_name = `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim();
              context.candidate_email = candidate.email;
            }
          }
          if (!request.job_posting_id && appData?.job_posting_id) {
            const { data: jp } = await supabase
              .from('job_postings')
              .select('title, preschool_id')
              .eq('id', appData.job_posting_id)
              .single();
            if (jp) {
              context.job_title = jp.title;
              if (!request.preschool_id) request.preschool_id = jp.preschool_id;
            }
          }
        }
        context.job_application_id = request.job_application_id;
        context.job_posting_id = request.job_posting_id;
        // Carry over any custom_payload overrides
        context.candidate_name = (request.custom_payload?.candidate_name as string | undefined) ?? context.candidate_name;
        context.candidate_email = (request.custom_payload?.candidate_email as string | undefined) ?? context.candidate_email;
        context.job_title = (request.custom_payload?.job_title as string | undefined) ?? context.job_title;
        context.stage_label = (request.custom_payload?.stage_label as string | undefined) ?? context.stage_label;
        context.interview_date = (request.custom_payload?.interview_date as string | undefined) ?? context.interview_date;
        context.interview_time = (request.custom_payload?.interview_time as string | undefined) ?? context.interview_time;
        context.rejection_reason = (request.custom_payload?.rejection_reason as string | undefined)
          ?? request.rejection_reason
          ?? context.rejection_reason;

        if (!context.school_name && request.preschool_id) {
          const { data: sch } = await supabase.from('preschools').select('name').eq('id', request.preschool_id).single();
          if (sch) context.school_name = sch.name;
        }
        break;
      }
      case 'teacher_invite_accepted_pending_principal':
      case 'teacher_account_approved':
      case 'teacher_account_rejected': {
        const teacherUserId = request.teacher_user_id || String(request.custom_payload?.teacher_user_id || '');
        context.teacher_name = (request.custom_payload?.teacher_name as string | undefined) ?? context.teacher_name;
        context.teacher_email = (request.custom_payload?.teacher_email as string | undefined) ?? context.teacher_email;
        context.rejection_reason = (request.custom_payload?.rejection_reason as string | undefined)
          ?? request.rejection_reason
          ?? context.rejection_reason;

        if ((!context.teacher_name || !context.teacher_email) && teacherUserId) {
          const { data: teacher } = await supabase
            .from('profiles')
            .select('first_name, last_name, email')
            .eq('id', teacherUserId)
            .maybeSingle();
          if (teacher) {
            if (!context.teacher_name) {
              const fullName = `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim();
              context.teacher_name = fullName || teacher.email || 'Teacher';
            }
            if (!context.teacher_email) {
              context.teacher_email = teacher.email || undefined;
            }
          }
        }

        if (request.preschool_id && !context.school_name) {
          const { data: school } = await supabase
            .from('preschools')
            .select('name')
            .eq('id', request.preschool_id)
            .maybeSingle();
          if (school?.name) {
            context.school_name = school.name;
          }
        }
        break;
      }
      case 'parent_invite':
      case 'parent_linked':
      case 'birthday_donation_reminder':
      case 'fee_due_soon': {
        context.child_name = (request.custom_payload?.child_name as string | undefined) ?? context.child_name;
        context.student_code = (request.custom_payload?.student_code as string | undefined) ?? context.student_code;
        context.invite_code = (request.custom_payload?.invite_code as string | undefined) ?? context.invite_code;
        context.invite_link = (request.custom_payload?.invite_link as string | undefined) ?? context.invite_link;
        context.donation_amount = (request.custom_payload?.donation_amount as number | undefined) ?? context.donation_amount;
        context.due_date = (request.custom_payload?.due_date as string | undefined) ?? context.due_date;
        context.amount = (request.custom_payload?.amount as number | undefined) ?? context.amount;
        context.days_until = (request.custom_payload?.days_until as number | undefined) ?? context.days_until;
        context.reminder_kind = (request.custom_payload?.reminder_kind as string | undefined) ?? context.reminder_kind;
        context.pop_upload_prompt = (request.custom_payload?.pop_upload_prompt as string | undefined) ?? context.pop_upload_prompt;
        context.school_name = (request.custom_payload?.school_name as string | undefined) ?? context.school_name;
        break;
      }
    }
  } catch (error) {
    console.error('Error getting notification context:', error);
  }

  return context;
}

interface ExpoNotificationPayload {
  to: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string | null;
  badge?: number;
  priority?: string;
  channelId?: string;
  ttl?: number;
  _contentAvailable?: boolean;
  categoryId?: string;
}

interface ExpoResult {
  success?: boolean;
  data?: { id?: string };
  error?: string;
}

interface WebPushResult {
  success?: boolean;
  error?: string;
  result?: unknown;
}

/**
 * Send push notification via Expo
 */
async function sendExpoNotification(notification: ExpoNotificationPayload): Promise<ExpoResult> {
  if (!EXPO_ACCESS_TOKEN) {
    console.warn('Expo access token not configured, skipping push notification');
    return { success: false, error: 'No Expo access token configured' };
  }

  console.log('Sending Expo notification:', {
    recipients: notification.to.length,
    title: notification.title
  });

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${EXPO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(notification)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Expo push notification error:', error);
      throw new Error(`Expo API error: ${response.status} ${error}`);
    }

    const result = await response.json();
    const tickets = Array.isArray(result?.data) ? result.data : [];
    const failedTicket = tickets.find((ticket: Record<string, unknown>) => ticket?.status === 'error');

    if (failedTicket) {
      const errorMessage =
        String(failedTicket?.message || failedTicket?.details?.error || 'Expo ticket error');
      console.error('Expo ticket error:', failedTicket);
      return {
        success: false,
        data: { id: String(failedTicket?.id || '') || undefined },
        error: errorMessage
      };
    }

    const firstTicket = tickets[0] || {};
    console.log('Expo notification sent successfully:', result);
    return {
      success: true,
      data: { id: String(firstTicket?.id || '') || undefined },
    };
  } catch (error) {
    console.error('Error sending Expo notification:', error);
    throw error;
  }
}

/**
 * Send push notification via Web Push (PWA)
 */
async function sendWebPushNotification(
  userIds: string[],
  template: NotificationTemplate,
  eventType: string,
  extraData: Record<string, unknown>
): Promise<WebPushResult> {
  if (!WEB_PUSH_URL) {
    console.warn('WEB_PUSH_URL not configured, skipping web push notifications');
    return { success: false, error: 'WEB_PUSH_URL not configured' };
  }

  try {
    const response = await fetch(`${WEB_PUSH_URL}/api/notifications/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userIds,
        title: template.title,
        body: template.body,
        type: eventType,
        data: extraData,
        tag: `${eventType}-${Date.now()}`
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Web push error:', response.status, errorText);
      return { success: false, error: `Web push error: ${response.status} ${errorText}` };
    }

    const result = await response.json().catch(() => ({}));
    return { success: true, result };
  } catch (error) {
    console.error('Web push request failed:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Record notification in database
 * Inserts into both push_notifications (for tracking) and notifications (for in-app UI)
 */
async function recordNotification(
  userIds: string[],
  template: NotificationTemplate,
  request: NotificationRequest,
  expoResult?: ExpoResult,
  resolvedData?: Record<string, unknown>
): Promise<void> {
  try {
    const dataPayload = resolvedData || template.data || {};
    for (const userId of userIds) {
      // 1. Record in push_notifications table (for tracking sent push notifications)
      await supabase.from('push_notifications').insert({
        recipient_user_id: userId,
        title: template.title,
        body: template.body,
        data: dataPayload,
        status: expoResult?.success === false ? 'failed' : 'sent',
        expo_receipt_id: expoResult?.data?.id,
        notification_type: request.event_type,
        preschool_id: request.preschool_id
      });
      
      // 2. Record in notifications table (for in-app notification center/web UI)
      // Map event types to notification types for the UI
      const notificationType = mapEventTypeToNotificationType(request.event_type);
      
      await supabase.from('notifications').insert({
        user_id: userId,
        title: template.title,
        message: template.body,
        type: notificationType,
        is_read: false,
        metadata: {
          event_type: request.event_type,
          data: dataPayload,
          category: getNotificationCategory(request.event_type),
        },
        action_url: (dataPayload as Record<string, unknown>)?.url || null,
        created_at: new Date().toISOString(),
      }).then(({ error }) => {
        if (error) {
          // Table might not exist in some environments, log but don't fail
          console.warn('Could not insert into notifications table:', error.message);
        }
      });
    }
  } catch (error) {
    console.error('Error recording notification:', error);
  }
}

/**
 * Map event types to notification UI types
 */
function mapEventTypeToNotificationType(
  eventType: string
): 'general' | 'homework' | 'announcement' | 'payment' | 'emergency' | 'reminder' | 'message' {
  const normalized = eventType.toLowerCase();

  if (normalized.includes('message')) return 'message';
  if (normalized.includes('build_update')) return 'reminder';
  if (normalized.includes('inactivity')) return 'reminder';
  if (
    normalized.includes('announcement') ||
    normalized === 'form_published' ||
    normalized.startsWith('school_event_')
  ) {
    return 'announcement';
  }
  if (normalized.includes('homework') || normalized.includes('assignment')) return 'homework';
  if (
    normalized.includes('payment') ||
    normalized.includes('invoice') ||
    normalized.includes('subscription') ||
    normalized.includes('trial') ||
    normalized.includes('fee') ||
    normalized.startsWith('pop_')
  ) {
    return 'payment';
  }
  if (
    normalized.startsWith('job_') ||
    normalized.includes('teacher_account') ||
    normalized.includes('teacher_invite')
  ) {
    return 'reminder';
  }
  if (normalized.includes('emergency')) return 'emergency';
  if (normalized.includes('reminder') || normalized.includes('birthday')) {
    if (
      normalized.includes('payment') ||
      normalized.includes('fee') ||
      normalized.includes('invoice') ||
      normalized.includes('trial')
    ) {
      return 'payment';
    }
    return 'reminder';
  }

  return 'general';
}

/**
 * Get notification category for filtering in the UI
 */
function getNotificationCategory(eventType: string): string {
  const schoolEvents = ['school_event_created', 'school_event_updated', 'school_event_cancelled', 'school_event_reminder', 'announcement', 'form_published'];
  const homeworkEvents = ['homework_assigned', 'homework_due', 'homework_graded', 'assignment_graded', 'homework_submitted'];
  const systemEvents = [
    'payment_received',
    'payment_overdue',
    'payment_failed',
    'fee_due_soon',
    'registration_approved',
    'registration_rejected',
    'parent_invite',
    'parent_linked',
    'pop_uploaded',
    'new_job_application',
    'job_application_under_review',
    'job_application_shortlisted',
    'job_interview_scheduled',
    'job_offer_sent',
    'job_application_rejected',
    'job_application_hired',
    'teacher_invite_accepted_pending_principal',
    'teacher_account_approved',
    'teacher_account_rejected',
    'student_inactivity_warning',
    'student_inactivity_resolved',
    'student_inactivity_marked_inactive',
    'build_update_available',
  ];
  
  if (schoolEvents.includes(eventType)) return 'school';
  if (homeworkEvents.includes(eventType)) return 'homework';
  if (systemEvents.includes(eventType)) return 'system';
  return 'general';
}

/**
 * Track analytics events for notifications
 */
async function trackAnalyticsEvent(eventName: string, properties: Record<string, unknown>): Promise<void> {
  try {
    console.log(`Analytics: ${eventName}`, properties);
  } catch (error) {
    console.error('Error tracking analytics event:', error);
  }
}

/**
 * Enhanced email sending with signature support
 */
async function sendEnhancedEmailNotification(
  userIds: string[],
  subject: string,
  body: string,
  _eventType: string
): Promise<void> {
  const emails = await getEmailsForUsers(userIds);
  if (emails.length === 0) return;

  const emailsWithSignatures: Array<{ email: string; signature: string | null }> = [];
  for (let i = 0; i < Math.min(userIds.length, emails.length); i++) {
    const userId = userIds[i];
    const email = emails[i];
    const signature = await getUserSignature(userId);
    emailsWithSignatures.push({ email, signature });
  }

  const firstSignature = emailsWithSignatures.find((e) => e.signature)?.signature;
  const emailHtml = `<p>${body}</p>${firstSignature ? `<br><img src="${firstSignature}" alt="Signature" style="max-width: 200px; height: auto;">` : ''}`;

  await sendEmailNotification(emails, subject, emailHtml, body);
}

/**
 * Track notification engagement event
 */
async function trackNotificationEvent(userIds: string[], request: NotificationRequest): Promise<void> {
  try {
    for (const userId of userIds) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('preschool_id')
          .eq('id', userId)
          .single();

        if (profile) {
          await supabase.from('parent_engagement_events').insert({
            preschool_id: profile.preschool_id,
            parent_id: userId,
            event_type: 'notification_sent',
            metadata: {
              notification_type: request.event_type,
              context: {
                thread_id: request.thread_id,
                message_id: request.message_id,
                announcement_id: request.announcement_id,
                assignment_id: request.assignment_id,
                student_id: request.student_id
              }
            }
          });
        }
      } catch {
        // ignore
      }
    }
  } catch (error) {
    console.error('Error tracking notification event:', error);
  }
}

/**
 * Filter users based on their notification preferences for invoice events
 */
async function filterUsersByPreferences(
  userIds: string[],
  eventType: string,
  channel: string = 'email'
): Promise<string[]> {
  if (![
    'new_invoice',
    'invoice_sent',
    'overdue_reminder',
    'payment_confirmed',
    'invoice_viewed',
    'payment_required',
    'subscription_pending_payment'
  ].includes(eventType)) {
    return userIds;
  }

  const filteredUsers: string[] = [];

  try {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, invoice_notification_preferences')
      .in('id', userIds);

    if (profiles) {
      for (const profile of profiles) {
        const prefs = profile.invoice_notification_preferences || {};
        const channelEnabled = prefs.channels?.[channel] !== false;
        const eventEnabled = prefs.events?.[eventType]?.[channel] !== false;

        if (channelEnabled && eventEnabled) {
          filteredUsers.push(profile.id);
        }
      }
    }
  } catch (error) {
    console.error('Error filtering users by preferences:', error);
    return userIds;
  }

  return filteredUsers;
}

/**
 * Prevent duplicate push sends for the same message_id + recipient set.
 * This protects against accidental double invocations of new_message dispatch.
 */
async function filterNewMessageRecipientsByDeliveryHistory(
  userIds: string[],
  messageId?: string
): Promise<string[]> {
  if (!messageId || userIds.length === 0) {
    return userIds;
  }

  try {
    const { data, error } = await supabase
      .from('push_notifications')
      .select('recipient_user_id')
      .eq('notification_type', 'new_message')
      .in('recipient_user_id', userIds)
      .contains('data', { message_id: messageId })
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    if (error) {
      console.warn('[dedup] unable to query existing new_message notifications:', error.message);
      return userIds;
    }

    const alreadyNotified = new Set<string>((data || []).map((row: { recipient_user_id: string }) => row.recipient_user_id));
    if (alreadyNotified.size === 0) {
      return userIds;
    }

    const filtered = userIds.filter((userId) => !alreadyNotified.has(userId));
    console.log(
      `[dedup] new_message message_id=${messageId} original=${userIds.length} already_notified=${alreadyNotified.size} remaining=${filtered.length}`
    );
    return filtered;
  } catch (error) {
    console.warn('[dedup] new_message delivery-history check failed:', error);
    return userIds;
  }
}

/**
 * Get signature for a user if they have email_include_signature enabled
 */
async function getUserSignature(userId: string): Promise<string | null> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('invoice_notification_preferences, signature_public_id')
      .eq('id', userId)
      .single();

    if (profile?.invoice_notification_preferences?.email_include_signature && profile.signature_public_id) {
      const { data: signedUrlData } = await supabase.storage
        .from('signatures')
        .createSignedUrl(profile.signature_public_id, 3600);

      return signedUrlData?.signedUrl || null;
    }
  } catch (error) {
    console.error('Error getting user signature:', error);
  }

  return null;
}

/**
 * Main notification dispatch handler
 */
async function dispatchNotification(request: Request): Promise<Response> {
  try {
    if (!supabase) {
      return new Response(
        JSON.stringify({
          error: 'Supabase client not configured',
          details: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let notificationRequest: NotificationRequest;
    try {
      notificationRequest = await request.json();
    } catch (parseError) {
      console.error('Invalid notification payload:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON payload' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    console.log('Processing notification request:', notificationRequest);
    const expectedExpoProjectId = normalizeExpoProjectId(
      notificationRequest.custom_payload?.expo_project_id ||
      notificationRequest.custom_payload?.expected_expo_project_id
    );
    const requestPlatformFilter = normalizePlatformFilter(notificationRequest.platform_filter);

    // Deduplication: prevent double-send for pop_uploaded (both DB trigger and client may fire)
    if (notificationRequest.event_type === 'pop_uploaded' && notificationRequest.pop_upload_id) {
      const { data: existing } = await supabase
        .from('push_notifications')
        .select('id')
        .eq('notification_type', 'pop_uploaded')
        .eq('preschool_id', notificationRequest.preschool_id || '')
        // Ensure we only dedupe the same POP upload (otherwise we'd suppress distinct uploads within the window).
        .contains('data', { pop_upload_id: notificationRequest.pop_upload_id })
        .gte('created_at', new Date(Date.now() - 60_000).toISOString()) // within last 60s
        .limit(1);

      if (existing && existing.length > 0) {
        console.log(`[dedup] pop_uploaded already sent for pop_upload_id=${notificationRequest.pop_upload_id} within 60s, skipping`);
        return new Response(
          JSON.stringify({ success: true, message: 'Already sent (deduplicated)', recipients: 0 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Handle test notifications
    if (notificationRequest.test) {
      const targetUserId = notificationRequest.target_user_id;
      if (!targetUserId) {
        return new Response(
          JSON.stringify({ error: 'target_user_id required for test notifications' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const context: NotificationContext = {
        invoice_number: 'TEST-001',
        invoice_id: 'test-invoice-id',
        total_amount: 150.00
      };

      const template = getNotificationTemplate(notificationRequest.event_type, context);

      if (notificationRequest.template_override) {
        Object.assign(template, notificationRequest.template_override);
      }

      const channel = notificationRequest.channel || 'email';

      if (channel === 'email') {
        const emails = await getEmailsForUsers([targetUserId]);
        if (emails.length > 0) {
          const signature = await getUserSignature(targetUserId);
          const emailHtml = `<p>${template.body}</p>${signature ? `<br><img src="${signature}" alt="Signature" style="max-width: 200px; height: auto;">` : ''}`;
          await sendEmailNotification(emails, `[TEST] ${template.title}`, emailHtml, template.body);
        }
      } else {
        const pushTokens = await getPushTokensForUsers([targetUserId], {
          expectedExpoProjectId,
        });
        if (pushTokens.length > 0) {
          await sendExpoNotification({
            to: pushTokens.map((t) => t.expo_push_token),
            title: `[TEST] ${template.title}`,
            body: template.body,
            data: template.data
          });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          test: true,
          event_type: notificationRequest.event_type,
          channel: channel,
          recipients: 1
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const recipientEmails = normalizeRecipientEmails(notificationRequest);
    const userIds = await getUsersToNotify(notificationRequest);

    if (userIds.length === 0 && recipientEmails.length === 0) {
      await trackAnalyticsEvent('edudash.notifications.skipped', {
        event_type: notificationRequest.event_type,
        reason: 'no_recipients',
        count: 0
      });

      return new Response(
        JSON.stringify({ success: true, message: 'No users to notify', recipients: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let filteredUserIds: string[] = userIds;

    if (userIds.length > 0) {
      filteredUserIds = await filterUsersByPreferences(userIds, notificationRequest.event_type, 'email');

      if (filteredUserIds.length === 0 && recipientEmails.length === 0) {
        await trackAnalyticsEvent('edudash.notifications.skipped', {
          event_type: notificationRequest.event_type,
          reason: 'disabled_by_preferences',
          count: userIds.length
        });

        return new Response(
          JSON.stringify({
            success: true,
            message: 'All users have disabled notifications for this event',
            recipients: 0,
            original_recipients: userIds.length
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (notificationRequest.event_type === 'new_message') {
        filteredUserIds = await filterNewMessageRecipientsByDeliveryHistory(
          filteredUserIds,
          notificationRequest.message_id
        );

        if (filteredUserIds.length === 0 && recipientEmails.length === 0) {
          return new Response(
            JSON.stringify({
              success: true,
              message: 'Message push already sent for this message_id',
              recipients: 0,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    const pushTokens = filteredUserIds.length > 0
      ? await getPushTokensForUsers(filteredUserIds, {
          expectedExpoProjectId,
          dedupeByUser:
            notificationRequest.event_type === 'build_update_available' ||
            notificationRequest.custom_payload?.dedupe_by_user === true,
          platformFilter: requestPlatformFilter,
        })
      : [];
    console.log(`[dispatch] Event: ${notificationRequest.event_type}, UserIDs: ${filteredUserIds.length}, PushTokens: ${pushTokens.length}`);
    if (pushTokens.length > 0) {
      console.log(`[dispatch] Push tokens found for: ${pushTokens.map(t => t.user_id).join(', ')}`);
    }

    const canSendWebPush = !!WEB_PUSH_URL;

    if (filteredUserIds.length > 0 && pushTokens.length === 0 && !notificationRequest.include_email && recipientEmails.length === 0 && !canSendWebPush) {
      await trackAnalyticsEvent('edudash.notifications.skipped', {
        event_type: notificationRequest.event_type,
        reason: 'no_push_tokens',
        count: filteredUserIds.length
      });

      return new Response(
        JSON.stringify({ success: true, message: 'No push tokens found for users', recipients: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const context = await getNotificationContext(notificationRequest);
    let template = getNotificationTemplate(notificationRequest.event_type, context);

    if (notificationRequest.template_override) {
      template = { ...template, ...notificationRequest.template_override };
    }

    const enhancedData = {
      ...(template.data || {}),
      ...(notificationRequest.custom_payload || {}),
    };

    const expoNotifications: ExpoNotificationPayload[] = pushTokens.map((tokenInfo) => ({
      to: [tokenInfo.expo_push_token],
      title: template.title,
      body: template.body,
      data: {
        ...enhancedData,
        user_id: tokenInfo.user_id,
        recipient_id: tokenInfo.user_id,
        target_user_id: tokenInfo.user_id
      },
      sound: template.sound,
      badge: template.badge,
      priority: template.priority,
      channelId: template.channelId,
      ttl: 86400,
      ...(template._contentAvailable && { _contentAvailable: true }),
      ...(template.categoryId && { categoryId: template.categoryId })
    }));

    const expoResults: ExpoResult[] = [];

    if (notificationRequest.send_immediately !== false) {
      for (const notification of expoNotifications) {
        try {
          const result = await sendExpoNotification(notification);
          expoResults.push(result);
        } catch (error) {
          console.error('Failed to send notification to:', notification.to[0], error);
          expoResults.push({ success: false, error: String(error) });
        }
      }
    }

    if (filteredUserIds.length > 0 && canSendWebPush) {
      try {
        const webPushResult = await sendWebPushNotification(
          filteredUserIds,
          template,
          notificationRequest.event_type,
          enhancedData
        );
        if (!webPushResult.success) {
          console.warn('Web push notification failed:', webPushResult.error);
        }
      } catch (webPushError) {
        console.error('Error sending web push notifications:', webPushError);
      }
    }

    const expoResult = expoResults.length > 0 ? expoResults[0] : undefined;
    if (filteredUserIds.length > 0) {
      await recordNotification(filteredUserIds, template, notificationRequest, expoResult, enhancedData);
    }

    // Mark messages as delivered server-side when push is sent for message events.
    // This is the most reliable delivery receipt — the server confirms the push was
    // accepted by Expo/APNS/FCM, meaning the message reached the recipient's device.
    if (
      notificationRequest.event_type === 'new_message' &&
      notificationRequest.thread_id &&
      supabase &&
      expoResults.some((r) => r.success)
    ) {
      try {
        const deliveredUserIds = pushTokens
          .filter((_, i) => expoResults[i]?.success)
          .map((t) => t.user_id);
        // Use direct UPDATE (not RPC) because service-role has no auth.uid() context.
        // Logic matches mark_messages_delivered: set delivered_at on messages NOT sent
        // by the recipient in this thread.
        for (const uid of deliveredUserIds) {
          const { error: deliveryError, count } = await supabase
            .from('messages')
            .update({ delivered_at: new Date().toISOString() })
            .eq('thread_id', notificationRequest.thread_id)
            .neq('sender_id', uid)
            .is('delivered_at', null)
            .is('deleted_at', null);
          if (deliveryError) {
            console.warn(`[dispatch] mark_delivered failed for ${uid}:`, deliveryError.message);
          }
        }
        console.log(`[dispatch] ✅ Marked messages as delivered for ${deliveredUserIds.length} user(s) in thread ${notificationRequest.thread_id}`);
      } catch (deliveryErr) {
        console.warn('[dispatch] Failed to mark messages as delivered:', deliveryErr);
      }
    }

    const isInvoiceEvent = [
      'new_invoice',
      'invoice_sent',
      'overdue_reminder',
      'payment_confirmed',
      'invoice_viewed',
      'payment_required',
      'subscription_pending_payment'
    ].includes(notificationRequest.event_type);

    const emailOverride = notificationRequest.email_template_override;
    const emailSubject = emailOverride?.subject ?? template.title;
    const emailText = emailOverride?.text ?? template.body;
    const emailHtml = emailOverride?.html ?? `<p>${template.body}</p>`;

    if (recipientEmails.length > 0 && notificationRequest.include_email !== false) {
      try {
        await sendEmailNotification(recipientEmails, emailSubject, emailHtml, emailText);
      } catch (emailError) {
        console.error('Error sending direct email notifications:', emailError);
      }
    }

    if (filteredUserIds.length > 0 && (isInvoiceEvent || notificationRequest.include_email)) {
      try {
        await sendEnhancedEmailNotification(
          filteredUserIds,
          template.title,
          template.body,
          notificationRequest.event_type
        );
      } catch (emailError) {
        console.error('Error sending email notifications:', emailError);
      }
    }

    const pushSuccessCount = expoResults.filter((result) => result.success).length;
    const pushFailureCount = expoResults.filter((result) => result.success === false).length;

    await trackAnalyticsEvent('edudash.notifications.sent', {
      event_type: notificationRequest.event_type,
      channel: isInvoiceEvent ? 'email' : 'push',
      recipients: filteredUserIds.length + recipientEmails.length,
      success_count: pushSuccessCount + (isInvoiceEvent ? filteredUserIds.length : 0) + recipientEmails.length,
      failure_count: pushFailureCount
    });

    if (filteredUserIds.length > 0) {
      await trackNotificationEvent(filteredUserIds, notificationRequest);
    }

    // ── Applicant confirmation email (new_job_application only) ──────
    if (notificationRequest.event_type === 'new_job_application' && context.candidate_email) {
      try {
        const appUrl = Deno.env.get('APP_URL') || 'https://app.edudashpro.com';
        const supportEmail = Deno.env.get('SUPPORT_EMAIL') || 'support@edudashpro.org.za';
        const candidateName = context.candidate_name || 'Applicant';
        const jobTitle = context.job_title || 'the open position';
        const schoolName = context.school_name || 'the school';

        const confirmationHtml = renderEduDashProEmail({
          title: 'Application Received',
          preheader: `Your application for ${jobTitle} at ${schoolName} has been received`,
          subtitle: `Hi ${candidateName}`,
          bodyHtml: `
            <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 1.7;">
              Thank you for applying for <strong>${jobTitle}</strong> at <strong>${schoolName}</strong>.
              We have received your application and it is now being reviewed by the hiring team.
            </p>
            <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 1.7;">
              <strong>What happens next?</strong>
            </p>
            <ul style="margin: 0 0 16px 0; padding-left: 20px; color: #334155; font-size: 14px; line-height: 1.7;">
              <li>The school will review all applications</li>
              <li>Shortlisted candidates will be contacted for an interview</li>
              <li>You may be asked to provide additional documents or references</li>
            </ul>
            <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 1.7;">
              If you have any questions, feel free to reach out to us at
              <a href="mailto:${supportEmail}" style="color: #6d28d9; text-decoration: none; font-weight: 600;">${supportEmail}</a>.
            </p>
            <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.6;">
              We wish you the best of luck! 🍀
            </p>
          `,
          cta: {
            label: 'Visit EduDash Pro',
            url: appUrl,
          },
          footerNote: 'You are receiving this email because you submitted a job application via EduDash Pro.',
          supportEmail,
        });

        await sendEmailNotification(
          [context.candidate_email],
          `Application Received – ${jobTitle} at ${schoolName}`,
          confirmationHtml,
          `Hi ${candidateName}, thank you for applying for ${jobTitle} at ${schoolName}. Your application has been received and is being reviewed. Shortlisted candidates will be contacted for an interview. Good luck!`
        );

        console.log(`[new_job_application] Confirmation email sent to applicant: ${context.candidate_email}`);
      } catch (confirmErr) {
        // Never block the principal notification if applicant email fails
        console.error('[new_job_application] Failed to send applicant confirmation email:', confirmErr);
      }
    }

    console.log(`Notification dispatched to ${pushTokens.length} devices and ${filteredUserIds.length} email recipients`);

    return new Response(
      JSON.stringify({
        success: true,
        recipients: pushTokens.length,
        email_recipients: (isInvoiceEvent ? filteredUserIds.length : 0) + recipientEmails.length,
        user_count: filteredUserIds.length,
        original_user_count: userIds.length,
        direct_email_recipients: recipientEmails.length,
        event_type: notificationRequest.event_type,
        expo_result: expoResult,
        push_success_count: pushSuccessCount,
        push_failure_count: pushFailureCount,
        expected_expo_project_id: expectedExpoProjectId || null,
        sent_immediately: notificationRequest.send_immediately !== false,
        preferences_filtered: userIds.length - filteredUserIds.length
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error dispatching notification:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to dispatch notification',
        details: (error as Error).message
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

interface DatabaseTriggerPayload {
  record: Record<string, unknown>;
  old_record?: Record<string, unknown>;
  type: string;
  table: string;
}

/**
 * Handle database triggers for automatic notifications
 */
async function handleDatabaseTrigger(request: Request): Promise<Response> {
  try {
    const { record, old_record, type, table }: DatabaseTriggerPayload = await request.json();
    console.log('Processing database trigger:', { type, table, record_id: record?.id });

    let notificationRequest: NotificationRequest | null = null;

    switch (table) {
      case 'messages':
        if (type === 'INSERT') {
          notificationRequest = {
            event_type: 'new_message',
            thread_id: record.thread_id as string,
            message_id: record.id as string,
            send_immediately: true
          };
        }
        break;

      case 'announcements':
        if (type === 'INSERT' && record.is_published) {
          notificationRequest = {
            event_type: 'new_announcement',
            preschool_id: record.preschool_id as string,
            announcement_id: record.id as string,
            send_immediately: true
          };
        }
        break;

      case 'homework_submissions':
        if (type === 'UPDATE' && record.status === 'graded' && old_record?.status !== 'graded') {
          notificationRequest = {
            event_type: 'homework_graded',
            student_id: record.student_id as string,
            assignment_id: record.assignment_id as string,
            send_immediately: true
          };
        }
        break;

      case 'pop_uploads':
        if (type === 'INSERT' && record.upload_type === 'proof_of_payment') {
          console.log('[db-trigger] pop_uploads INSERT detected, id:', record.id);
          notificationRequest = {
            event_type: 'pop_uploaded',
            pop_upload_id: record.id as string,
            preschool_id: record.preschool_id as string,
            student_id: record.student_id as string,
            upload_type: record.upload_type as string,
            payment_amount: record.payment_amount,
            payment_reference: record.payment_reference as string,
            send_immediately: true,
          };
        }
        break;

      case 'job_applications':
        if (type === 'INSERT') {
          console.log('[db-trigger] job_applications INSERT detected, id:', record.id);
          notificationRequest = {
            event_type: 'new_job_application',
            job_application_id: record.id as string,
            job_posting_id: record.job_posting_id as string,
            send_immediately: true,
          };
        }
        break;

      default:
        return new Response(
          JSON.stringify({ success: true, skipped: true }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    }

    if (!notificationRequest) {
      return new Response(
        JSON.stringify({ success: true, skipped: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return await dispatchNotification(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notificationRequest)
      })
    );
  } catch (error) {
    console.error('Error processing database trigger:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to process database trigger',
        details: (error as Error).message
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Handle scheduled notifications (e.g., assignment reminders)
 */
async function handleScheduledNotifications(_request: Request): Promise<Response> {
  try {
    console.log('Running scheduled notification check');

    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    let trialsNotified = 0;

    try {
      const { data: trials } = await supabase
        .from('subscriptions')
        .select('id, school_id, plan_id, trial_end_date, status')
        .not('trial_end_date', 'is', null)
        .gte('trial_end_date', now.toISOString())
        .lte('trial_end_date', tomorrow.toISOString())
        .eq('status', 'active');

      if (trials) {
        for (const sub of trials) {
          try {
            const response = await dispatchNotification(
              new Request('http://localhost', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  event_type: 'trial_ending',
                  preschool_id: sub.school_id,
                  plan_tier: sub.plan_id,
                  role_targets: ['principal', 'principal_admin', 'super_admin'],
                  include_email: true,
                  custom_payload: { trial_end_date: sub.trial_end_date }
                })
              })
            );
            const result = await response.json();
            if (result.success) trialsNotified += result.recipients || 0;
          } catch (e) {
            console.error('Failed to notify trial ending', e);
          }
        }
      }
    } catch (e) {
      console.error('Trial ending query failed', e);
    }

    const { data: dueSoonAssignments } = await supabase
      .from('homework_assignments')
      .select('id, title, due_date, class_id, preschool_id')
      .gte('due_date', now.toISOString())
      .lte('due_date', tomorrow.toISOString())
      .eq('is_active', true);

    let notificationsSent = 0;

    if (dueSoonAssignments) {
      for (const assignment of dueSoonAssignments) {
        try {
          const response = await dispatchNotification(
            new Request('http://localhost', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                event_type: 'assignment_due_soon',
                assignment_id: assignment.id,
                preschool_id: assignment.preschool_id,
                send_immediately: true
              })
            })
          );
          const result = await response.json();
          if (result.success) {
            notificationsSent += result.recipients || 0;
          }
        } catch (error) {
          console.error(`Error sending due soon notification for assignment ${assignment.id}:`, error);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        assignments_checked: dueSoonAssignments?.length || 0,
        notifications_sent: notificationsSent,
        trials_notified: trialsNotified
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error handling scheduled notifications:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to handle scheduled notifications',
        details: (error as Error).message
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Main request handler
 */
async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  if (!supabase) {
    return new Response(
      JSON.stringify({
        error: 'Supabase client not configured',
        details: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (url.pathname.includes('trigger')) {
    return await handleDatabaseTrigger(request);
  } else if (url.pathname.includes('scheduled')) {
    return await handleScheduledNotifications(request);
  } else {
    return await dispatchNotification(request);
  }
}

// Optional email support via Resend
async function getEmailsForUsers(userIds: string[]): Promise<string[]> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('id,email')
      .in('id', userIds);
    return (data || []).map((r: { email?: string }) => r.email).filter(Boolean) as string[];
  } catch (e) {
    console.error('Failed to fetch emails for users', e);
    return [];
  }
}

async function sendEmailNotification(
  to: string[],
  subject: string,
  html?: string,
  text?: string
): Promise<void> {
  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'EduDash Pro <support@edudashpro.org.za>';
    const SUPPORT_EMAIL = Deno.env.get('SUPPORT_EMAIL') || 'support@edudashpro.org.za';

    if (!RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not configured; skipping email send');
      return;
    }

    const hasFullHtmlDoc = (content?: string) =>
      !!content && (content.includes('<html') || content.includes('<!DOCTYPE'));

    const baseHtml = html
      ? html
      : text
        ? `<p>${String(text).replace(/\r?\n/g, '<br />')}</p>`
        : '';

    const wrappedHtml = baseHtml
      ? hasFullHtmlDoc(baseHtml)
        ? baseHtml
        : renderEduDashProEmail({
            title: subject,
            preheader: subject,
            bodyHtml: baseHtml,
            supportEmail: SUPPORT_EMAIL,
          })
      : undefined;

    const payload = {
      from: EMAIL_FROM,
      to,
      subject,
      html: wrappedHtml,
      text: text || undefined,
      reply_to: SUPPORT_EMAIL,
    };

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      console.error('Resend API error', await res.text());
    }
  } catch (e) {
    console.error('Email send failed', e);
  }
}

// CORS configuration
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': Deno.env.get('CORS_ALLOW_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Vary': 'Origin'
};

// Start HTTP server with CORS handling and route dispatch
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const res = await handleRequest(req);
    res.headers.set('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    res.headers.set('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
    res.headers.set('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
    res.headers.set('Vary', 'Origin');
    return res;
  } catch (error) {
    const res = new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        details: (error as Error)?.message || String(error)
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
    res.headers.set('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    res.headers.set('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
    res.headers.set('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
    res.headers.set('Vary', 'Origin');
    return res;
  }
});
