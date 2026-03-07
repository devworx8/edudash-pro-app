'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { SubPageHeader } from '@/components/dashboard/SubPageHeader';
import {
  AlertCircle,
  CheckCircle2,
  Upload,
  X,
  Calendar,
  Phone,
  Mail,
  User,
  Heart,
  Shield,
  CreditCard,
  Loader2,
  Sparkles,
  Info,
} from 'lucide-react';

const COMMUNITY_SCHOOL_ID = '00000000-0000-0000-0000-000000000001';
const EARLY_BIRD_LIMIT = 20;
const REGISTRATION_FEE_ORIGINAL = 400.0;
const REGISTRATION_FEE_DISCOUNTED = 200.0;

type Grade = 'R' | '1' | '2' | '3' | '4' | '5' | '6' | '7';
const GRADES: Grade[] = ['R', '1', '2', '3', '4', '5', '6', '7'];

function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('27')) {
    const rest = digits.slice(2);
    if (rest.length >= 9) {
      return `+27 ${rest.slice(0, 2)} ${rest.slice(2, 5)} ${rest.slice(5, 9)}`;
    }
    return `+27 ${rest}`;
  } else if (digits.startsWith('0') && digits.length === 10) {
    return `+27 ${digits.slice(1, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
  }
  return phone;
}

export default function AftercareRegistrationPage() {
  const supabase = createClient();

  // User profile
  const [profile, setProfile] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Parent Details
  const [parentFirstName, setParentFirstName] = useState('');
  const [parentLastName, setParentLastName] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentIdNumber, setParentIdNumber] = useState('');

  // Child Details
  const [childFirstName, setChildFirstName] = useState('');
  const [childLastName, setChildLastName] = useState('');
  const [childGrade, setChildGrade] = useState<Grade>('R');
  const [childDateOfBirth, setChildDateOfBirth] = useState('');
  const [childAllergies, setChildAllergies] = useState('');
  const [childMedicalConditions, setChildMedicalConditions] = useState('');

  // Emergency Contact
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [emergencyContactRelation, setEmergencyContactRelation] = useState('');

  // Additional
  const [howDidYouHear, setHowDidYouHear] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<'eft' | 'cash' | 'card' | ''>('');
  const [proofOfPaymentUrl, setProofOfPaymentUrl] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);

  // State
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null);
  const [registrationsClosed, setRegistrationsClosed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const registrationFee = useMemo(() => {
    return spotsRemaining !== null && spotsRemaining > 0
      ? REGISTRATION_FEE_DISCOUNTED
      : REGISTRATION_FEE_ORIGINAL;
  }, [spotsRemaining]);

  // Load profile
  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: p } = await supabase
        .from('profiles')
        .select('*')
        .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`)
        .maybeSingle();

      if (p) {
        setProfile(p);
        setParentFirstName(p.first_name || '');
        setParentLastName(p.last_name || '');
        setParentEmail(p.email || user.email || '');
        setParentPhone(p.phone || '');
      }
    };
    loadProfile();
  }, [supabase]);

  // Fetch spots
  const fetchSpots = async () => {
    const { count, error } = await supabase
      .from('aftercare_registrations')
      .select('*', { count: 'exact', head: true })
      .eq('preschool_id', COMMUNITY_SCHOOL_ID);

    if (!error && count !== null) {
      const remaining = Math.max(0, EARLY_BIRD_LIMIT - count);
      setSpotsRemaining(remaining);
      if (remaining === 0) setRegistrationsClosed(true);
    } else {
      setSpotsRemaining(EARLY_BIRD_LIMIT);
    }
  };

  useEffect(() => {
    fetchSpots();

    const channel = supabase
      .channel('aftercare-registrations-count-web')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'aftercare_registrations', filter: `preschool_id=eq.${COMMUNITY_SCHOOL_ID}` }, () => fetchSpots())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'aftercare_registrations', filter: `preschool_id=eq.${COMMUNITY_SCHOOL_ID}` }, () => fetchSpots())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generatePaymentReference = () => {
    const childPart = (childFirstName.substring(0, 3) + childLastName.substring(0, 3)).toUpperCase();
    const phonePart = parentPhone.slice(-4);
    return `AC-${childPart}-${phonePart}`;
  };

  const handleProofUpload = async (file: File) => {
    setUploadingProof(true);
    try {
      const fileName = `aftercare_pop_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
      const { error } = await supabase.storage
        .from('pop-uploads')
        .upload(`aftercare/${fileName}`, file, { contentType: file.type, upsert: false });

      if (error) throw error;

      const { data: urlData } = supabase.storage.from('pop-uploads').getPublicUrl(`aftercare/${fileName}`);
      setProofOfPaymentUrl(urlData.publicUrl);
      setProofFile(file);
    } catch (err: any) {
      alert(err?.message || 'Failed to upload proof of payment.');
    } finally {
      setUploadingProof(false);
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!parentFirstName.trim()) newErrors.parentFirstName = 'First name is required';
    if (!parentLastName.trim()) newErrors.parentLastName = 'Last name is required';
    if (!parentEmail.trim()) newErrors.parentEmail = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) newErrors.parentEmail = 'Invalid email format';
    if (!parentPhone.trim()) newErrors.parentPhone = 'Phone number is required';
    if (!childFirstName.trim()) newErrors.childFirstName = 'Child first name is required';
    if (!childLastName.trim()) newErrors.childLastName = 'Child last name is required';
    if (!childDateOfBirth) newErrors.childDateOfBirth = 'Date of birth is required';
    if (!emergencyContactName.trim()) newErrors.emergencyContactName = 'Emergency contact name is required';
    if (!emergencyContactPhone.trim()) newErrors.emergencyContactPhone = 'Emergency contact phone is required';
    if (!emergencyContactRelation.trim()) newErrors.emergencyContactRelation = 'Relationship is required';
    if (!acceptTerms) newErrors.acceptTerms = 'You must accept the terms and conditions';

    if (parentPhone && !/^\+?[0-9]{10,13}$/.test(parentPhone.replace(/\s/g, ''))) {
      newErrors.parentPhone = 'Invalid phone number format';
    }
    if (emergencyContactPhone && !/^\+?[0-9]{10,13}$/.test(emergencyContactPhone.replace(/\s/g, ''))) {
      newErrors.emergencyContactPhone = 'Invalid phone number format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    if (registrationsClosed) {
      alert('Early bird registrations are now full. Please contact the school.');
      return;
    }

    setLoading(true);
    try {
      const paymentRef = generatePaymentReference();

      // Duplicate check
      const { data: existing } = await supabase
        .from('aftercare_registrations')
        .select('id, status')
        .eq('parent_email', parentEmail.trim())
        .eq('child_first_name', childFirstName.trim())
        .eq('child_last_name', childLastName.trim())
        .eq('preschool_id', COMMUNITY_SCHOOL_ID)
        .neq('status', 'cancelled');

      if (existing && existing.length > 0 && existing.some((r: any) => r.status !== 'cancelled')) {
        alert('A registration for this child already exists. Please contact the school to update.');
        setLoading(false);
        return;
      }

      const payload = {
        preschool_id: COMMUNITY_SCHOOL_ID,
        parent_user_id: userId,
        parent_first_name: parentFirstName.trim(),
        parent_last_name: parentLastName.trim(),
        parent_email: parentEmail.trim().toLowerCase(),
        parent_phone: formatPhoneNumber(parentPhone),
        parent_id_number: parentIdNumber.trim() || null,
        child_first_name: childFirstName.trim(),
        child_last_name: childLastName.trim(),
        child_grade: childGrade,
        child_date_of_birth: childDateOfBirth || null,
        child_allergies: childAllergies.trim() || null,
        child_medical_conditions: childMedicalConditions.trim() || null,
        emergency_contact_name: emergencyContactName.trim(),
        emergency_contact_phone: formatPhoneNumber(emergencyContactPhone),
        emergency_contact_relation: emergencyContactRelation.trim(),
        how_did_you_hear: howDidYouHear.trim() || null,
        registration_fee: registrationFee,
        registration_fee_original: REGISTRATION_FEE_ORIGINAL,
        promotion_code: spotsRemaining !== null && spotsRemaining > 0 ? 'EARLYBIRD50' : null,
        payment_reference: paymentRef,
        status: proofOfPaymentUrl ? 'paid' : 'pending_payment',
        proof_of_payment_url: proofOfPaymentUrl,
      };

      const { data, error: insertError } = await supabase
        .from('aftercare_registrations')
        .insert(payload)
        .select()
        .single();

      if (insertError) throw insertError;

      // Refresh spots
      await fetchSpots();

      // Send confirmation email (best-effort)
      try {
        await supabase.functions.invoke('send-aftercare-confirmation', {
          body: {
            registration_id: data.id,
            parent_email: parentEmail,
            parent_name: `${parentFirstName} ${parentLastName}`,
            child_name: `${childFirstName} ${childLastName}`,
            payment_reference: paymentRef,
            has_proof: !!proofOfPaymentUrl,
          },
        });
      } catch { /* ignore */ }

      // Notify admins (best-effort)
      try {
        await supabase.functions.invoke('notifications-dispatcher', {
          body: {
            event_type: 'aftercare_registration_submitted',
            preschool_id: COMMUNITY_SCHOOL_ID,
            role_targets: ['principal', 'principal_admin'],
            registration_id: data.id,
            child_name: `${childFirstName} ${childLastName}`,
            parent_name: `${parentFirstName} ${parentLastName}`,
          },
        });
      } catch { /* ignore */ }

      setSubmitted(true);
    } catch (e: any) {
      alert(e?.message || 'Submission failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <ParentShell>
        <SubPageHeader title="Aftercare Registration" backTo="/dashboard/parent" />
        <div style={{ maxWidth: 600, margin: '0 auto', padding: 24, textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--success-bg, #dcfce7)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <CheckCircle2 size={40} color="var(--success, #16a34a)" />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--foreground)', marginBottom: 8 }}>Registration Submitted!</h2>
          <p style={{ color: 'var(--muted)', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
            {proofOfPaymentUrl
              ? 'Your registration and payment proof have been received. You will receive a confirmation email shortly.'
              : 'Your registration has been submitted. Please upload proof of payment to complete your registration. Check your email for banking details.'}
          </p>
          <a href="/dashboard/parent" style={{ display: 'inline-block', padding: '12px 32px', background: 'var(--primary)', color: 'white', borderRadius: 10, fontWeight: 600, textDecoration: 'none' }}>
            Back to Dashboard
          </a>
        </div>
      </ParentShell>
    );
  }

  return (
    <ParentShell>
      <SubPageHeader title="Aftercare Registration" backTo="/dashboard/parent" />

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 16px 48px' }}>
        {/* Early bird banner */}
        {spotsRemaining !== null && spotsRemaining > 0 && (
          <div style={{ background: 'var(--primary-bg, #eff6ff)', borderLeft: '4px solid var(--primary)', borderRadius: 10, padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles size={20} color="var(--primary)" />
            <span style={{ color: 'var(--foreground)', fontWeight: 600, fontSize: 14 }}>
              🎉 Early Bird Special: {spotsRemaining} spots remaining at R{REGISTRATION_FEE_DISCOUNTED.toFixed(2)} (50% off!)
            </span>
          </div>
        )}

        {registrationsClosed && (
          <div style={{ background: 'var(--danger-bg, #fef2f2)', borderLeft: '4px solid var(--danger)', borderRadius: 10, padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertCircle size={20} color="var(--danger)" />
            <span style={{ color: 'var(--foreground)', fontWeight: 600, fontSize: 14 }}>
              ⚠️ Early bird registrations are now full. Regular pricing applies.
            </span>
          </div>
        )}

        {/* Pricing box */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--foreground)', marginBottom: 8 }}>Registration Fee</h3>
          {spotsRemaining !== null && spotsRemaining > 0 ? (
            <>
              <p style={{ color: 'var(--muted)', fontSize: 14 }}>Original Price</p>
              <p style={{ color: 'var(--muted)', fontSize: 18, textDecoration: 'line-through', margin: '4px 0' }}>R {REGISTRATION_FEE_ORIGINAL.toFixed(2)}</p>
              <p style={{ color: '#10b981', fontSize: 32, fontWeight: 800, margin: '8px 0' }}>R {REGISTRATION_FEE_DISCOUNTED.toFixed(2)}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#10b98120', padding: '8px 12px', borderRadius: 8 }}>
                <CheckCircle2 size={16} color="#10b981" />
                <span style={{ color: '#10b981', fontSize: 14, fontWeight: 600 }}>EARLYBIRD50 applied — You save R{REGISTRATION_FEE_DISCOUNTED.toFixed(2)}!</span>
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--foreground)', fontSize: 32, fontWeight: 800, margin: '4px 0' }}>R {REGISTRATION_FEE_ORIGINAL.toFixed(2)}</p>
          )}
          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>One-time registration fee</p>
        </div>

        {/* Form */}
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Parent Information */}
          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend style={{ fontSize: 18, fontWeight: 700, color: 'var(--foreground)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <User size={20} /> Parent Information
            </legend>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="First name *" value={parentFirstName} onChange={setParentFirstName} error={errors.parentFirstName} placeholder="e.g. Thandi" />
              <FormField label="Last name *" value={parentLastName} onChange={setParentLastName} error={errors.parentLastName} placeholder="e.g. Ndlovu" />
            </div>

            <FormField label="Email *" value={parentEmail} onChange={setParentEmail} error={errors.parentEmail} type="email" placeholder="e.g. thandi@example.com" icon={<Mail size={16} />} />
            <FormField label="Phone number *" value={parentPhone} onChange={setParentPhone} error={errors.parentPhone} type="tel" placeholder="+27 82 123 4567" hint="Format: +27 XX XXX XXXX or 0XX XXX XXXX" icon={<Phone size={16} />} />
            <FormField label="ID Number (optional)" value={parentIdNumber} onChange={setParentIdNumber} placeholder="e.g. 9001015800085" />
          </fieldset>

          {/* Child Information */}
          <fieldset style={{ border: 'none', padding: 0, margin: 0, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
            <legend style={{ fontSize: 18, fontWeight: 700, color: 'var(--foreground)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Heart size={20} /> Child Information
            </legend>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="First name *" value={childFirstName} onChange={setChildFirstName} error={errors.childFirstName} placeholder="e.g. Sipho" />
              <FormField label="Last name *" value={childLastName} onChange={setChildLastName} error={errors.childLastName} placeholder="e.g. Ndlovu" />
            </div>

            <div style={{ marginTop: 8 }}>
              <label style={{ display: 'block', fontWeight: 600, color: 'var(--foreground)', fontSize: 14, marginBottom: 6 }}>Grade *</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {GRADES.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setChildGrade(g)}
                    style={{
                      padding: '10px 16px',
                      borderRadius: 10,
                      border: `1.5px solid ${childGrade === g ? 'var(--primary)' : 'var(--border)'}`,
                      background: childGrade === g ? 'var(--primary-bg, #eff6ff)' : 'var(--surface)',
                      color: childGrade === g ? 'var(--primary)' : 'var(--foreground)',
                      fontWeight: childGrade === g ? 600 : 500,
                      cursor: 'pointer',
                      fontSize: 14,
                      minWidth: 64,
                    }}
                  >
                    Grade {g}
                  </button>
                ))}
              </div>
            </div>

            <FormField label="Date of birth *" value={childDateOfBirth} onChange={setChildDateOfBirth} error={errors.childDateOfBirth} type="date" icon={<Calendar size={16} />} />
            <FormField label="Allergies (optional)" value={childAllergies} onChange={setChildAllergies} placeholder="e.g. Peanuts, Dairy" multiline />
            <FormField label="Medical conditions (optional)" value={childMedicalConditions} onChange={setChildMedicalConditions} placeholder="e.g. Asthma, Diabetes" multiline />
          </fieldset>

          {/* Emergency Contact */}
          <fieldset style={{ border: 'none', padding: 0, margin: 0, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
            <legend style={{ fontSize: 18, fontWeight: 700, color: 'var(--foreground)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={20} /> Emergency Contact
            </legend>

            <FormField label="Name *" value={emergencyContactName} onChange={setEmergencyContactName} error={errors.emergencyContactName} placeholder="e.g. Sipho Mthethwa" />
            <FormField label="Phone number *" value={emergencyContactPhone} onChange={setEmergencyContactPhone} error={errors.emergencyContactPhone} type="tel" placeholder="+27 82 123 4567" hint="Format: +27 XX XXX XXXX or 0XX XXX XXXX" icon={<Phone size={16} />} />
            <FormField label="Relationship *" value={emergencyContactRelation} onChange={setEmergencyContactRelation} error={errors.emergencyContactRelation} placeholder="e.g. Mother, Father, Aunt" />
          </fieldset>

          {/* Additional */}
          <fieldset style={{ border: 'none', padding: 0, margin: 0, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
            <legend style={{ fontSize: 18, fontWeight: 700, color: 'var(--foreground)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Info size={20} /> Additional Information
            </legend>
            <FormField label="How did you hear about us? (optional)" value={howDidYouHear} onChange={setHowDidYouHear} placeholder="e.g. Facebook, Friend, School notice" />
          </fieldset>

          {/* Payment */}
          <fieldset style={{ border: 'none', padding: 0, margin: 0, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
            <legend style={{ fontSize: 18, fontWeight: 700, color: 'var(--foreground)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CreditCard size={20} /> Payment
            </legend>

            <label style={{ display: 'block', fontWeight: 600, color: 'var(--foreground)', fontSize: 14, marginBottom: 6 }}>Payment Method</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {([
                { value: 'eft' as const, label: '🏦 EFT' },
                { value: 'cash' as const, label: '💵 Cash' },
                { value: 'card' as const, label: '💳 Card' },
              ]).map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setPaymentMethod(m.value)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 10,
                    border: `1.5px solid ${paymentMethod === m.value ? 'var(--primary)' : 'var(--border)'}`,
                    background: paymentMethod === m.value ? 'var(--primary-bg, #eff6ff)' : 'var(--surface)',
                    color: paymentMethod === m.value ? 'var(--primary)' : 'var(--foreground)',
                    fontWeight: paymentMethod === m.value ? 600 : 500,
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 16 }}>
              <label style={{ display: 'block', fontWeight: 600, color: 'var(--foreground)', fontSize: 14, marginBottom: 4 }}>Proof of Payment (optional but recommended)</label>
              <p style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 8 }}>Upload proof now to get approved within 24 hours. Otherwise, approval takes 2-3 days.</p>

              {proofOfPaymentUrl ? (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img src={proofOfPaymentUrl} alt="Proof of payment" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--border)' }} />
                  <button
                    type="button"
                    onClick={() => { setProofOfPaymentUrl(null); setProofFile(null); }}
                    style={{
                      position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%',
                      background: 'var(--danger)', border: 'none', color: 'white', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <label
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: 16, borderRadius: 10, border: '2px dashed var(--primary)',
                    background: 'var(--surface)', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                    color: 'var(--primary)',
                  }}
                >
                  {uploadingProof ? (
                    <><Loader2 size={20} className="spin" /> Uploading...</>
                  ) : (
                    <><Upload size={20} /> Upload Proof of Payment</>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    disabled={uploadingProof}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleProofUpload(file);
                    }}
                  />
                </label>
              )}
            </div>
          </fieldset>

          {/* Terms */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                style={{ width: 20, height: 20, marginTop: 2, accentColor: 'var(--primary)' }}
              />
              <span style={{ color: 'var(--foreground)', fontSize: 14, lineHeight: 1.5 }}>
                I accept the terms and conditions and privacy policy *
              </span>
            </label>
            {errors.acceptTerms && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.acceptTerms}</p>}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || registrationsClosed}
            style={{
              padding: '14px 32px',
              borderRadius: 10,
              background: loading || registrationsClosed ? 'var(--muted)' : 'var(--primary)',
              color: 'white',
              fontWeight: 700,
              fontSize: 16,
              border: 'none',
              cursor: loading || registrationsClosed ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {loading ? <><Loader2 size={20} className="spin" /> Submitting...</> : 'Submit Registration'}
          </button>
        </form>
      </div>
    </ParentShell>
  );
}

/* ---- Reusable Form Field ---- */
function FormField({
  label,
  value,
  onChange,
  error,
  type = 'text',
  placeholder,
  hint,
  icon,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  placeholder?: string;
  hint?: string;
  icon?: React.ReactNode;
  multiline?: boolean;
}) {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    paddingLeft: icon ? 36 : 12,
    borderRadius: 10,
    border: `1.5px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
    background: 'var(--surface)',
    color: 'var(--foreground)',
    fontSize: 14,
    outline: 'none',
    resize: multiline ? 'vertical' : undefined,
    minHeight: multiline ? 72 : undefined,
    boxSizing: 'border-box',
  };

  return (
    <div style={{ marginTop: 8 }}>
      <label style={{ display: 'block', fontWeight: 600, color: 'var(--foreground)', fontSize: 14, marginBottom: 4 }}>{label}</label>
      {hint && <p style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>{hint}</p>}
      <div style={{ position: 'relative' }}>
        {icon && (
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', display: 'flex' }}>
            {icon}
          </span>
        )}
        {multiline ? (
          <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
        ) : (
          <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
        )}
      </div>
      {error && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{error}</p>}
    </div>
  );
}
