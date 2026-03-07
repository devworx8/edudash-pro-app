import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']);
const STORAGE_BUCKET = 'registration-documents';

const DOCUMENT_COLUMN_MAP: Record<string, string> = {
  birth_certificate: 'student_birth_certificate_url',
  clinic_card: 'student_clinic_card_url',
  guardian_id: 'guardian_id_document_url',
};

const STUDENT_COLUMN_MAP: Record<string, string> = {
  birth_certificate: 'birth_certificate_url',
  clinic_card: 'clinic_card_url',
  guardian_id: 'guardian_id_url',
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function isMissingColumnError(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42703';
}

async function fetchRegistrationById(supabase: any, registrationId: string) {
  const baseSelect = 'id, guardian_email, organization_id';

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

async function fetchRegistrationByEmail(
  supabase: any,
  email: string,
  organizationId?: string | null
) {
  const baseSelect = 'id, guardian_email, organization_id';
  const normalizedEmail = normalizeEmail(email);

  let query = supabase
    .from('registration_requests')
    .select(`${baseSelect}, parent_email`)
    .or(`guardian_email.ilike.${normalizedEmail},parent_email.ilike.${normalizedEmail}`)
    .order('created_at', { ascending: false })
    .limit(1);

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const withParent = await query.maybeSingle();

  if (!withParent.error || !isMissingColumnError(withParent.error)) {
    return withParent;
  }

  let fallbackQuery = supabase
    .from('registration_requests')
    .select(baseSelect)
    .ilike('guardian_email', normalizedEmail)
    .order('created_at', { ascending: false })
    .limit(1);

  if (organizationId) {
    fallbackQuery = fallbackQuery.eq('organization_id', organizationId);
  }

  return fallbackQuery.maybeSingle();
}

async function resolveUserFromRequest(request: NextRequest, supabase: any) {
  let userId: string | null = null;
  let userEmail: string | null = null;

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (user) {
      userId = user.id;
      userEmail = user.email || null;
      return { userId, userEmail };
    }
  }

  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('sb-access-token')?.value ||
      cookieStore.get('sb-lvvvjywrmpcqrpvuptdi-auth-token')?.value;

    if (accessToken) {
      const tokenData = accessToken.startsWith('{') ? JSON.parse(accessToken) : { access_token: accessToken };
      const token = tokenData.access_token || tokenData;
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        userId = user.id;
        userEmail = user.email || null;
      }
    }
  } catch {
    // Ignore cookie parse errors
  }

  return { userId, userEmail };
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
    }

    const formData = await request.formData();
    const documentTypeRaw = formData.get('document_type');
    const registrationIdRaw = formData.get('registration_id');
    const studentIdRaw = formData.get('student_id');
    const emailRaw = formData.get('email');
    const organizationIdRaw = formData.get('organization_id');
    const file = formData.get('file');

    if (!documentTypeRaw || !file) {
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

    const documentType = documentTypeRaw.toString().trim();
    const dbColumn = DOCUMENT_COLUMN_MAP[documentType];
    const studentColumn = STUDENT_COLUMN_MAP[documentType];

    if (!dbColumn || !studentColumn) {
      return NextResponse.json({ error: 'Invalid document type' }, { status: 400 });
    }

    const registrationId = registrationIdRaw ? registrationIdRaw.toString().trim() : '';
    const studentId = studentIdRaw ? studentIdRaw.toString().trim() : '';
    const email = emailRaw ? normalizeEmail(emailRaw.toString()) : '';
    const organizationId = organizationIdRaw ? organizationIdRaw.toString().trim() : '';

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { userId, userEmail } = await resolveUserFromRequest(request, supabase);

    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let registration: any = null;
    if (registrationId) {
      const { data, error } = await fetchRegistrationById(supabase, registrationId);
      if (error) {
        return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
      }
      registration = data;
    } else if (email || userEmail) {
      const lookupEmail = email || userEmail || '';
      if (lookupEmail) {
        const { data, error } = await fetchRegistrationByEmail(supabase, lookupEmail, organizationId || null);
        if (!error) {
          registration = data;
        }
      }
    }

    if (registration) {
      const guardianEmail = registration.guardian_email?.toLowerCase?.() || '';
      const parentEmail = registration.parent_email?.toLowerCase?.() || '';
      const effectiveEmail = (userEmail || email || '').toLowerCase();

      if (effectiveEmail && effectiveEmail !== guardianEmail && effectiveEmail !== parentEmail) {
        return NextResponse.json({ error: 'Email does not match this registration' }, { status: 403 });
      }
    }

    const safeName = sanitizeFilename(file.name || `${documentType}.pdf`);
    const orgSegment = registration?.organization_id || organizationId || 'unknown';
    const objectPath = `documents/${orgSegment}/${userId}/${documentType}_${Date.now()}_${safeName}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(objectPath, fileBuffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }

    const { data: publicUrlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(objectPath);

    const documentUrl = publicUrlData?.publicUrl;

    if (!documentUrl) {
      return NextResponse.json({ error: 'Failed to generate file URL' }, { status: 500 });
    }

    if (registration?.id) {
      const { error: updateError } = await supabase
        .from('registration_requests')
        .update({
          [dbColumn]: documentUrl,
          documents_uploaded: true,
        })
        .eq('id', registration.id);

      if (updateError) {
        return NextResponse.json({ error: 'Failed to update registration' }, { status: 500 });
      }
    }

    if (studentId) {
      const { error: studentError } = await supabase
        .from('students')
        .update({ [studentColumn]: documentUrl })
        .eq('id', studentId);

      if (studentError) {
        return NextResponse.json({ error: 'Failed to update student document' }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      document_url: documentUrl,
      document_type: documentType,
      registration_id: registration?.id || null,
    });
  } catch (error) {
    console.error('[documents-upload] Error:', error);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
