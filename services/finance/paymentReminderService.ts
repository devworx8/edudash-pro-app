import { assertSupabase } from '@/lib/supabase';
import { SchoolSettingsService } from '@/lib/services/SchoolSettingsService';
import { getMonthStartISO } from '@/lib/utils/dateUtils';
import {
  getStudentFeeMonthInfo,
  shouldExcludeStudentFeeFromMonthScopedViews,
} from '@/lib/utils/studentFeeMonth';
import {
  getOutstandingAmountForFee,
  isStudentActiveForReceivables,
} from '@/services/finance/feeHelpers';
import { normalizeMonthIso, nextMonthIso } from './dateHelpers';

interface ReminderStudentTarget {
  studentId: string;
  studentName: string;
  outstandingAmount: number;
  pendingCount: number;
  overdueCount: number;
  dueDate: string | null;
  studentFeeId: string | null;
  parentIds: string[];
}

interface ReminderParentProfile {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

interface ReminderRecipient {
  parentId: string;
  parentName: string;
  email: string | null;
  students: ReminderStudentTarget[];
  totalOutstanding: number;
  pendingCount: number;
  overdueCount: number;
}

export interface SendReceivablePaymentRemindersParams {
  orgId: string;
  monthIso: string;
  monthLabel: string;
  createdBy: string;
}

export interface SendReceivablePaymentRemindersResult {
  targetedStudents: number;
  parentAccounts: number;
  remindersSent: number;
  emailsSent: number;
  failedRecipients: number;
  studentsWithoutContacts: number;
  reminderRowsLogged: number;
}

const UNPAID_STATUSES = ['pending', 'overdue', 'partially_paid', 'pending_verification'];
const QUERY_LIMIT = 5000;

const formatCurrency = (amount: number): string => `R${Number(amount || 0).toFixed(2)}`;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const firstNonEmpty = (...values: Array<string | null | undefined>): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return '';
};

const pluralize = (count: number, singular: string, plural = `${singular}s`): string =>
  `${count} ${count === 1 ? singular : plural}`;

