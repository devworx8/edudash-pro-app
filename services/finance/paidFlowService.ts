import { ReceiptService } from '@/lib/services/ReceiptService';
import { assertSupabase } from '@/lib/supabase';

export type PaidFlowContext = 'manual_fee' | 'pop' | 'registration';

export interface PaidFlowStudent {
  id: string;
  firstName: string;
  lastName: string;
  className?: string | null;
  parentId?: string | null;
}

export interface PaidFlowParent {
  id?: string | null;
  name?: string | null;
  email?: string | null;
}

export interface PaidFlowIssuer {
  id: string;
  name: string;
}

export interface FinalizePaidFlowInput {
  context: PaidFlowContext;
  organizationId: string;
  amount: number;
  paidDate: string;
  dueDate?: string | null;
  billingMonth?: string | null;
  description: string;
  paymentReference: string;
  paymentMethod?: string | null;
  categoryCode?: string | null;
  paymentId?: string | null;
  feeIds?: string[];
  student: PaidFlowStudent;
  parent?: PaidFlowParent | null;
  issuer: PaidFlowIssuer;
  metadata?: Record<string, unknown>;
  sendNotification?: boolean;
  excludeFromFinanceMetrics?: boolean;
}

export interface FinalizePaidFlowResult {
  paymentId: string | null;
  receiptUrl: string | null;
  receiptStoragePath: string | null;
  paymentReference: string;
}

type PaymentRow = {
  id: string;
  payment_reference: string | null;
  metadata: Record<string, unknown> | null;
  attachment_url: string | null;
  fee_ids: string[] | null;
};

type ReceiptInfo = {
  paymentId: string | null;
  paymentReference: string;
  receiptUrl: string | null;
  receiptStoragePath: string | null;
};

const buildReceiptNumber = (paymentReference: string) =>
  `REC-${new Date().getFullYear()}-${paymentReference.replace(/[^A-Z0-9]/gi, '').slice(-8).toUpperCase()}`;

const uniqueValues = (values: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim()),
    ),
  );

const normalizeDay = (value?: string | null): string => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().split('T')[0];
  }
  return parsed.toISOString().split('T')[0];
};

const normalizeMonth = (value?: string | null): string => {
  const day = normalizeDay(value);
  return `${day.slice(0, 7)}-01`;
};

const mergeMetadata = (
  existing: Record<string, unknown> | null | undefined,
  next: Record<string, unknown>,
) => ({
  ...(existing || {}),
  ...next,
});

async function fetchStudentSnapshot(studentId: string): Promise<{ className: string | null; parentId: string | null }> {
  const supabase = assertSupabase();
  const { data, error } = await supabase
    .from('students')
    .select('parent_id, classes!students_class_id_fkey(name)')
    .eq('id', studentId)
    .maybeSingle();
  if (error) {
    return { className: null, parentId: null };
  }
  const classData = Array.isArray((data as any)?.classes) ? (data as any).classes[0] : (data as any)?.classes;
  return {
    className: typeof classData?.name === 'string' ? classData.name : null,
    parentId: typeof (data as any)?.parent_id === 'string' ? (data as any).parent_id : null,
  };
}

async function fetchParentProfile(parentId?: string | null, fallback?: PaidFlowParent | null): Promise<PaidFlowParent | null> {
  if (!parentId) return fallback || null;
  const supabase = assertSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email')
    .eq('id', parentId)
    .maybeSingle();
  if (error || !data) return fallback || null;
  const name = `${data.first_name || ''} ${data.last_name || ''}`.trim();
  return {
    id: data.id,
    name: name || fallback?.name || null,
    email: data.email || fallback?.email || null,
  };
}

async function fetchPaymentRow(
  paymentReference: string,
  paymentId?: string | null,
): Promise<PaymentRow | null> {
  const supabase = assertSupabase();
  let query = supabase
    .from('payments')
    .select('id, payment_reference, metadata, attachment_url, fee_ids');

  if (paymentId) {
    query = query.eq('id', paymentId);
  } else {
    query = query.eq('payment_reference', paymentReference);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    payment_reference: data.payment_reference,
    metadata: (data.metadata as Record<string, unknown> | null) || null,
    attachment_url: data.attachment_url,
    fee_ids: Array.isArray(data.fee_ids) ? data.fee_ids : null,
  };
}

