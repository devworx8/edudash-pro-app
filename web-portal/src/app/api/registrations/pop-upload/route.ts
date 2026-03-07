import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']);
const STORAGE_BUCKET = 'proof-of-payments';

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function isMissingColumnError(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42703';
}

async function fetchRegistration(
  supabase: any,
  registrationId: string
) {
  const baseSelect = 'id, guardian_email, student_first_name, student_last_name, organization_id';

  const withParent = await supabase
    .from('registration_requests')
    .select(`${baseSelect}, parent_email`)
    .eq('id', registrationId)
    .maybeSingle();

  if (!withParent.error || !isMissingColumnError(withParent.error)) {
    return withParent;
  }

  return supabase
    .from('registration_requests')
    .select(baseSelect)
    .eq('id', registrationId)
    .maybeSingle();
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
    }

    const formData = await req.formData();
    const registrationIdRaw = formData.get('registration_id');
    const emailRaw = formData.get('email');
    const paymentDateRaw = formData.get('payment_date');
    const paymentMethodRaw = formData.get('payment_method');
    const file = formData.get('file');

    if (!registrationIdRaw || !emailRaw || !file) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Invalid file upload' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size must be less than 10MB' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Only PDF and image files (JPG, PNG) are allowed' }, { status: 400 });
    }

    const registrationId = registrationIdRaw.toString().trim();
    const email = normalizeEmail(emailRaw.toString());
    const paymentDate = paymentDateRaw ? paymentDateRaw.toString().trim() : '';
    const paymentMethod = paymentMethodRaw ? paymentMethodRaw.toString().trim() : 'bank_transfer';

    if (!registrationId || !email) {
      return NextResponse.json({ error: 'Registration ID and email are required' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: registration, error: registrationError } = await fetchRegistration(
      supabase,
      registrationId
    );

    if (registrationError || !registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }

    const guardianEmail = registration.guardian_email?.toLowerCase?.() || '';
    const parentEmail = (registration as { parent_email?: string } | null)?.parent_email?.toLowerCase?.() || '';

    if (email !== guardianEmail && email !== parentEmail) {
      return NextResponse.json({ error: 'Email does not match this registration' }, { status: 403 });
    }

    const safeName = sanitizeFilename(file.name || 'payment.pdf');
    const objectPath = `registration-pop/${registrationId}/${Date.now()}_${safeName}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(objectPath, fileBuffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }

    const { data: publicUrlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(objectPath);

    const proofUrl = publicUrlData?.publicUrl;

    if (!proofUrl) {
      return NextResponse.json({ error: 'Failed to generate file URL' }, { status: 500 });
    }

    const updatePayload: Record<string, unknown> = {
      proof_of_payment_url: proofUrl,
      registration_fee_paid: true,
      payment_method: paymentMethod || 'bank_transfer',
    };

    if (paymentDate) {
      const normalizedDate = /^\d{4}-\d{2}-\d{2}$/.test(paymentDate)
        ? paymentDate
        : new Date(paymentDate).toISOString();
      updatePayload.payment_date = normalizedDate;
    } else {
      updatePayload.payment_date = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from('registration_requests')
      .update(updatePayload)
      .eq('id', registrationId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update registration' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      proof_of_payment_url: proofUrl,
      student_name: `${registration.student_first_name || ''} ${registration.student_last_name || ''}`.trim(),
    });
  } catch (error) {
    console.error('[pop-upload] Error:', error);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
