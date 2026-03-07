'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(value < 10 && idx > 0 ? 1 : 0)} ${units[idx]}`;
}

export default function PopUploadClient() {
  const searchParams = useSearchParams();
  const registrationId = useMemo(() => {
    return (
      searchParams.get('registration_id') ||
      searchParams.get('registrationId') ||
      searchParams.get('rid') ||
      ''
    ).trim();
  }, [searchParams]);

  const [email, setEmail] = useState(() => searchParams.get('email') || '');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [studentName, setStudentName] = useState<string | null>(null);

  const handleFileChange = (selected: File | null) => {
    setError(null);
    if (!selected) {
      setFile(null);
      return;
    }

    if (!ALLOWED_TYPES.includes(selected.type)) {
      setError('Only PDF and image files (JPG, PNG) are allowed.');
      setFile(null);
      return;
    }

    if (selected.size > MAX_FILE_SIZE) {
      setError('File size must be less than 10MB.');
      setFile(null);
      return;
    }

    setFile(selected);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!registrationId) {
      setError('Missing registration ID. Please use the link provided by the school.');
      return;
    }

    if (!email.trim()) {
      setError('Please enter the email used during registration.');
      return;
    }

    if (!file) {
      setError('Please select your proof of payment file.');
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('registration_id', registrationId);
      formData.append('email', email.trim());
      formData.append('payment_date', paymentDate);
      formData.append('file', file);

      const response = await fetch('/api/registrations/pop-upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || 'Upload failed. Please try again.');
      }

      setSuccess(true);
      setStudentName(result?.student_name || null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 520,
        background: '#0b1220',
        borderRadius: 20,
        border: '1px solid #1f2937',
        padding: '32px',
        color: '#e2e8f0',
        boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
      }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Upload Proof of Payment</h1>
        <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 24 }}>
          Use the email from your registration and attach your payment proof (PDF or image).
        </p>

        {success ? (
          <div style={{
            padding: 20,
            borderRadius: 16,
            background: 'rgba(34, 197, 94, 0.12)',
            border: '1px solid rgba(34, 197, 94, 0.4)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: '#86efac', marginBottom: 8 }}>
              Success
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Upload Successful</h2>
            <p style={{ fontSize: 14, color: '#cbd5f5' }}>
              {studentName ? `We received proof of payment for ${studentName}.` : 'We received your proof of payment.'}
            </p>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
              The school will verify your payment shortly.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <label htmlFor="email" style={{ fontSize: 13, fontWeight: 600 }}>Registration Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="parent@example.com"
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid #334155',
                  background: '#0f172a',
                  color: '#e2e8f0',
                  fontSize: 14,
                }}
                required
              />
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label htmlFor="paymentDate" style={{ fontSize: 13, fontWeight: 600 }}>Payment Date</label>
              <input
                id="paymentDate"
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid #334155',
                  background: '#0f172a',
                  color: '#e2e8f0',
                  fontSize: 14,
                }}
              />
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label htmlFor="file" style={{ fontSize: 13, fontWeight: 600 }}>Proof of Payment File</label>
              <input
                id="file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(event) => handleFileChange(event.target.files?.[0] || null)}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px dashed #475569',
                  background: '#0f172a',
                  color: '#94a3b8',
                }}
                required
              />
              {file && (
                <div style={{ fontSize: 12, color: '#cbd5f5' }}>
                  Selected: {file.name} - {formatBytes(file.size)}
                </div>
              )}
            </div>

            {error && (
              <div style={{
                padding: 12,
                borderRadius: 10,
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#fecaca',
                fontSize: 13,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '12px 16px',
                borderRadius: 10,
                border: 'none',
                background: submitting ? '#334155' : 'linear-gradient(135deg, #6366f1, #22d3ee)',
                color: '#0f172a',
                fontWeight: 700,
                fontSize: 15,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Uploading...' : 'Submit Proof of Payment'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