async function upsertCanonicalPaymentRecord(input: FinalizePaidFlowInput): Promise<PaymentRow | null> {
  const supabase = assertSupabase();
  const nowIso = new Date().toISOString();
  const feeIds = uniqueValues(input.feeIds || []);
  const existing = await fetchPaymentRow(input.paymentReference, input.paymentId || null);
  const nextMetadata = mergeMetadata(existing?.metadata, {
    payment_context: input.context,
    category_code: input.categoryCode || null,
    fee_id: feeIds[0] || null,
    exclude_from_finance_metrics: input.excludeFromFinanceMetrics === true,
    ...input.metadata,
  });

  const paymentPayload = {
    student_id: input.student.id,
    parent_id: input.student.parentId || input.parent?.id || null,
    preschool_id: input.organizationId,
    amount: input.amount,
    amount_cents: Math.round(input.amount * 100),
    currency: 'ZAR',
    payment_method: input.paymentMethod || 'manual',
    payment_reference: input.paymentReference,
    status: 'completed',
    description: input.description,
    reviewed_by: input.issuer.id,
    reviewed_at: nowIso,
    submitted_at: nowIso,
    billing_month: input.billingMonth ? normalizeMonth(input.billingMonth) : null,
    category_code: input.categoryCode || null,
    transaction_date: normalizeDay(input.paidDate),
    fee_ids: feeIds.length > 0 ? feeIds : existing?.fee_ids || null,
    metadata: nextMetadata,
    updated_at: nowIso,
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from('payments')
      .update(paymentPayload)
      .eq('id', existing.id)
      .select('id, payment_reference, metadata, attachment_url, fee_ids')
      .maybeSingle();
    if (error || !data) return existing;
    return {
      id: data.id,
      payment_reference: data.payment_reference,
      metadata: (data.metadata as Record<string, unknown> | null) || null,
      attachment_url: data.attachment_url,
      fee_ids: Array.isArray(data.fee_ids) ? data.fee_ids : null,
    };
  }

  const { data, error } = await supabase
    .from('payments')
    .insert(paymentPayload)
    .select('id, payment_reference, metadata, attachment_url, fee_ids')
    .single();
  if (error || !data) return null;
  return {
    id: data.id,
    payment_reference: data.payment_reference,
    metadata: (data.metadata as Record<string, unknown> | null) || null,
    attachment_url: data.attachment_url,
    fee_ids: Array.isArray(data.fee_ids) ? data.fee_ids : null,
  };
}

async function attachReceiptToPaymentRecord(
  payment: PaymentRow | null,
  receiptUrl: string | null,
  receiptStoragePath: string | null,
): Promise<void> {
  if (!payment?.id) return;
  const supabase = assertSupabase();
  const nowIso = new Date().toISOString();
  const nextMetadata = mergeMetadata(payment.metadata, {
    receipt_url: receiptUrl,
    receipt_storage_path: receiptStoragePath,
  });
  const updates: Record<string, unknown> = {
    metadata: nextMetadata,
    updated_at: nowIso,
  };
  if (receiptUrl && !payment.attachment_url) {
    updates.attachment_url = receiptUrl;
  }
  await supabase.from('payments').update(updates).eq('id', payment.id);

  if (receiptStoragePath) {
    await supabase
      .from('financial_transactions')
      .update({ receipt_image_path: receiptStoragePath, updated_at: nowIso })
      .eq('payment_reference', payment.payment_reference || '');
  }
}

