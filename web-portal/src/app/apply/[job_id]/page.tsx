/**
 * Public Job Application Page (Web)
 * Mobile-first, polished apply flow for teachers without the app.
 * Uses inline styles for reliable production rendering (matches aftercare page pattern).
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

type JobPosting = {
  id: string;
  title: string;
  description: string;
  requirements?: string | null;
  logo_url?: string | null;
  location?: string | null;
  employment_type?: string | null;
  salary_range_min?: number | null;
  salary_range_max?: number | null;
  status?: string | null;
  expires_at?: string | null;
  preschool_id?: string | null;
  age_group?: string | null;
  whatsapp_number?: string | null;
};

type SchoolInfo = {
  id?: string;
  name: string;
  logoUrl?: string | null;
  city?: string | null;
  province?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
};

// ── Theme constants ─────────────────────────────────────────────────
const C = {
  bgPrimary: '#0a0a0f',
  bgCard: 'rgba(255,255,255,0.05)',
  bgInput: 'rgba(255,255,255,0.05)',
  bgInputFocus: 'rgba(255,255,255,0.08)',
  borderCard: 'rgba(255,255,255,0.1)',
  borderInput: 'rgba(255,255,255,0.2)',
  accent: '#00f5ff',
  accentBright: '#7dd3fc',
  accentGlow: 'rgba(0,245,255,0.12)',
  purple: '#7c3aed',
  textPrimary: '#ffffff',
  textSecondary: '#d1d5db',
  textMuted: '#9CA3AF',
  textDim: '#6b7280',
  success: '#10b981',
  successLight: '#34d399',
  successBg: 'rgba(16,185,129,0.1)',
  error: '#ef4444',
  errorBg: 'rgba(239,68,68,0.1)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '10px',
  border: `1px solid ${C.borderInput}`,
  background: C.bgInput,
  color: C.textPrimary,
  fontSize: '14px',
  outline: 'none',
  transition: 'border-color 0.2s, background 0.2s',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: C.textMuted,
  fontSize: '13px',
  fontWeight: 500,
  marginBottom: '6px',
};

const cardStyle: React.CSSProperties = {
  background: C.bgCard,
  borderRadius: '16px',
  padding: '24px',
  border: `1px solid ${C.borderCard}`,
  marginBottom: '20px',
};

const sectionHeading: React.CSSProperties = {
  color: C.textPrimary,
  fontSize: '16px',
  fontWeight: 700,
  marginBottom: '20px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

// ── Component ───────────────────────────────────────────────────────
export default function ApplyPage() {
  const params = useParams();
  const jobId = Array.isArray(params.job_id) ? params.job_id[0] : params.job_id;
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [jobPosting, setJobPosting] = useState<JobPosting | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [showFullDescription, setShowFullDescription] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [qualifications, setQualifications] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!jobId || typeof jobId !== 'string') return;
      setLoading(true);
      setStatusMessage(null);

      const { data, error: fetchErr } = await supabase
        .from('job_postings')
        .select('*')
        .eq('id', jobId)
        .maybeSingle();

      if (fetchErr || !data) {
        setJobPosting(null);
        setStatusMessage('This job posting could not be found. It may have been removed or the link is incorrect.');
        setLoading(false);
        return;
      }

      if (data.status && data.status !== 'active') {
        setJobPosting(null);
        setStatusMessage('This job posting is no longer accepting applications.');
        setLoading(false);
        return;
      }

      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setJobPosting(null);
        setStatusMessage('This job posting has expired and is no longer accepting applications.');
        setLoading(false);
        return;
      }

      if (alive) setJobPosting(data as JobPosting);

      if (data.preschool_id) {
        try {
          const { data: ps } = await supabase
            .from('preschools')
            .select('name, logo_url, city, province, phone, contact_email, website_url')
            .eq('id', data.preschool_id)
            .maybeSingle();

          if (ps && alive) {
            setSchoolInfo({
              id: data.preschool_id,
              name: ps.name,
              logoUrl: ps.logo_url,
              city: ps.city,
              province: ps.province,
              phone: ps.phone,
              email: ps.contact_email,
              website: ps.website_url,
            });
          } else {
            const { data: org } = await supabase
              .from('organizations')
              .select('name, logo_url')
              .eq('id', data.preschool_id)
              .maybeSingle();
            if (org && alive) {
              setSchoolInfo({ id: data.preschool_id, name: org.name, logoUrl: org.logo_url });
            }
          }
        } catch {
          /* ignore */
        }
      }
      if (alive) setLoading(false);
    };
    void load();
    return () => { alive = false; };
  }, [jobId, supabase]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    const code = p.get('invite') || p.get('inviteCode') || p.get('code');
    if (code?.trim()) setInviteCode(code.trim().toUpperCase());
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────
  const fmtType = (v?: string | null) => {
    const n = String(v || '').toLowerCase();
    if (n === 'full-time' || n === 'full_time') return 'Full-Time';
    if (n === 'part-time' || n === 'part_time') return 'Part-Time';
    if (n === 'contract') return 'Contract';
    if (n === 'temporary') return 'Temporary';
    return null;
  };

  const fmtSalary = (p?: JobPosting | null) => {
    if (!p) return null;
    if (p.salary_range_min && p.salary_range_max) return `R${p.salary_range_min.toLocaleString()} – R${p.salary_range_max.toLocaleString()}`;
    if (p.salary_range_min) return `From R${p.salary_range_min.toLocaleString()}`;
    return null;
  };

  const getInitials = (name: string) =>
    name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');

  const fmtLocation = (info?: SchoolInfo | null) => {
    if (!info) return '';
    return [info.city, info.province].filter(Boolean).join(', ');
  };

  const validateEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  const validateForm = () => {
    setError(null);
    if (!firstName.trim()) { setError('First Name is required'); return false; }
    if (!lastName.trim()) { setError('Last Name is required'); return false; }
    if (!email.trim()) { setError('Email is required'); return false; }
    if (!validateEmail(email.trim())) { setError('Please enter a valid email address'); return false; }
    if (!phone.trim()) { setError('Phone number is required'); return false; }
    if (!experienceYears.trim() || Number.isNaN(Number(experienceYears))) {
      setError('Please enter valid years of experience');
      return false;
    }
    if (!resumeFile) { setError('Please upload your CV/resume'); return false; }
    return true;
  };

  const handleFile = (file: File | null) => {
    if (!file) { setResumeFile(null); return; }
    if (file.size > MAX_FILE_SIZE) { setError('Resume must be less than 50MB'); return; }
    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
      setError('Please upload a PDF or Word document');
      return;
    }
    setError(null);
    setResumeFile(file);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobPosting || !validateForm()) return;
    setSubmitting(true);
    setError(null);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data: existing } = await supabase
        .from('candidate_profiles')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle();

      let candidateId: string;
      if (existing) {
        candidateId = existing.id;
      } else {
        const { data: created, error: createErr } = await supabase
          .from('candidate_profiles')
          .insert({
            email: normalizedEmail,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: phone.trim(),
            experience_years: Number(experienceYears),
            qualifications: qualifications.trim() ? [{ field: qualifications.trim() }] : [],
          })
          .select('id')
          .single();
        if (createErr || !created) throw new Error(createErr?.message || 'Failed to create candidate profile');
        candidateId = created.id;
      }

      let resumePath: string | null = null;
      if (resumeFile) {
        const { data: filename, error: fnErr } = await supabase.rpc(
          'generate_resume_filename',
          { candidate_email: normalizedEmail, original_filename: resumeFile.name },
        );
        if (fnErr || !filename) throw new Error('Failed to generate filename');
        const { error: upErr } = await supabase.storage
          .from('candidate-resumes')
          .upload(filename as string, resumeFile, { cacheControl: '3600', upsert: false });
        if (upErr) throw new Error(upErr.message || 'Failed to upload resume');
        resumePath = filename as string;
      }

      const { error: submitErr } = await supabase
        .from('job_applications')
        .insert({
          job_posting_id: jobPosting.id,
          candidate_profile_id: candidateId,
          cover_letter: coverLetter.trim() || null,
          resume_file_path: resumePath,
          status: 'new',
        });
      if (submitErr) throw new Error(submitErr.message || 'Failed to submit application');
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const openInApp = () => {
    if (!jobId) return;
    const q = inviteCode ? `?invite=${encodeURIComponent(inviteCode)}` : '';
    window.location.href = `edudashpro:///apply/${encodeURIComponent(String(jobId))}${q}`;
  };

  const teacherSignupLink = inviteCode
    ? `/sign-up/teacher?invite=${encodeURIComponent(inviteCode)}${jobId ? `&job=${encodeURIComponent(String(jobId))}` : ''}`
    : `/sign-up/teacher${jobId ? `?job=${encodeURIComponent(String(jobId))}` : ''}`;

  const logoUrl = jobPosting?.logo_url || schoolInfo?.logoUrl;
  const schoolName = schoolInfo?.name;
  const isLongDesc = (jobPosting?.description?.length || 0) > 400;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: C.bgPrimary }}>
      {/* Minimal global styles for autofill & focus states */}
      <style>{`
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active,
        textarea:-webkit-autofill,
        textarea:-webkit-autofill:hover,
        textarea:-webkit-autofill:focus {
          -webkit-text-fill-color: #fff !important;
          -webkit-box-shadow: 0 0 0px 1000px #12121a inset !important;
          box-shadow: 0 0 0px 1000px #12121a inset !important;
          background-color: #12121a !important;
          caret-color: #fff !important;
          border: 1px solid rgba(255,255,255,0.2) !important;
          transition: background-color 5000s ease-in-out 0s;
        }
        ::selection { background: rgba(0,245,255,0.18); }
        input:focus, textarea:focus, select:focus {
          border-color: #00f5ff !important;
          background: rgba(255,255,255,0.08) !important;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Background gradient orbs */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
        <div style={{
          position: 'absolute', top: '-160px', right: '-160px', width: '500px', height: '500px',
          borderRadius: '50%', opacity: 0.2,
          background: 'radial-gradient(circle, rgba(0,245,255,0.22), transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', bottom: '-240px', left: '-160px', width: '600px', height: '600px',
          borderRadius: '50%', opacity: 0.15,
          background: 'radial-gradient(circle, rgba(124,58,237,0.20), transparent 70%)',
        }} />
      </div>

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <header style={{
          background: 'rgba(10,10,15,0.90)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${C.borderCard}`,
          padding: '12px 16px',
        }}>
          <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px',
                background: C.accentGlow, border: '1px solid rgba(0,245,255,0.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <img src="/favicon.png" alt="" style={{ width: '20px', height: '20px' }} />
              </div>
              <div>
                <span style={{ fontSize: '14px', fontWeight: 700, color: C.textPrimary }}>EduDash Pro</span>
                <span style={{ fontSize: '11px', color: C.textDim, marginLeft: '6px' }}>Hiring Hub</span>
              </div>
            </div>
            <button
              onClick={openInApp}
              style={{
                fontSize: '12px', fontWeight: 600, color: C.accentBright,
                border: `1px solid ${C.borderCard}`, borderRadius: '8px',
                padding: '6px 12px', background: 'transparent', cursor: 'pointer',
              }}
            >
              Open in App
            </button>
          </div>
        </header>

        {/* Main */}
        <main style={{ maxWidth: '640px', margin: '0 auto', padding: '24px 16px 80px' }}>
          {/* Loading */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 0' }}>
              <div style={{
                width: '40px', height: '40px',
                border: `2px solid ${C.borderCard}`, borderTop: `2px solid ${C.accent}`,
                borderRadius: '50%', animation: 'spin 1s linear infinite',
              }} />
              <p style={{ color: C.textDim, fontSize: '13px', marginTop: '16px' }}>Loading job posting…</p>
            </div>
          )}

          {/* Not Found */}
          {!loading && !jobPosting && (
            <div style={{ ...cardStyle, textAlign: 'center', padding: '40px 24px', marginTop: '32px' }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '16px',
                background: C.errorBg, border: '1px solid rgba(239,68,68,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <span style={{ fontSize: '28px' }}>⚠️</span>
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: C.textPrimary, marginBottom: '8px' }}>
                Job Not Available
              </h2>
              <p style={{ fontSize: '14px', color: C.textSecondary, maxWidth: '360px', margin: '0 auto 24px', lineHeight: 1.5 }}>
                {statusMessage}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '320px', margin: '0 auto' }}>
                <button onClick={openInApp} style={{
                  padding: '12px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '14px',
                  background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                  color: C.bgPrimary, border: 'none', cursor: 'pointer',
                }}>
                  Browse Jobs in App
                </button>
                <Link href={teacherSignupLink} style={{
                  padding: '12px 20px', borderRadius: '10px', fontWeight: 600, fontSize: '14px',
                  background: C.bgCard, color: C.textSecondary,
                  border: `1px solid ${C.borderCard}`, textDecoration: 'none', textAlign: 'center',
                }}>
                  Create Teacher Account
                </Link>
              </div>
            </div>
          )}

          {/* ── Job Content + Form ── */}
          {!loading && jobPosting && !submitted && (
            <>
              {/* Job Header Card */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
                  {logoUrl ? (
                    <img src={logoUrl} alt={schoolName || ''} style={{
                      width: '56px', height: '56px', borderRadius: '12px', objectFit: 'cover',
                      border: `1px solid ${C.borderCard}`, flexShrink: 0,
                    }} />
                  ) : schoolName ? (
                    <div style={{
                      width: '56px', height: '56px', borderRadius: '12px',
                      background: 'linear-gradient(135deg, rgba(0,245,255,0.14), rgba(124,58,237,0.18))',
                      border: `1px solid ${C.borderCard}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: C.accentBright, fontSize: '18px', fontWeight: 700, flexShrink: 0,
                    }}>
                      {getInitials(schoolName)}
                    </div>
                  ) : null}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {schoolName && (
                      <p style={{
                        fontSize: '12px', fontWeight: 700, color: C.accentBright,
                        textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', margin: '0 0 4px',
                      }}>
                        {schoolName}
                      </p>
                    )}
                    <h1 style={{ fontSize: '22px', fontWeight: 800, color: C.textPrimary, lineHeight: 1.3, margin: 0 }}>
                      {jobPosting.title}
                    </h1>
                    {fmtLocation(schoolInfo) && (
                      <p style={{ fontSize: '13px', color: C.textDim, marginTop: '4px', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        📍 {fmtLocation(schoolInfo)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Tags */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {fmtType(jobPosting.employment_type) && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                      background: 'rgba(0,245,255,0.08)', color: C.accentBright,
                      border: '1px solid rgba(0,245,255,0.18)',
                    }}>
                      🕐 {fmtType(jobPosting.employment_type)}
                    </span>
                  )}
                  {jobPosting.location && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 500,
                      background: 'rgba(100,116,139,0.1)', color: '#94a3b8',
                      border: '1px solid rgba(100,116,139,0.15)',
                    }}>
                      📍 {jobPosting.location}
                    </span>
                  )}
                  {fmtSalary(jobPosting) && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                      background: C.successBg, color: C.successLight,
                      border: '1px solid rgba(16,185,129,0.2)',
                    }}>
                      💰 {fmtSalary(jobPosting)}
                    </span>
                  )}
                  {jobPosting.age_group && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                      background: 'rgba(168,85,247,0.08)', color: '#a855f7',
                      border: '1px solid rgba(168,85,247,0.18)',
                    }}>
                      👶 {jobPosting.age_group}
                    </span>
                  )}
                </div>
              </div>

              {/* Invite Code Banner */}
              {inviteCode && (
                <div style={{
                  ...cardStyle,
                  background: C.successBg,
                  border: '1px solid rgba(16,185,129,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                  padding: '16px 20px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    <span style={{ fontSize: '20px' }}>✅</span>
                    <div>
                      <p style={{ fontSize: '11px', color: 'rgba(52,211,153,0.8)', fontWeight: 500, margin: 0 }}>
                        Invite Code Detected
                      </p>
                      <p style={{ fontSize: '14px', fontWeight: 700, color: C.successLight, fontFamily: 'monospace', letterSpacing: '1px', margin: 0 }}>
                        {inviteCode}
                      </p>
                    </div>
                  </div>
                  <Link href={teacherSignupLink} style={{
                    padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                    background: 'rgba(16,185,129,0.15)', color: '#a7f3d0',
                    border: '1px solid rgba(16,185,129,0.3)', textDecoration: 'none', whiteSpace: 'nowrap',
                  }}>
                    Create Account
                  </Link>
                </div>
              )}

              {/* About This Role */}
              <div style={cardStyle}>
                <h3 style={{
                  fontSize: '11px', fontWeight: 700, color: C.textDim,
                  textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', margin: '0 0 12px',
                }}>
                  About This Role
                </h3>
                <div style={{
                  fontSize: '14px', color: C.textSecondary, lineHeight: 1.7, whiteSpace: 'pre-line',
                  ...((!showFullDescription && isLongDesc)
                    ? { maxHeight: '200px', overflow: 'hidden', position: 'relative' as const }
                    : {}),
                }}>
                  {jobPosting.description}
                  {!showFullDescription && isLongDesc && (
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0, height: '64px',
                      background: 'linear-gradient(to top, rgba(255,255,255,0.05), transparent)',
                    }} />
                  )}
                </div>
                {isLongDesc && (
                  <button
                    onClick={() => setShowFullDescription(!showFullDescription)}
                    style={{
                      fontSize: '13px', fontWeight: 600, color: C.accentBright,
                      background: 'none', border: 'none', cursor: 'pointer', marginTop: '8px', padding: 0,
                    }}
                  >
                    {showFullDescription ? 'Show less' : 'Read more'}
                  </button>
                )}

                {jobPosting.requirements && (
                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: `1px solid ${C.borderCard}` }}>
                    <h3 style={{
                      fontSize: '11px', fontWeight: 700, color: C.textDim,
                      textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', margin: '0 0 12px',
                    }}>
                      Requirements
                    </h3>
                    <p style={{ fontSize: '14px', color: C.textSecondary, lineHeight: 1.7, whiteSpace: 'pre-line', margin: 0 }}>
                      {jobPosting.requirements}
                    </p>
                  </div>
                )}
              </div>

              {/* CTA Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <button onClick={openInApp} style={{
                  padding: '14px 20px', borderRadius: '12px', fontWeight: 800, fontSize: '14px',
                  background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                  color: C.bgPrimary, border: 'none', cursor: 'pointer',
                  boxShadow: '0 4px 20px rgba(0,245,255,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}>
                  📱 Apply in App
                </button>
                <Link href={teacherSignupLink} style={{
                  padding: '14px 20px', borderRadius: '12px', fontWeight: 600, fontSize: '14px',
                  background: C.bgCard, color: C.textSecondary,
                  border: `1px solid ${C.borderCard}`, textDecoration: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}>
                  Create Teacher Account
                </Link>
              </div>

              {/* ── Application Form ── */}
              <div style={cardStyle}>
                <div style={{ marginBottom: '20px' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, color: C.textPrimary, margin: 0 }}>
                    Apply Online
                  </h2>
                  <p style={{ fontSize: '13px', color: C.textDim, margin: '4px 0 0' }}>
                    Fill in your details to submit your application directly.
                  </p>
                </div>

                <form onSubmit={onSubmit}>
                  {/* Personal Information */}
                  <div style={{ marginBottom: '28px' }}>
                    <h3 style={sectionHeading}>
                      <span>👤</span> Personal Information
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                      <div>
                        <label style={labelStyle}>
                          First Name <span style={{ color: C.accent }}>*</span>
                        </label>
                        <input
                          type="text" value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="First name" required
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>
                          Last Name <span style={{ color: C.accent }}>*</span>
                        </label>
                        <input
                          type="text" value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Last name" required
                          style={inputStyle}
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: '16px' }}>
                      <label style={labelStyle}>
                        Email <span style={{ color: C.accent }}>*</span>
                      </label>
                      <input
                        type="email" value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com" required
                        style={inputStyle}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '16px' }}>
                      <div>
                        <label style={labelStyle}>
                          Phone Number <span style={{ color: C.accent }}>*</span>
                        </label>
                        <input
                          type="tel" value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+27 82 123 4567" required
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>
                          Years of Experience <span style={{ color: C.accent }}>*</span>
                        </label>
                        <input
                          type="number" value={experienceYears}
                          onChange={(e) => setExperienceYears(e.target.value)}
                          placeholder="e.g. 3" required
                          style={inputStyle}
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: '16px' }}>
                      <label style={labelStyle}>
                        Education & Certifications{' '}
                        <span style={{ color: C.textDim, fontWeight: 400 }}>(Optional)</span>
                      </label>
                      <input
                        type="text" value={qualifications}
                        onChange={(e) => setQualifications(e.target.value)}
                        placeholder="e.g. NQF Level 4 in ECD"
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  {/* CV Upload */}
                  <div style={{ marginBottom: '28px' }}>
                    <h3 style={sectionHeading}>
                      <span>📄</span> CV / Resume
                    </h3>
                    <div
                      style={{
                        borderRadius: '12px', padding: '24px', textAlign: 'center', cursor: 'pointer',
                        transition: 'all 0.2s',
                        border: dragActive
                          ? `2px dashed ${C.accent}`
                          : resumeFile
                            ? '2px dashed rgba(16,185,129,0.4)'
                            : `2px dashed ${C.borderInput}`,
                        background: dragActive
                          ? 'rgba(0,245,255,0.06)'
                          : resumeFile ? C.successBg : C.bgInput,
                      }}
                      onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFile(e.dataTransfer.files?.[0] || null); }}
                      onClick={() => document.getElementById('resume-input')?.click()}
                    >
                      <input
                        id="resume-input" type="file"
                        accept={ALLOWED_MIME_TYPES.join(',')}
                        onChange={(e) => handleFile(e.target.files?.[0] || null)}
                        style={{ display: 'none' }}
                      />
                      {resumeFile ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '20px' }}>📄</span>
                          <span style={{ fontSize: '14px', color: C.successLight, fontWeight: 600 }}>{resumeFile.name}</span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setResumeFile(null); }}
                            style={{
                              marginLeft: '8px', color: C.textDim, background: 'none',
                              border: 'none', cursor: 'pointer', fontSize: '16px',
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <>
                          <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>📤</span>
                          <p style={{ fontSize: '14px', color: C.textSecondary, margin: 0 }}>
                            <span style={{ color: C.accentBright, fontWeight: 700 }}>Upload your CV</span> or drag and drop
                          </p>
                          <p style={{ fontSize: '12px', color: C.textDim, margin: '4px 0 0' }}>
                            PDF or Word document, max 50MB
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Cover Letter */}
                  <div style={{ marginBottom: '28px' }}>
                    <h3 style={sectionHeading}>
                      <span>✉️</span> Cover Letter{' '}
                      <span style={{ fontWeight: 400, fontSize: '13px', color: C.textDim }}>(Optional)</span>
                    </h3>
                    <textarea
                      value={coverLetter}
                      onChange={(e) => setCoverLetter(e.target.value)}
                      rows={4}
                      placeholder="Tell us why you'd be a great fit for this role…"
                      style={{ ...inputStyle, resize: 'none', minHeight: '120px', lineHeight: '1.6' }}
                    />
                  </div>

                  {/* Error */}
                  {error && (
                    <div style={{
                      borderRadius: '12px', background: C.errorBg,
                      border: '1px solid rgba(239,68,68,0.25)', padding: '14px 16px',
                      marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '10px',
                    }}>
                      <span style={{ fontSize: '16px', flexShrink: 0 }}>⚠️</span>
                      <p style={{ fontSize: '13px', color: '#fca5a5', margin: 0 }}>{error}</p>
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      width: '100%', padding: '16px 24px', borderRadius: '12px',
                      fontWeight: 800, fontSize: '15px', border: 'none',
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      background: submitting
                        ? 'rgba(255,255,255,0.1)'
                        : `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                      color: submitting ? C.textDim : C.bgPrimary,
                      boxShadow: submitting ? 'none' : '0 4px 20px rgba(0,245,255,0.25)',
                      transition: 'all 0.2s',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    }}
                  >
                    {submitting ? (
                      <>
                        <div style={{
                          width: '16px', height: '16px',
                          border: '2px solid rgba(255,255,255,0.2)',
                          borderTop: '2px solid #fff',
                          borderRadius: '50%', animation: 'spin 1s linear infinite',
                        }} />
                        Submitting…
                      </>
                    ) : 'Submit Application ✨'}
                  </button>

                  <p style={{ fontSize: '11px', color: C.textDim, textAlign: 'center', margin: '12px 0 0' }}>
                    Your information will only be shared with the hiring school.
                  </p>
                </form>
              </div>
            </>
          )}

          {/* ── Success State ── */}
          {submitted && (
            <div style={{ ...cardStyle, textAlign: 'center', padding: '48px 24px', marginTop: '32px' }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '16px',
                background: C.successBg, border: '1px solid rgba(16,185,129,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px',
              }}>
                <span style={{ fontSize: '32px' }}>🎉</span>
              </div>
              <h2 style={{ fontSize: '22px', fontWeight: 800, color: C.textPrimary, marginBottom: '8px' }}>
                Application Submitted!
              </h2>
              <p style={{ fontSize: '14px', color: C.textSecondary, maxWidth: '360px', margin: '0 auto 24px', lineHeight: 1.6 }}>
                Your application has been sent to {schoolName || 'the school'}. They&apos;ll review it and get back to you.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '320px', margin: '0 auto' }}>
                <Link href={teacherSignupLink} style={{
                  padding: '14px 20px', borderRadius: '12px', fontWeight: 700, fontSize: '14px',
                  background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                  color: C.bgPrimary, textDecoration: 'none', textAlign: 'center',
                  boxShadow: '0 4px 20px rgba(0,245,255,0.2)',
                }}>
                  Create Teacher Account
                </Link>
                <button onClick={openInApp} style={{
                  padding: '14px 20px', borderRadius: '12px', fontWeight: 600, fontSize: '14px',
                  background: C.bgCard, color: C.textSecondary,
                  border: `1px solid ${C.borderCard}`, cursor: 'pointer',
                }}>
                  Open EduDash Pro
                </button>
              </div>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer style={{
          borderTop: `1px solid ${C.borderCard}`,
          padding: '24px 16px', textAlign: 'center',
        }}>
          <p style={{ fontSize: '12px', color: C.textDim, margin: 0 }}>
            &copy; {new Date().getFullYear()} EduDash Pro &middot;{' '}
            <Link href="/terms" style={{ color: 'rgba(125,211,252,0.7)', textDecoration: 'none' }}>Terms</Link>
            {' '}&middot;{' '}
            <Link href="/privacy" style={{ color: 'rgba(125,211,252,0.7)', textDecoration: 'none' }}>Privacy</Link>
          </p>
        </footer>
      </div>
    </div>
  );
}