const formatDueDate = (dateString?: string | null): string => {
  if (!dateString) return 'this billing month';
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return 'this billing month';
  return parsed.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const buildStudentLine = (student: ReminderStudentTarget): string => {
  const statusParts: string[] = [];
  if (student.overdueCount > 0) {
    statusParts.push(`${pluralize(student.overdueCount, 'overdue item')}`);
  }
  if (student.pendingCount > 0) {
    statusParts.push(`${pluralize(student.pendingCount, 'pending item')}`);
  }
  const statusText = statusParts.length > 0 ? ` • ${statusParts.join(' • ')}` : '';
  return `${student.studentName}: ${formatCurrency(student.outstandingAmount)}${statusText}`;
};

const buildReminderContent = (
  recipient: ReminderRecipient,
  schoolName: string,
  monthLabel: string,
  parentPaymentsUrl: string,
) => {
  const totalOutstanding = formatCurrency(recipient.totalOutstanding);
  const learnerLabel =
    recipient.students.length === 1
      ? recipient.students[0]?.studentName || 'your child'
      : `${recipient.students.length} learners`;
  const overdueSummary =
    recipient.overdueCount > 0
      ? `${pluralize(recipient.overdueCount, 'overdue item')}`
      : `${pluralize(recipient.pendingCount, 'pending item')}`;
  const pushTitle = 'Payment Reminder';
  const pushBody = `${totalOutstanding} is still outstanding for ${learnerLabel} (${monthLabel}). ${overdueSummary}. Please pay or upload POP in EduDash Pro.`;
  const emailSubject = `Payment Reminder for ${monthLabel} - ${schoolName}`;
  const studentLines = recipient.students.map(buildStudentLine);
  const emailText = [
    `Dear ${recipient.parentName || 'Parent'},`,
    '',
    `This is a friendly reminder from ${schoolName}.`,
    '',
    `Outstanding balance for ${monthLabel}: ${totalOutstanding}`,
    ...studentLines.map((line) => `- ${line}`),
    '',
    'Please make payment or upload your proof of payment in EduDash Pro.',
    `Open: ${parentPaymentsUrl}`,
    '',
    'If you have already made payment, please ignore this reminder.',
  ].join('\n');
  const studentListHtml = recipient.students
    .map(
      (student) =>
        `<li style="margin-bottom:8px;">${escapeHtml(buildStudentLine(student))} <span style="color:#64748B;">(due ${escapeHtml(formatDueDate(student.dueDate))})</span></li>`,
    )
    .join('');
  const emailHtml = `
    <div style="font-family:Arial,sans-serif;color:#0F172A;line-height:1.7;">
      <p>Dear ${escapeHtml(recipient.parentName || 'Parent')},</p>
      <p>This is a friendly reminder from <strong>${escapeHtml(schoolName)}</strong>.</p>
      <p>
        We still have an outstanding balance of <strong>${escapeHtml(totalOutstanding)}</strong>
        for <strong>${escapeHtml(monthLabel)}</strong>.
      </p>
      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px;margin:18px 0;">
        <div style="font-weight:700;margin-bottom:10px;">Learners and balances</div>
        <ul style="padding-left:18px;margin:0;">${studentListHtml}</ul>
      </div>
      <p>Please make payment or upload your proof of payment in EduDash Pro.</p>
      <p style="margin:24px 0;">
        <a
          href="${parentPaymentsUrl}"
          style="display:inline-block;background:#4F46E5;color:#FFFFFF;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700;"
        >
          Open Parent Payments
        </a>
      </p>
      <p>If you have already made payment, please ignore this reminder.</p>
      <p>Warm regards,<br /><strong>${escapeHtml(schoolName)}</strong></p>
    </div>
  `;

  return {
    pushTitle,
    pushBody,
    emailSubject,
    emailText,
    emailHtml,
  };
};

export function buildReceivableReminderRecipients(
  targets: ReminderStudentTarget[],
  profiles: ReminderParentProfile[],
): ReminderRecipient[] {
  const profileMap = new Map<string, ReminderParentProfile>();
  for (const profile of profiles) {
    if (profile?.id) {
      profileMap.set(profile.id, profile);
    }
  }

  const grouped = new Map<
    string,
    ReminderRecipient & {
      studentIds: Set<string>;
    }
  >();

  for (const target of targets) {
    for (const parentId of target.parentIds) {
      const profile = profileMap.get(parentId);
      if (!profile) continue;

      const existing = grouped.get(parentId) || {
        parentId,
        parentName:
          firstNonEmpty(
            `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
            'Parent',
          ) || 'Parent',
        email: profile.email || null,
        students: [],
        studentIds: new Set<string>(),
        totalOutstanding: 0,
        pendingCount: 0,
        overdueCount: 0,
      };

      if (existing.studentIds.has(target.studentId)) {
        grouped.set(parentId, existing);
        continue;
      }

      existing.studentIds.add(target.studentId);
      existing.students.push(target);
      existing.totalOutstanding += target.outstandingAmount;
      existing.pendingCount += target.pendingCount;
      existing.overdueCount += target.overdueCount;
      grouped.set(parentId, existing);
    }
  }

  return Array.from(grouped.values())
    .map((recipient) => ({
      parentId: recipient.parentId,
      parentName: recipient.parentName,
      email: recipient.email,
      students: [...recipient.students].sort((a, b) => a.studentName.localeCompare(b.studentName)),
      totalOutstanding: Number(recipient.totalOutstanding.toFixed(2)),
      pendingCount: recipient.pendingCount,
      overdueCount: recipient.overdueCount,
    }))
    .sort((a, b) => b.totalOutstanding - a.totalOutstanding);
}

async function getReceivableReminderTargets(
  orgId: string,
  monthIso: string,
): Promise<ReminderStudentTarget[]> {
  const supabase = assertSupabase();
  const month = normalizeMonthIso(monthIso);
  const next = nextMonthIso(month);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  let feesData: any[] = [];

  const monthScopedQuery = await supabase
    .from('student_fees')
    .select(
      `id, student_id, status, due_date, billing_month, amount, final_amount, amount_paid, amount_outstanding, students!inner(id, first_name, last_name, parent_id, guardian_id, is_active, status, enrollment_date, preschool_id, organization_id)`,
    )
    .or(`preschool_id.eq.${orgId},organization_id.eq.${orgId}`, { foreignTable: 'students' })
    .eq('billing_month', month)
    .in('status', UNPAID_STATUSES)
    .limit(QUERY_LIMIT);

  const missingBillingMonth =
    Boolean(monthScopedQuery.error) &&
    (monthScopedQuery.error?.code === '42703' ||
      String(monthScopedQuery.error?.message || '').toLowerCase().includes('billing_month'));

  if (missingBillingMonth) {
    const fallbackQuery = await supabase
      .from('student_fees')
      .select(
        `id, student_id, status, due_date, amount, final_amount, amount_paid, amount_outstanding, students!inner(id, first_name, last_name, parent_id, guardian_id, is_active, status, enrollment_date, preschool_id, organization_id)`,
      )
      .or(`preschool_id.eq.${orgId},organization_id.eq.${orgId}`, { foreignTable: 'students' })
      .gte('due_date', month)
      .lt('due_date', next)
      .in('status', UNPAID_STATUSES)
      .limit(QUERY_LIMIT);

    if (fallbackQuery.error) {
      throw new Error(fallbackQuery.error.message || 'Failed to load receivable reminders');
    }

    feesData = fallbackQuery.data || [];
  } else if (monthScopedQuery.error) {
    throw new Error(monthScopedQuery.error.message || 'Failed to load receivable reminders');
  } else {
    feesData = monthScopedQuery.data || [];
  }

  const targetMap = new Map<
    string,
    ReminderStudentTarget & {
      parentIdSet: Set<string>;
    }
  >();

  for (const fee of feesData) {
    const status = String(fee?.status || '').toLowerCase();
    if (!UNPAID_STATUSES.includes(status)) continue;

    const studentData = Array.isArray(fee?.students) ? fee.students[0] : fee?.students;
    const studentId = String(fee?.student_id || studentData?.id || '').trim();
    if (!studentId) continue;
    if (!isStudentActiveForReceivables(studentData)) continue;

    const enrollmentDateValue = String(studentData?.enrollment_date || '').trim();
    if (shouldExcludeStudentFeeFromMonthScopedViews(fee, enrollmentDateValue || null)) {
      const enrollmentMonthIso = enrollmentDateValue
        ? getMonthStartISO(enrollmentDateValue, { recoverUtcMonthBoundary: true })
        : null;
      const { effectiveMonthIso, hasBillingMonthDrift } = getStudentFeeMonthInfo(fee);
      if (!hasBillingMonthDrift && effectiveMonthIso && enrollmentMonthIso && effectiveMonthIso < enrollmentMonthIso) {
        continue;
      }
      continue;
    }

    const outstandingAmount = getOutstandingAmountForFee(fee);
    if (!Number.isFinite(outstandingAmount) || outstandingAmount <= 0) continue;

    const dueDateValue = fee?.due_date ? String(fee.due_date) : null;
    const dueDate = dueDateValue ? new Date(dueDateValue) : null;
    const isVerificationPending = status === 'pending_verification';
    const isOverdueByStatus = status === 'overdue';
    const isOverdueByDate =
      dueDate instanceof Date && !Number.isNaN(dueDate.getTime()) && dueDate < todayStart;
    const finalIsOverdue = !isVerificationPending && (isOverdueByStatus || isOverdueByDate);

    const existing = targetMap.get(studentId) || {
      studentId,
      studentName:
        firstNonEmpty(
          `${studentData?.first_name || ''} ${studentData?.last_name || ''}`.trim(),
          'Learner',
        ) || 'Learner',
      outstandingAmount: 0,
      pendingCount: 0,
      overdueCount: 0,
      dueDate: null,
      studentFeeId: null,
      parentIds: [],
      parentIdSet: new Set<string>(),
    };

    existing.outstandingAmount += outstandingAmount;
    if (finalIsOverdue) existing.overdueCount += 1;
    else existing.pendingCount += 1;

    if (dueDateValue && (!existing.dueDate || dueDateValue < existing.dueDate)) {
      existing.dueDate = dueDateValue;
      existing.studentFeeId = fee?.id ? String(fee.id) : null;
    } else if (!existing.studentFeeId && fee?.id) {
      existing.studentFeeId = String(fee.id);
    }

    const directParentIds = [studentData?.parent_id, studentData?.guardian_id]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    for (const parentId of directParentIds) {
      existing.parentIdSet.add(parentId);
    }

    targetMap.set(studentId, existing);
  }

  const targetStudentIds = Array.from(targetMap.keys());
  if (targetStudentIds.length === 0) {
    return [];
  }

  const { data: relationshipRows, error: relationshipError } = await supabase
    .from('student_parent_relationships')
    .select('student_id, parent_id')
    .in('student_id', targetStudentIds);

  if (relationshipError) {
    console.warn('[paymentReminderService] Failed to load student-parent relationships:', relationshipError);
  } else {
    for (const row of relationshipRows || []) {
      const studentId = String((row as any)?.student_id || '').trim();
      const parentId = String((row as any)?.parent_id || '').trim();
      if (!studentId || !parentId) continue;
      const target = targetMap.get(studentId);
      if (!target) continue;
      target.parentIdSet.add(parentId);
    }
  }

  return Array.from(targetMap.values())
    .map((target) => ({
      studentId: target.studentId,
      studentName: target.studentName,
      outstandingAmount: Number(target.outstandingAmount.toFixed(2)),
      pendingCount: target.pendingCount,
      overdueCount: target.overdueCount,
      dueDate: target.dueDate,
      studentFeeId: target.studentFeeId,
      parentIds: Array.from(target.parentIdSet),
    }))
    .sort((a, b) => b.outstandingAmount - a.outstandingAmount);
}

export async function sendReceivablePaymentReminders(
  params: SendReceivablePaymentRemindersParams,
): Promise<SendReceivablePaymentRemindersResult> {
  const { orgId, monthIso, monthLabel, createdBy } = params;
  const supabase = assertSupabase();
  const reminderTargets = await getReceivableReminderTargets(orgId, monthIso);

  if (reminderTargets.length === 0) {
    return {
      targetedStudents: 0,
      parentAccounts: 0,
      remindersSent: 0,
      emailsSent: 0,
      failedRecipients: 0,
      studentsWithoutContacts: 0,
      reminderRowsLogged: 0,
    };
  }

  const allParentIds = Array.from(
    new Set(reminderTargets.flatMap((target) => target.parentIds).filter(Boolean)),
  );

  const { data: parentProfiles, error: parentProfilesError } = allParentIds.length
    ? await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', allParentIds)
    : { data: [], error: null };

  if (parentProfilesError) {
    throw new Error(parentProfilesError.message || 'Failed to load parent contacts');
  }

  const recipients = buildReceivableReminderRecipients(
    reminderTargets,
    (parentProfiles || []) as ReminderParentProfile[],
  );

  const reachableParentIds = new Set(recipients.map((recipient) => recipient.parentId));
  const studentsWithoutContacts = reminderTargets.filter(
    (target) => !target.parentIds.some((parentId) => reachableParentIds.has(parentId)),
  ).length;

  if (recipients.length === 0) {
    return {
      targetedStudents: reminderTargets.length,
      parentAccounts: 0,
      remindersSent: 0,
      emailsSent: 0,
      failedRecipients: 0,
      studentsWithoutContacts,
      reminderRowsLogged: 0,
    };
  }

  let schoolName = 'Your school';
  try {
    const settings = await SchoolSettingsService.get(orgId);
    schoolName = settings.schoolName || schoolName;
  } catch (error) {
    console.warn('[paymentReminderService] Failed to load school settings:', error);
  }

  const appBaseUrl =
    process.env.EXPO_PUBLIC_APP_WEB_URL ||
    process.env.EXPO_PUBLIC_WEB_URL ||
    'https://app.edudashpro.org.za';
  const parentPaymentsUrl = `${appBaseUrl}/screens/parent-payments`;

  let remindersSent = 0;
  let emailsSent = 0;
  let failedRecipients = 0;
  const reminderRows: Array<Record<string, any>> = [];
  const sentAt = new Date().toISOString();

  for (const recipient of recipients) {
    const content = buildReminderContent(recipient, schoolName, monthLabel, parentPaymentsUrl);
    const primaryStudent = recipient.students[0];
    let pushLogged = false;
    let emailSent = false;
    let pushDispatchWorked = false;

    try {
      const { error } = await supabase
        .from('push_notifications')
        .insert({
          recipient_user_id: recipient.parentId,
          title: content.pushTitle,
          body: content.pushBody,
          notification_type: 'payment_required',
          preschool_id: orgId,
          status: 'sent',
          data: {
            type: 'payment_reminder',
            source: 'finance_receivables',
            student_id: primaryStudent?.studentId || null,
            student_ids: recipient.students.map((student) => student.studentId),
            month_iso: monthIso,
            month_label: monthLabel,
            outstanding_amount: recipient.totalOutstanding,
            parent_payments_url: parentPaymentsUrl,
          },
        });

      if (!error) {
        pushLogged = true;
      } else {
        console.warn('[paymentReminderService] Failed to log push notification:', error);
      }
    } catch (error) {
      console.warn('[paymentReminderService] Failed to insert push notification:', error);
    }

    try {
      const { data, error } = await supabase.functions.invoke('notifications-dispatcher', {
        body: {
          event_type: 'payment_required',
          user_ids: [recipient.parentId],
          preschool_id: orgId,
          student_id: primaryStudent?.studentId || undefined,
          send_immediately: true,
          include_email: false,
          template_override: {
            title: content.pushTitle,
            body: content.pushBody,
            data: {
              type: 'payment_reminder',
              screen: 'parent-payments',
              source: 'finance_receivables',
              month_iso: monthIso,
              month_label: monthLabel,
              outstanding_amount: recipient.totalOutstanding,
              student_id: primaryStudent?.studentId || null,
              student_ids: recipient.students.map((student) => student.studentId),
              action_url: parentPaymentsUrl,
            },
          },
          custom_payload: {
            message: content.pushBody,
            reminder_kind: 'finance_receivables',
            action_url: parentPaymentsUrl,
          },
        },
      });

      if (error) {
        console.warn('[paymentReminderService] Failed to dispatch reminder notification:', error);
      } else {
        pushDispatchWorked = Number((data as any)?.recipients || 0) > 0;
      }
    } catch (error) {
      console.warn('[paymentReminderService] Reminder dispatch threw:', error);
    }

    if (recipient.email) {
      try {
        const { data, error } = await supabase.functions.invoke('send-email', {
          body: {
            to: recipient.email,
            subject: content.emailSubject,
            body: content.emailHtml,
            is_html: true,
            confirmed: true,
          },
        });

        if (error) {
          console.warn('[paymentReminderService] Failed to send payment reminder email:', error);
        } else if ((data as any)?.success === false) {
          console.warn('[paymentReminderService] Payment reminder email was rejected:', data);
        } else {
          emailSent = true;
          emailsSent += 1;
        }
      } catch (error) {
        console.warn('[paymentReminderService] Payment reminder email threw:', error);
      }
    }

    const recipientSucceeded = pushLogged || pushDispatchWorked || emailSent;
    if (recipientSucceeded) remindersSent += 1;
    else failedRecipients += 1;

    const communicationMethod = [pushLogged || pushDispatchWorked ? 'push' : null, emailSent ? 'email' : null]
      .filter(Boolean)
      .join('+') || 'manual';

    for (const student of recipient.students) {
      reminderRows.push({
        amount: Number(student.outstandingAmount.toFixed(2)),
        communication_method: communicationMethod,
        created_by: createdBy,
        due_date: student.dueDate || monthIso,
        message_content: content.emailText,
        metadata: {
          month_iso: monthIso,
          month_label: monthLabel,
          source: 'finance_receivables',
          recipient_user_id: recipient.parentId,
          recipient_email: recipient.email,
          school_name: schoolName,
          outstanding_amount: student.outstandingAmount,
          overdue_count: student.overdueCount,
          pending_count: student.pendingCount,
          learner_name: student.studentName,
          learner_ids_for_parent: recipient.students.map((entry) => entry.studentId),
        },
        preschool_id: orgId,
        sent_at: recipientSucceeded ? sentAt : null,
        sent_to: recipient.email || recipient.parentId,
        status: recipientSucceeded ? 'sent' : 'failed',
        student_fee_id: student.studentFeeId,
        student_id: student.studentId,
        subject: content.emailSubject,
        type: student.overdueCount > 0 ? 'overdue' : 'pending',
      });
    }
  }

  let reminderRowsLogged = 0;
  if (reminderRows.length > 0) {
    try {
      const { error } = await supabase.from('payment_reminders').insert(reminderRows);
      if (error) {
        console.warn('[paymentReminderService] Failed to log payment reminders:', error);
      } else {
        reminderRowsLogged = reminderRows.length;
      }
    } catch (error) {
      console.warn('[paymentReminderService] Logging payment reminders threw:', error);
    }
  }

  return {
    targetedStudents: reminderTargets.length,
    parentAccounts: recipients.length,
    remindersSent,
    emailsSent,
    failedRecipients,
    studentsWithoutContacts,
    reminderRowsLogged,
  };
}
