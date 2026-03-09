/**
 * Pure helper functions for student fee management.
 * No React hooks — async business logic extracted from the screen.
 *
 * NOTE: The `bootstrapFeesIfMissing()` function is the client-side
 * equivalent of the `generate-monthly-fees` Edge Function. If you
 * change the fee selection or bootstrap logic here, mirror those
 * changes in `supabase/functions/generate-monthly-fees/index.ts`.
 *
 * TODO(deferred): `resolveFromSchoolFees()` bridges `school_fee_structures`
 * into `fee_structures` by creating a mirrored row at runtime. A future
 * migration should unify these two tables so this bridge is unnecessary.
 */

import { Linking } from 'react-native';
import { assertSupabase } from '@/lib/supabase';
import { selectFeeStructureForChild } from '@/lib/utils/feeStructureSelector';
import { isTuitionFee } from '@/lib/utils/feeUtils';
import {
  buildManualFeePaymentReference,
  fetchReceiptUrlByPaymentReference,
  finalizePaidFlow,
} from '@/services/finance/paidFlowService';
import type {
  Student,
  StudentFee,
  FeeStructureRow,
  SchoolFeeStructureRow,
  ParentProfileRow,
} from './types';
import { isRegistrationFeeEntry } from './types';

export type FeeSetupStatus = 'unknown' | 'ready' | 'missing' | 'school_only' | 'skipped_inactive';

// ── Pure helpers ────────────────────────────────────────────────

export function getEnrollmentMonthStart(date?: string | null): Date | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function mapFeeRow(f: any): StudentFee {
  const amount = Number(f.amount || 0);
  const finalAmount = Number(f.final_amount || amount);
  const discountAmount = Number(f.discount_amount || 0);
  const amountPaid = Number(f.amount_paid || 0);
  const explicitOutstanding = Number(f.amount_outstanding);
  const amountOutstanding = Number.isFinite(explicitOutstanding)
    ? explicitOutstanding
    : Math.max(0, finalAmount - amountPaid);

  return {
    id: f.id,
    student_id: f.student_id,
    fee_structure_id: f.fee_structure_id,
    billing_month: f.billing_month || null,
    amount,
    final_amount: finalAmount,
    discount_amount: discountAmount,
    amount_paid: amountPaid,
    amount_outstanding: amountOutstanding,
    category_code: f.category_code || undefined,
    status: f.status,
    due_date: f.due_date,
    fee_type: f.fee_structures?.fee_type || f.fee_type || f.category_code || 'tuition',
    description: f.fee_structures?.description || f.fee_structures?.name,
    waived_amount: discountAmount,
    waived_reason: f.waived_reason,
    waived_at: f.waived_at,
    waived_by: f.waived_by,
    paid_date: f.paid_date,
  };
}

