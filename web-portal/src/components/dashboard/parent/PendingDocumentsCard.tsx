'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, CheckCircle2, AlertCircle } from 'lucide-react';

export interface PendingDocumentStatus {
  type: 'birth_certificate' | 'clinic_card' | 'guardian_id';
  label: string;
  uploaded: boolean;
}

interface PendingDocumentsCardProps {
  documents?: PendingDocumentStatus[];
  registrationId?: string | null;
  studentId?: string | null;
  onOpen?: () => void;
}

const COPY = {
  documentsCompleteTitle: 'Documents Complete',
  documentsCompleteSubtitle: 'All required documents uploaded',
  pendingDocumentsTitle: 'Pending Documents',
  pendingDocumentsStatus: 'Pending',
  tapToUpload: 'Tap to upload',
  pendingCount: (pending: number, total: number) => `${pending} of ${total} documents required`,
  defaultDocuments: [
    { type: 'birth_certificate', label: 'Birth Certificate', uploaded: false },
    { type: 'clinic_card', label: 'Clinic Card', uploaded: false },
    { type: 'guardian_id', label: 'Guardian ID', uploaded: false },
  ] as const,
} as const;

export function PendingDocumentsCard({
  documents,
  registrationId,
  studentId,
  onOpen,
}: PendingDocumentsCardProps) {
  const router = useRouter();

  const resolvedDocs = useMemo<PendingDocumentStatus[]>(() => {
    if (documents && documents.length > 0) return documents;
    return COPY.defaultDocuments.map((doc) => ({ ...doc }));
  }, [documents]);

  const pendingCount = resolvedDocs.filter((doc) => !doc.uploaded).length;

  if (pendingCount === 0) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={20} color="#16a34a" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{COPY.documentsCompleteTitle}</div>
            <div className="muted" style={{ fontSize: 12 }}>{COPY.documentsCompleteSubtitle}</div>
          </div>
        </div>
      </div>
    );
  }

  const handleOpen = () => {
    if (onOpen) {
      onOpen();
      return;
    }
    const searchParams = new URLSearchParams();
    if (registrationId) searchParams.set('registrationId', registrationId);
    if (studentId) searchParams.set('studentId', studentId);
    const query = searchParams.toString();
    router.push(`/dashboard/parent/documents${query ? `?${query}` : ''}`);
  };

  return (
    <button
      className="card"
      style={{
        padding: 16,
        textAlign: 'left',
        cursor: 'pointer',
        border: '1px solid var(--border)',
        background: 'var(--surface-1)',
      }}
      onClick={handleOpen}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FileText size={20} color="#f59e0b" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{COPY.pendingDocumentsTitle}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {COPY.pendingCount(pendingCount, resolvedDocs.length)}
          </div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#f59e0b' }}>
          <AlertCircle size={14} />
          {COPY.pendingDocumentsStatus}
        </span>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {resolvedDocs.map((doc) => (
          <div key={doc.type} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: doc.uploaded ? '#22c55e' : '#f59e0b',
              }}
            />
            <span style={{ color: doc.uploaded ? 'var(--muted)' : 'var(--text)' }}>{doc.label}</span>
            {!doc.uploaded && <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{COPY.tapToUpload}</span>}
          </div>
        ))}
      </div>
    </button>
  );
}