async function sendReceiptNotification(
  input: FinalizePaidFlowInput,
  receiptUrl: string | null,
): Promise<void> {
  const parent = await fetchParentProfile(input.student.parentId, input.parent);
  if (!input.sendNotification || (!parent?.id && !parent?.email)) return;

  const supabase = assertSupabase();
  const studentName = `${input.student.firstName || ''} ${input.student.lastName || ''}`.trim() || 'Student';
  const receiptNumber = buildReceiptNumber(input.paymentReference);
  const text = receiptUrl
    ? `Your payment of R ${input.amount.toFixed(2)} for ${studentName} has been marked as paid. Receipt #${receiptNumber}. Download: ${receiptUrl}`
    : `Your payment of R ${input.amount.toFixed(2)} for ${studentName} has been marked as paid. Receipt #${receiptNumber}.`;
  const html = `
    <p>Your payment of <strong>R ${input.amount.toFixed(2)}</strong> for <strong>${studentName}</strong> has been marked as paid.</p>
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
        data: {
          type: 'receipt',
          student_name: studentName,
          receipt_url: receiptUrl,
          student_id: input.student.id,
          payment_reference: input.paymentReference,
          payment_context: input.context,
        },
      },
      email_template_override: {
        subject: `Payment receipt for ${studentName}`,
        text,
        html,
      },
    },
  });
}

export function buildManualFeePaymentReference(feeId: string): string {
  return `MANUAL-FEE-${feeId.slice(0, 8)}`;
}

export function buildRegistrationPaymentReference(studentId: string): string {
  return `MANUAL-REG-${studentId.slice(0, 8)}`;
}

export async function fetchReceiptInfoByPaymentReference(paymentReference: string): Promise<ReceiptInfo | null> {
  const payment = await fetchPaymentRow(paymentReference);
  if (!payment) return null;
  const metadata = payment.metadata || {};
  const receiptUrl =
    typeof metadata.receipt_url === 'string' && metadata.receipt_url
      ? metadata.receipt_url
      : typeof payment.attachment_url === 'string'
        ? payment.attachment_url
        : null;
  const receiptStoragePath =
    typeof metadata.receipt_storage_path === 'string' ? metadata.receipt_storage_path : null;

  return {
    paymentId: payment.id,
    paymentReference,
    receiptUrl,
    receiptStoragePath,
  };
}

export async function fetchReceiptUrlByPaymentReference(paymentReference: string): Promise<string | null> {
  const supabase = assertSupabase();
  const receiptInfo = await fetchReceiptInfoByPaymentReference(paymentReference);
  if (!receiptInfo) return null;
  if (receiptInfo.receiptUrl) return receiptInfo.receiptUrl;
  if (receiptInfo.receiptStoragePath) {
    const { data, error } = await supabase
      .storage
      .from('generated-pdfs')
      .createSignedUrl(receiptInfo.receiptStoragePath, 3600);
    if (!error) return data?.signedUrl || null;
  }
  return null;
}

export async function clearCanonicalPaymentReceiptState(
  paymentReference: string,
  issuerId: string,
  reason: string,
): Promise<void> {
  const payment = await fetchPaymentRow(paymentReference);
  if (!payment?.id) return;

  const supabase = assertSupabase();
  const nowIso = new Date().toISOString();
  const metadata = { ...(payment.metadata || {}) } as Record<string, unknown>;
  const receiptUrl = typeof metadata.receipt_url === 'string' ? metadata.receipt_url : null;
  delete metadata.receipt_url;
  delete metadata.receipt_storage_path;
  metadata.reversed_at = nowIso;
  metadata.reversed_by = issuerId;
  metadata.reversal_reason = reason;

  const updates: Record<string, unknown> = {
    status: 'refunded',
    metadata,
    reviewed_by: issuerId,
    reviewed_at: nowIso,
    updated_at: nowIso,
  };
  if (payment.attachment_url && (!receiptUrl || payment.attachment_url === receiptUrl)) {
    updates.attachment_url = null;
  }
  await supabase.from('payments').update(updates).eq('id', payment.id);
}

export async function finalizePaidFlow(input: FinalizePaidFlowInput): Promise<FinalizePaidFlowResult> {
  const payment = await upsertCanonicalPaymentRecord(input);
  const existingReceipt = payment?.payment_reference
    ? await fetchReceiptInfoByPaymentReference(payment.payment_reference)
    : null;

  if (existingReceipt?.receiptUrl || existingReceipt?.receiptStoragePath) {
    const resolvedUrl = await fetchReceiptUrlByPaymentReference(payment?.payment_reference || input.paymentReference);
    await sendReceiptNotification(input, resolvedUrl);
    return {
      paymentId: payment?.id || existingReceipt.paymentId,
      receiptUrl: resolvedUrl,
      receiptStoragePath: existingReceipt.receiptStoragePath,
      paymentReference: payment?.payment_reference || input.paymentReference,
    };
  }

  const studentSnapshot = await fetchStudentSnapshot(input.student.id);
  const className = input.student.className || studentSnapshot.className || null;
  const parent = await fetchParentProfile(
    input.student.parentId || studentSnapshot.parentId,
    input.parent,
  );
  const result = await ReceiptService.generateFeeReceipt({
    schoolId: input.organizationId,
    fee: {
      id: input.feeIds?.[0] || payment?.id || input.student.id,
      description: input.description,
      amount: input.amount,
      dueDate: input.dueDate || null,
      paidDate: normalizeDay(input.paidDate),
      paymentReference: input.paymentReference,
      paymentMethod: input.paymentMethod || 'manual',
    },
    student: {
      id: input.student.id,
      firstName: input.student.firstName,
      lastName: input.student.lastName,
      className,
    },
    parent: {
      id: parent?.id || null,
      name: parent?.name || null,
      email: parent?.email || null,
    },
    issuer: {
      id: input.issuer.id,
      name: input.issuer.name,
    },
  });

  const receiptUrl = result.receiptUrl ?? null;
  const receiptStoragePath = result.storagePath ?? null;
  await attachReceiptToPaymentRecord(payment, receiptUrl, receiptStoragePath);
  await sendReceiptNotification(input, receiptUrl);

  return {
    paymentId: payment?.id || null,
    receiptUrl,
    receiptStoragePath,
    paymentReference: payment?.payment_reference || input.paymentReference,
  };
}