export function formatCurrency(amount: number): string {
  return `R ${amount.toFixed(2)}`;
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ── Bootstrap ───────────────────────────────────────────────────

export async function bootstrapFeesIfMissing(
  student: Student,
  organizationId: string | null | undefined,
  profileId: string | null | undefined,
): Promise<FeeSetupStatus> {
  try {
    const supabase = assertSupabase();
    const preschoolId = student.preschool_id || organizationId;
    if (!preschoolId) return 'missing';

    const studentStatus = String(student.status || '').trim().toLowerCase();
    if (student.is_active !== true || studentStatus !== 'active') {
      return 'skipped_inactive';
    }

    const { data: feeStructures, error: feeError } = await supabase
      .from('fee_structures')
      .select('id, amount, fee_type, name, description, grade_levels, effective_from, created_at')
      .eq('preschool_id', preschoolId)
      .eq('is_active', true)
      .order('effective_from', { ascending: false })
      .order('created_at', { ascending: false });

    if (feeError) {
      console.warn('[StudentFeeManagement] Fee structure lookup failed:', feeError);
      return 'missing';
    }

    const tuitionFees = (feeStructures || []).filter((fee: FeeStructureRow) =>
      isTuitionFee(fee.fee_type, fee.name, fee.description),
    );
    let resolvedTuitionFees = tuitionFees;

    if (!tuitionFees.length) {
      const result = await resolveFromSchoolFees(supabase, preschoolId, student, profileId);
      if (result.status) return result.status;
      resolvedTuitionFees = result.fees!;
    }

    const selectedFee = selectFeeStructureForChild(resolvedTuitionFees as FeeStructureRow[], {
      dateOfBirth: student.date_of_birth,
      enrollmentDate: student.enrollment_date,
      ageGroupLabel: student.class_name || undefined,
      gradeLevel: student.class_name || undefined,
    });

    if (!selectedFee) return 'ready';

    const enrollmentDate = student.enrollment_date ? new Date(student.enrollment_date) : new Date();
    const startMonth = new Date(enrollmentDate.getFullYear(), enrollmentDate.getMonth(), 1);
    const nextMonth = new Date(startMonth.getFullYear(), startMonth.getMonth() + 1, 1);
    const feesToInsert = [startMonth, nextMonth].map(date => ({
      student_id: student.id,
      fee_structure_id: selectedFee.id,
      amount: selectedFee.amount,
      final_amount: selectedFee.amount,
      due_date: date.toISOString().split('T')[0],
      status: 'pending',
      amount_outstanding: selectedFee.amount,
    }));

    await supabase.from('student_fees').insert(feesToInsert);
    return 'ready';
  } catch (error) {
    console.warn('[StudentFeeManagement] Fee bootstrap failed (non-fatal):', error);
    return 'missing';
  }
}

async function resolveFromSchoolFees(
  supabase: ReturnType<typeof assertSupabase>,
  preschoolId: string,
  student: Student,
  profileId: string | null | undefined,
): Promise<{ status?: FeeSetupStatus; fees?: FeeStructureRow[] }> {
  const { data: schoolFees } = await supabase
    .from('school_fee_structures')
    .select('id, amount_cents, fee_category, name, description, age_group, grade_level, billing_frequency, created_at')
    .eq('preschool_id', preschoolId)
    .eq('is_active', true);

  const tuitionSchoolFees = (schoolFees || []).filter((fee: SchoolFeeStructureRow) =>
    isTuitionFee(fee.fee_category, fee.name, fee.description),
  );

  if (!tuitionSchoolFees.length) return { status: 'missing' };
  if (!profileId) return { status: 'school_only' };

  const mapped = tuitionSchoolFees.map(fee => ({
    id: fee.id,
    amount: fee.amount_cents / 100,
    name: fee.name,
    description: fee.description,
    age_group: fee.age_group,
    grade_level: fee.grade_level,
    created_at: fee.created_at,
  }));

  const selected = selectFeeStructureForChild(mapped, {
    dateOfBirth: student.date_of_birth,
    enrollmentDate: student.enrollment_date,
    ageGroupLabel: student.class_name || undefined,
    gradeLevel: student.class_name || undefined,
  });

  if (!selected) return { status: 'school_only' };

  const frequency = tuitionSchoolFees.find(f => f.id === selected.id)?.billing_frequency || 'monthly';
  const gradeLevels = selected.grade_level ? [selected.grade_level] : undefined;

  const { data: createdFee, error: createError } = await supabase
    .from('fee_structures')
    .insert({
      amount: selected.amount,
      created_by: profileId,
      description: selected.description || selected.name || 'School Fees',
      fee_type: 'tuition',
      frequency,
      grade_levels: gradeLevels,
      name: selected.name || 'School Fees',
      preschool_id: preschoolId,
      is_active: true,
      effective_from: new Date().toISOString().split('T')[0],
    })
    .select('id, amount, fee_type, name, description, effective_from, created_at')
    .single();

  if (createError || !createdFee) {
    console.warn('[StudentFeeManagement] Failed to create from school fees:', createError);
    return { status: 'school_only' };
  }

  return { fees: [createdFee as FeeStructureRow] };
}

// ── Registration fee resolution ─────────────────────────────────

export async function resolveSuggestedRegistrationFee(
  organizationId: string,
  student: Student | null,
  className?: string | null,
): Promise<number | null> {
  try {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from('fee_structures')
      .select('id, amount, fee_type, name, description, grade_levels, effective_from, created_at')
      .eq('preschool_id', organizationId)
      .eq('is_active', true)
      .order('effective_from', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    const registrationFees = (data || []).filter((fee: FeeStructureRow) =>
      isRegistrationFeeEntry(fee.fee_type, fee.name, fee.description),
    );
    if (!registrationFees.length) return null;

    const classNeedle = className?.trim().toLowerCase();
    if (classNeedle) {
      const match = registrationFees.find(fee => {
        const text = [fee.name, fee.description, ...(fee.grade_levels || [])]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return text.includes(classNeedle);
      });
      if (match) return Number(match.amount);
    }

    const selected = selectFeeStructureForChild(registrationFees as FeeStructureRow[], {
      dateOfBirth: student?.date_of_birth,
      enrollmentDate: student?.enrollment_date,
      ageGroupLabel: className || undefined,
      gradeLevel: className || undefined,
    });

    return selected ? Number(selected.amount) : Number(registrationFees[0].amount);
  } catch (error) {
    console.warn('[StudentFeeManagement] Failed to resolve suggested registration fee:', error);
    return null;
  }
}

export async function resolveSuggestedTuitionFee(
  organizationId: string,
  student: Student | null,
  className?: string | null,
): Promise<FeeStructureRow | null> {
  try {
    const supabase = assertSupabase();

    const { data: feeStructureData, error: feeStructureError } = await supabase
      .from('fee_structures')
      .select('id, amount, fee_type, name, description, grade_levels, effective_from, created_at')
      .eq('preschool_id', organizationId)
      .eq('is_active', true)
      .order('effective_from', { ascending: false })
      .order('created_at', { ascending: false });

    let data = feeStructureData;
    let error = feeStructureError;

    if ((!data || data.length === 0) && !error) {
      const fallback = await supabase
        .from('fee_structures')
        .select('id, amount, fee_type, name, description, grade_levels, effective_from, created_at')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('effective_from', { ascending: false })
        .order('created_at', { ascending: false });
      if (fallback.data && fallback.data.length > 0) {
        data = fallback.data;
        error = fallback.error;
      }
    }

    if (error) throw error;

    const tuitionFees = (data || []).filter((fee: FeeStructureRow) =>
      isTuitionFee(fee.fee_type, fee.name, fee.description),
    );
    if (!tuitionFees.length) return null;

    const classNeedle = className?.trim().toLowerCase();
    if (classNeedle) {
      const match = tuitionFees.find((fee) => {
        const text = [fee.name, fee.description, ...(fee.grade_levels || [])]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return text.includes(classNeedle);
      });
      if (match) return match;
    }

    const selected = selectFeeStructureForChild(tuitionFees as FeeStructureRow[], {
      dateOfBirth: student?.date_of_birth,
      enrollmentDate: student?.enrollment_date,
      ageGroupLabel: className || student?.class_name || undefined,
      gradeLevel: className || student?.class_name || undefined,
    });

    return selected || tuitionFees[0] || null;
  } catch (error) {
    console.warn('[StudentFeeManagement] Failed to resolve suggested tuition fee:', error);
    return null;
  }
}

// ── Payment & transaction upserts ───────────────────────────────

export async function upsertPaymentRecord(
  fee: StudentFee,
  status: 'completed' | 'reversed',
  student: Student,
  organizationId: string | null | undefined,
  profileId: string | undefined,
): Promise<void> {
  const supabase = assertSupabase();
  const nowIso = new Date().toISOString();
  const paymentReference = buildManualFeePaymentReference(fee.id);
  const amount = fee.final_amount || fee.amount;
  const preschoolId = student.preschool_id || organizationId;
  if (!preschoolId) return;

  const { data: existing } = await supabase
    .from('payments')
    .select('id')
    .eq('payment_reference', paymentReference)
    .maybeSingle();

  if (existing?.id) {
    const dbStatus = status === 'reversed' ? 'refunded' : status;
    await supabase
      .from('payments')
      .update({ status: dbStatus, amount, amount_cents: Math.round(amount * 100), reviewed_at: nowIso, reviewed_by: profileId, updated_at: nowIso })
      .eq('id', existing.id);
    return;
  }

  const dbStatus = status === 'reversed' ? 'refunded' : status;
  await supabase.from('payments').insert({
    amount,
    amount_cents: Math.round(amount * 100),
    currency: 'ZAR',
    status: dbStatus,
    payment_method: 'other',
    payment_reference: paymentReference,
    description: fee.description || fee.fee_type || 'School fees payment',
    preschool_id: preschoolId,
    student_id: student.id,
    parent_id: student.parent_id || null,
    fee_ids: [fee.id],
    reviewed_at: nowIso,
    reviewed_by: profileId,
    submitted_at: nowIso,
    metadata: { source: 'manual_principal_update', fee_id: fee.id },
  });
}

export async function upsertFinancialTransaction(
  fee: StudentFee,
  status: 'completed' | 'voided',
  student: Student,
  organizationId: string | null | undefined,
  profileId: string,
): Promise<void> {
  const supabase = assertSupabase();
  const nowIso = new Date().toISOString();
  const reference = buildManualFeePaymentReference(fee.id);
  const amount = fee.final_amount || fee.amount;
  const preschoolId = student.preschool_id || organizationId;
  if (!preschoolId) return;

  const { data: existing } = await supabase
    .from('financial_transactions')
    .select('id')
    .eq('payment_reference', reference)
    .maybeSingle();

  if (existing?.id) {
    const dbStatus = status === 'voided' ? 'cancelled' : status;
    await supabase
      .from('financial_transactions')
      .update({
        status: dbStatus, amount,
        approved_at: status === 'completed' ? nowIso : null,
        approved_by: status === 'completed' ? profileId : null,
        updated_at: nowIso,
      })
      .eq('id', existing.id);
    return;
  }

  await supabase.from('financial_transactions').insert({
    amount,
    description: fee.description || fee.fee_type || 'School fees payment',
    type: 'fee_payment',
    status: status === 'voided' ? 'cancelled' : status,
    payment_method: 'other',
    payment_reference: reference,
    preschool_id: preschoolId,
    student_id: student.id,
    created_by: profileId,
    approved_by: status === 'completed' ? profileId : null,
    approved_at: status === 'completed' ? nowIso : null,
    metadata: { source: 'manual_principal_update', fee_id: fee.id, original_status: status },
  });
}

// ── Receipt helpers ─────────────────────────────────────────────

export async function fetchParentProfile(parentId?: string | null): Promise<ParentProfileRow | null> {
  if (!parentId) return null;
  const supabase = assertSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email')
    .eq('id', parentId)
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id, first_name: data.first_name, last_name: data.last_name, email: data.email };
}

export async function attachReceiptToPayments(
  fee: StudentFee,
  receiptUrl: string | null,
  receiptStoragePath?: string,
): Promise<void> {
  const supabase = assertSupabase();
  const nowIso = new Date().toISOString();
  const paymentReference = buildManualFeePaymentReference(fee.id);

  const { data: payment } = await supabase
    .from('payments')
    .select('id, metadata')
    .eq('payment_reference', paymentReference)
    .maybeSingle();

  if (payment?.id) {
    const nextMetadata = { ...(payment.metadata || {}), receipt_storage_path: receiptStoragePath, receipt_url: receiptUrl };
    await supabase
      .from('payments')
      .update({ attachment_url: receiptUrl, metadata: nextMetadata, updated_at: nowIso })
      .eq('id', payment.id);
  }

  if (receiptStoragePath) {
    await supabase
      .from('financial_transactions')
      .update({ receipt_image_path: receiptStoragePath, updated_at: nowIso })
      .eq('payment_reference', paymentReference);
  }
}

export async function sendReceiptNotification(
  parent: ParentProfileRow | null,
  studentName: string,
  receiptUrl: string | null,
  receiptNumber: string,
  amount: number,
  context?: { studentId?: string; feeId?: string; feeType?: string; paymentPurpose?: string; paymentReference?: string },
): Promise<void> {
  if (!parent?.email && !parent?.id) return;
  const supabase = assertSupabase();
  const subject = `Payment receipt for ${studentName}`;
  const text = receiptUrl
    ? `Your payment of R ${amount.toFixed(2)} for ${studentName} has been marked as paid. Receipt #${receiptNumber}. Download: ${receiptUrl}`
    : `Your payment of R ${amount.toFixed(2)} for ${studentName} has been marked as paid. Receipt #${receiptNumber}.`;
  const html = `
    <p>Your payment of <strong>R ${amount.toFixed(2)}</strong> for <strong>${studentName}</strong> has been marked as paid.</p>
    <p>Receipt #: <strong>${receiptNumber}</strong></p>
    ${receiptUrl ? `<p><a href="${receiptUrl}">Download your receipt</a></p>` : ''}
  `;

  await supabase.functions.invoke('notifications-dispatcher', {
    body: {
      event_type: 'payment_receipt',
      user_ids: parent?.id ? [parent.id] : undefined,
      recipient_email: parent?.email || undefined,
      include_email: true,
      template_override: {
        title: 'Payment Receipt Ready',
        body: `Receipt issued for ${studentName}.`,
        data: { type: 'receipt', student_name: studentName, receipt_url: receiptUrl, ...context },
      },
      email_template_override: { subject, text, html },
    },
  });
}

export async function generateReceiptForFee(
  fee: StudentFee,
  amount: number,
  paidDate: string,
  student: Student,
  profile: { id: string; full_name?: string; first_name?: string; last_name?: string },
  organizationId: string | null | undefined,
): Promise<{ receiptUrl?: string | null; storagePath?: string | null } | null> {
  const preschoolId = student.preschool_id || organizationId;
  if (!preschoolId) return null;
  const issuerName =
    profile.full_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'School Administrator';
  const paymentReference = buildManualFeePaymentReference(fee.id);

  try {
    const result = await finalizePaidFlow({
      context: 'manual_fee',
      organizationId: preschoolId,
      amount,
      paidDate,
      dueDate: fee.due_date,
      billingMonth: fee.billing_month || fee.due_date || null,
      description: fee.description || fee.fee_type || 'School fee',
      paymentReference,
      paymentMethod: 'manual',
      categoryCode: fee.category_code || fee.fee_type || null,
      feeIds: [fee.id],
      student: {
        id: student.id,
        firstName: student.first_name,
        lastName: student.last_name,
        className: student.class_name || null,
        parentId: student.parent_id || null,
      },
      issuer: { id: profile.id, name: issuerName },
      metadata: {
        source: 'manual_principal_update',
        fee_id: fee.id,
        fee_type: fee.fee_type,
      },
      sendNotification: true,
    });
    return { receiptUrl: result.receiptUrl, storagePath: result.receiptStoragePath };
  } catch (error) {
    console.warn('[StudentFeeManagement] Receipt generation failed:', error);
    return null;
  }
}

export async function fetchReceiptUrlForFee(fee: StudentFee): Promise<string | null> {
  return fetchReceiptUrlByPaymentReference(buildManualFeePaymentReference(fee.id));
}

export async function openReceiptUrl(url: string, router: any): Promise<void> {
  const isPdf = /\.pdf(\?|$)/i.test(url);
  if (isPdf) {
    router.push({ pathname: '/screens/pdf-viewer', params: { url, title: 'Receipt' } } as any);
    return;
  }
  await Linking.openURL(url);
}
