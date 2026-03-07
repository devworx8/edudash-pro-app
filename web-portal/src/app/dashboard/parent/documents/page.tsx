'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { SubPageHeader } from '@/components/dashboard/SubPageHeader';
import { useParentDashboardData } from '@/lib/hooks/useParentDashboardData';
import { FileText, UploadCloud, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';

type DocumentType = 'birth_certificate' | 'clinic_card' | 'guardian_id';

interface DocumentInfo {
  type: DocumentType;
  label: string;
  description: string;
  dbColumn: 'student_birth_certificate_url' | 'student_clinic_card_url' | 'guardian_id_document_url';
}

interface RegistrationRecord {
  id: string;
  organization_id: string | null;
  student_birth_certificate_url: string | null;
  student_clinic_card_url: string | null;
  guardian_id_document_url: string | null;
}

const COPY = {
  headerTitle: 'Upload Documents',
  headerSubtitle: 'Submit required registration documents for verification',
  backToPayments: 'Back to Payments',
  loadingDocuments: 'Loading documents…',
  uploaded: 'Uploaded',
  replace: 'Replace',
  upload: 'Upload',
  uploadTipsTitle: 'Upload Tips',
  uploadTips: [
    'Accepted formats: PDF, JPG, PNG',
    'Keep files under 10MB for faster uploads',
    'Ensure text is clear and readable',
  ],
} as const;

const DOCUMENTS: DocumentInfo[] = [
  {
    type: 'birth_certificate',
    label: 'Birth Certificate',
    description: "Child's official birth certificate",
    dbColumn: 'student_birth_certificate_url',
  },
  {
    type: 'clinic_card',
    label: 'Clinic Card',
    description: "Child's clinic/vaccination card",
    dbColumn: 'student_clinic_card_url',
  },
  {
    type: 'guardian_id',
    label: 'Guardian ID',
    description: 'Parent/Guardian identity document',
    dbColumn: 'guardian_id_document_url',
  },
];

function ParentDocumentsContent() {
  const router = useRouter();
  const supabase = createClient();
  const searchParams = useSearchParams();
  const registrationParam = searchParams.get('registrationId') || undefined;
  const studentParam = searchParams.get('studentId') || undefined;

  const { tenantSlug, userName, preschoolName, profile } = useParentDashboardData();

  const [email, setEmail] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<DocumentType | null>(null);
  const [registration, setRegistration] = useState<RegistrationRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preschoolId = profile?.preschoolId;

  const loadRegistration = useCallback(async (currentEmail: string, currentUserId: string) => {
    try {
      setLoading(true);
      setError(null);

      let record: RegistrationRecord | null = null;

      if (registrationParam) {
        const { data, error: regError } = await supabase
          .from('registration_requests')
          .select('id, organization_id, student_birth_certificate_url, student_clinic_card_url, guardian_id_document_url')
          .eq('id', registrationParam)
          .maybeSingle();
        if (regError) throw regError;
        record = data as RegistrationRecord | null;
      } else if (currentEmail) {
        let query = supabase
          .from('registration_requests')
          .select('id, organization_id, student_birth_certificate_url, student_clinic_card_url, guardian_id_document_url')
          .ilike('guardian_email', currentEmail)
          .order('created_at', { ascending: false })
          .limit(1);

        if (preschoolId) {
          query = query.eq('organization_id', preschoolId);
        }

        const { data, error: regError } = await query.maybeSingle();
        if (regError) throw regError;
        record = data as RegistrationRecord | null;
      }

      if (!record && studentParam) {
        // If no registration request exists, attempt to set a placeholder registration record
        record = {
          id: studentParam,
          organization_id: preschoolId || null,
          student_birth_certificate_url: null,
          student_clinic_card_url: null,
          guardian_id_document_url: null,
        };
      }

      setRegistration(record);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [preschoolId, registrationParam, studentParam, supabase]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setEmail(session.user.email || '');
      setUserId(session.user.id);
      await loadRegistration(session.user.email || '', session.user.id);
    })();
  }, [loadRegistration, router, supabase]);

  const handleUpload = async (doc: DocumentInfo, file: File) => {
    if (!userId || !registration) return;

    try {
      setSaving(doc.type);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Please sign in again to upload documents.');
      }

      const registrationIdForUpload = registrationParam
        || (registration?.id && registration.id !== studentParam ? registration.id : '');

      if (!registrationIdForUpload && !studentParam) {
        throw new Error('No registration record found for this upload.');
      }

      const formData = new FormData();
      formData.append('document_type', doc.type);
      formData.append('file', file);

      if (registrationIdForUpload) {
        formData.append('registration_id', registrationIdForUpload);
      }

      if (studentParam) {
        formData.append('student_id', studentParam);
      }

      if (session.user.email) {
        formData.append('email', session.user.email);
      }

      const organizationIdForUpload = registration.organization_id || preschoolId || '';
      if (organizationIdForUpload) {
        formData.append('organization_id', organizationIdForUpload);
      }

      const response = await fetch('/api/registrations/documents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to upload document');
      }

      const publicUrl = payload?.document_url;

      if (publicUrl) {
        setRegistration((prev) =>
          prev
            ? { ...prev, [doc.dbColumn]: publicUrl }
            : prev
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload document');
    } finally {
      setSaving(null);
    }
  };

  const documentStatuses = useMemo(() => {
    return DOCUMENTS.map((doc) => ({
      ...doc,
      uploaded: Boolean(registration?.[doc.dbColumn]),
    }));
  }, [registration]);

  return (
    <ParentShell tenantSlug={tenantSlug} userEmail={email} userName={userName} preschoolName={preschoolName}>
      <div style={{ margin: 'calc(var(--space-3) * -1) calc(var(--space-2) * -1)', padding: 0 }}>
        <SubPageHeader
          title={COPY.headerTitle}
          subtitle={COPY.headerSubtitle}
          icon={<FileText size={28} color="white" />}
        />

        <div style={{ width: '100%', padding: 20 }}>
          <button
            onClick={() => router.push('/dashboard/parent/payments')}
            className="btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 20,
              background: 'var(--surface-1)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              padding: '8px 16px',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            <ArrowLeft size={16} />
            {COPY.backToPayments}
          </button>

          {loading ? (
            <div className="card" style={{ padding: 24, textAlign: 'center' }}>
              <div className="spinner" style={{ margin: '0 auto' }} />
              <p className="muted" style={{ marginTop: 12 }}>{COPY.loadingDocuments}</p>
            </div>
          ) : error ? (
            <div className="card" style={{ padding: 24, textAlign: 'center' }}>
              <AlertCircle size={36} color="var(--danger)" style={{ margin: '0 auto 12px' }} />
              <p style={{ color: 'var(--danger)' }}>{error}</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              {documentStatuses.map((doc) => (
                <div key={doc.type} className="card" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: doc.uploaded ? 'rgba(34,197,94,0.12)' : 'rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {doc.uploaded ? <CheckCircle2 size={22} color="#16a34a" /> : <UploadCloud size={22} color="#3b82f6" />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{doc.label}</div>
                      <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{doc.description}</div>
                      {doc.uploaded && (
                        <div style={{ marginTop: 8, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>{COPY.uploaded}</div>
                      )}
                    </div>
                    <div>
                      <label
                        className="btn btnSecondary"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          cursor: saving === doc.type ? 'not-allowed' : 'pointer',
                          opacity: saving === doc.type ? 0.6 : 1,
                        }}
                      >
                        <UploadCloud size={14} />
                        {doc.uploaded ? COPY.replace : COPY.upload}
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          style={{ display: 'none' }}
                          disabled={saving === doc.type}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              void handleUpload(doc, file);
                              event.currentTarget.value = '';
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ))}

              <div className="card" style={{ padding: 20, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <AlertCircle size={20} color="#3b82f6" />
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{COPY.uploadTipsTitle}</div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                      {COPY.uploadTips.map((tip) => (
                        <li key={tip}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ParentShell>
  );
}

export default function ParentDocumentsPage() {
  return (
    <Suspense
      fallback={
        <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div className="spinner"></div>
        </div>
      }
    >
      <ParentDocumentsContent />
    </Suspense>
  );
}
