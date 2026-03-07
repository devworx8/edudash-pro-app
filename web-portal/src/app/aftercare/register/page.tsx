'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

// EduDash Pro Community School ID
const COMMUNITY_SCHOOL_ID = '00000000-0000-0000-0000-000000000001';
const EARLY_BIRD_LIMIT = 20; // First 20 registrations get 50% off

type Grade = 'R' | '1' | '2' | '3' | '4' | '5' | '6' | '7';

interface FormData {
  // Parent Details
  parentFirstName: string;
  parentLastName: string;
  parentEmail: string;
  parentPhone: string;
  parentIdNumber: string;
  
  // Child Details
  childFirstName: string;
  childLastName: string;
  childGrade: Grade;
  childDateOfBirth: string;
  childAllergies: string;
  childMedicalConditions: string;
  
  // Emergency Contact
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  
  // Additional
  howDidYouHear: string;
  acceptTerms: boolean;
}

export default function AftercarePage() {
  const [formData, setFormData] = useState<FormData>({
    parentFirstName: '',
    parentLastName: '',
    parentEmail: '',
    parentPhone: '',
    parentIdNumber: '',
    childFirstName: '',
    childLastName: '',
    childGrade: 'R',
    childDateOfBirth: '',
    childAllergies: '',
    childMedicalConditions: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelation: '',
    howDidYouHear: '',
    acceptTerms: false,
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null);
  const [registrationsClosed, setRegistrationsClosed] = useState(false);
  const [proofOfPayment, setProofOfPayment] = useState<File | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);

  // Fetch current registration count
  const fetchSpots = async () => {
    try {
      const supabase = createClient();
      const { count, error } = await supabase
        .from('aftercare_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('preschool_id', COMMUNITY_SCHOOL_ID);
      
      if (!error && count !== null) {
        const remaining = Math.max(0, EARLY_BIRD_LIMIT - count);
        setSpotsRemaining(remaining);
        if (remaining === 0) {
          setRegistrationsClosed(true);
        }
      }
    } catch (err) {
      console.error('Error fetching spots:', err);
      setSpotsRemaining(EARLY_BIRD_LIMIT); // Default to full if error
    }
  };

  // Fetch spots on mount and set up realtime subscription
  useEffect(() => {
    fetchSpots();

    // Set up realtime subscription to update counter when new registrations are added
    const supabase = createClient();
    const channel = supabase
      .channel('aftercare-registrations-count')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'aftercare_registrations',
          filter: `preschool_id=eq.${COMMUNITY_SCHOOL_ID}`,
        },
        () => {
          // Refresh count when a new registration is inserted
          fetchSpots();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'aftercare_registrations',
          filter: `preschool_id=eq.${COMMUNITY_SCHOOL_ID}`,
        },
        () => {
          // Refresh count when a registration is deleted
          fetchSpots();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Generate payment reference for use in submission
  const generatePaymentReference = () => {
    const childPart = formData.childFirstName.substring(0, 3).toUpperCase() + formData.childLastName.substring(0, 3).toUpperCase();
    const phonePart = formData.parentPhone.slice(-4);
    return `AC-${childPart}-${phonePart}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const paymentRef = generatePaymentReference();

    try {
      const supabase = createClient();
      
      // Get current user session to set parent_user_id if authenticated
      const { data: { session } } = await supabase.auth.getSession();
      
      // Check for duplicate registration before submitting
      const { data: existingRegistrations, error: checkError } = await supabase
        .from('aftercare_registrations')
        .select('id, status, created_at')
        .eq('parent_email', formData.parentEmail)
        .eq('child_first_name', formData.childFirstName.trim())
        .eq('child_last_name', formData.childLastName.trim())
        .eq('preschool_id', COMMUNITY_SCHOOL_ID)
        .neq('status', 'cancelled');
      
      if (checkError && checkError.code !== 'PGRST116') {
        // PGRST116 is "no rows returned" which is fine
        console.error('Error checking for duplicates:', checkError);
      }
      
      if (existingRegistrations && existingRegistrations.length > 0) {
        const activeRegistration = existingRegistrations.find((r: { status: string }) => r.status !== 'cancelled');
        if (activeRegistration) {
          setError('A registration for this child already exists. Please contact the school if you need to update your registration.');
          setIsSubmitting(false);
          return;
        }
      }
      
      // Create the registration record FIRST (always pending_payment initially)
      const { data, error: insertError } = await supabase
        .from('aftercare_registrations')
        .insert({
          preschool_id: COMMUNITY_SCHOOL_ID,
          parent_user_id: session?.user?.id || null, // Set parent_user_id if user is authenticated
          parent_first_name: formData.parentFirstName,
          parent_last_name: formData.parentLastName,
          parent_email: formData.parentEmail,
          parent_phone: formData.parentPhone,
          parent_id_number: formData.parentIdNumber,
          child_first_name: formData.childFirstName,
          child_last_name: formData.childLastName,
          child_grade: formData.childGrade,
          child_date_of_birth: formData.childDateOfBirth || null,
          child_allergies: formData.childAllergies || null,
          child_medical_conditions: formData.childMedicalConditions || null,
          emergency_contact_name: formData.emergencyContactName,
          emergency_contact_phone: formData.emergencyContactPhone,
          emergency_contact_relation: formData.emergencyContactRelation,
          how_did_you_hear: formData.howDidYouHear,
          registration_fee: 200.00,
          registration_fee_original: 400.00,
          promotion_code: 'EARLYBIRD50',
          payment_reference: paymentRef,
          status: 'pending_payment', // Always start as pending - POP comes after payment
          proof_of_payment_url: null, // No POP at registration time
        })
        .select()
        .single();

      if (insertError) {
        // If table doesn't exist, fall back to a simpler approach
        if (insertError.code === '42P01') {
          // Table doesn't exist - send via email or store differently
          console.log('Aftercare registrations table not found, using fallback');
          
          // For now, just show success and handle manually
          setSubmitted(true);
          return;
        }
        throw insertError;
      }

      // Store registration ID for POP upload later
      setRegistrationId(data.id);

      // Refresh spots counter immediately after successful registration
      await fetchSpots();

      // Send confirmation email via Edge Function
      try {
        await supabase.functions.invoke('aftercare-email', {
          body: { 
            registration_id: data.id, 
            type: 'confirmation' 
          },
        });
        console.log('Confirmation email sent');
      } catch (emailErr) {
        // Don't fail the registration if email fails
        console.log('Email sending failed, registration still successful:', emailErr);
      }

      setSubmitted(true);
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err.message || 'Registration failed. Please try again or contact support.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle POP upload after registration
  const handlePOPUpload = async () => {
    if (!proofOfPayment || !registrationId) return;
    
    setUploadingProof(true);
    setError(null);

    try {
      const supabase = createClient();
      const paymentRef = generatePaymentReference();
      const fileExt = proofOfPayment.name.split('.').pop();
      const fileName = `${paymentRef}-${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('aftercare-payments')
        .upload(fileName, proofOfPayment, {
          cacheControl: '3600',
          upsert: false
        });
      
      if (uploadError) {
        throw uploadError;
      }
      
      const { data: { publicUrl } } = supabase.storage
        .from('aftercare-payments')
        .getPublicUrl(fileName);
      
      // Update registration with POP URL
      const { error: updateError } = await supabase
        .from('aftercare_registrations')
        .update({
          proof_of_payment_url: publicUrl,
          status: 'paid', // Update status to paid when POP is uploaded
        })
        .eq('id', registrationId);
      
      if (updateError) {
        throw updateError;
      }
      
      // Clear the file input
      setProofOfPayment(null);
      
      // Show success message
      alert('✅ Proof of payment uploaded successfully! We\'ll verify it within 24 hours.');
    } catch (err: any) {
      console.error('POP upload error:', err);
      setError('Failed to upload proof of payment. Please email it to admin@edudashpro.org.za');
    } finally {
      setUploadingProof(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  // Generate unique payment reference
  const paymentReference = `AC-${formData.childFirstName.substring(0, 3).toUpperCase()}${formData.childLastName.substring(0, 3).toUpperCase()}-${formData.parentPhone.slice(-4)}`;

  if (submitted) {
    const hasUploadedPOP = false; // POP is uploaded separately after registration
    
    return (
      <div style={{minHeight: '100vh', background: 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 50%, #8b5cf6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'}}>
        <div style={{background: '#fff', borderRadius: '24px', padding: '48px', maxWidth: '700px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)'}}>
          <div style={{fontSize: '64px', marginBottom: '24px'}}>🎉</div>
          <h1 style={{fontSize: '28px', fontWeight: 800, color: '#1f2937', marginBottom: '16px'}}>Registration Submitted!</h1>
          <p style={{color: '#6b7280', fontSize: '16px', lineHeight: 1.6, marginBottom: '8px'}}>
            Thank you for registering <strong>{formData.childFirstName} {formData.childLastName}</strong> for our aftercare program at EduDash Pro Community School.
          </p>
          <p style={{color: '#9ca3af', fontSize: '14px', marginBottom: '24px'}}>
            Your registration reference: <strong style={{color: '#7c3aed'}}>{paymentReference}</strong>
          </p>
          
          {/* Status Banner */}
          <div style={{
            background: hasUploadedPOP ? '#ecfdf5' : '#fef3c7',
            border: `2px solid ${hasUploadedPOP ? '#10b981' : '#fbbf24'}`,
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            textAlign: 'left'
          }}>
            <span style={{fontSize: '28px'}}>{hasUploadedPOP ? '✅' : '⏳'}</span>
            <div style={{flex: 1}}>
              <p style={{color: hasUploadedPOP ? '#065f46' : '#92400e', fontSize: '14px', fontWeight: 700, margin: 0}}>
                {hasUploadedPOP ? 'Payment Proof Received!' : 'Payment Pending'}
              </p>
              <p style={{color: hasUploadedPOP ? '#047857' : '#b45309', fontSize: '13px', margin: '4px 0 0'}}>
                {hasUploadedPOP 
                  ? 'We\'ll verify your payment within 24 hours and send confirmation.' 
                  : 'Please make payment and upload proof below to complete registration.'}
              </p>
            </div>
          </div>
          
          {/* Next Steps */}
          <div style={{background: '#f3f4f6', borderRadius: '12px', padding: '24px', marginBottom: '24px', textAlign: 'left'}}>
            <h3 style={{fontSize: '16px', fontWeight: 700, color: '#1f2937', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px'}}>
              <span>📋</span> What Happens Next?
            </h3>
            <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
              {/* Step 1 */}
              <div style={{display: 'flex', gap: '12px', alignItems: 'flex-start'}}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: hasUploadedPOP ? '#10b981' : '#7c3aed',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 700,
                  flexShrink: 0
                }}>
                  {hasUploadedPOP ? '✓' : '1'}
                </div>
                <div>
                  <p style={{fontSize: '14px', fontWeight: 600, color: '#374151', margin: '0 0 4px'}}>
                    {hasUploadedPOP ? '✅ Payment Submitted' : 'Make Payment (R200.00)'}
                  </p>
                  <p style={{fontSize: '13px', color: '#6b7280', margin: 0, lineHeight: 1.5}}>
                    {hasUploadedPOP 
                      ? 'Your proof of payment has been received and is being verified.' 
                      : 'Transfer R200.00 to our bank account using the details below.'}
                  </p>
                </div>
              </div>
              
              {/* Step 2 */}
              <div style={{display: 'flex', gap: '12px', alignItems: 'flex-start'}}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: hasUploadedPOP ? '#10b981' : '#e5e7eb',
                  color: hasUploadedPOP ? '#fff' : '#6b7280',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 700,
                  flexShrink: 0
                }}>
                  {hasUploadedPOP ? '✓' : '2'}
                </div>
                <div>
                  <p style={{fontSize: '14px', fontWeight: 600, color: '#374151', margin: '0 0 4px'}}>
                    {hasUploadedPOP ? '✅ Proof Uploaded' : 'Upload Proof of Payment'}
                  </p>
                  <p style={{fontSize: '13px', color: '#6b7280', margin: 0, lineHeight: 1.5}}>
                    {hasUploadedPOP 
                      ? 'Thank you! Your payment proof is being reviewed.' 
                      : 'Email your proof of payment to admin@edudashpro.org.za with reference: ' + paymentReference}
                  </p>
                </div>
              </div>
              
              {/* Step 3 */}
              <div style={{display: 'flex', gap: '12px', alignItems: 'flex-start'}}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#e5e7eb',
                  color: '#6b7280',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 700,
                  flexShrink: 0
                }}>3</div>
                <div>
                  <p style={{fontSize: '14px', fontWeight: 600, color: '#374151', margin: '0 0 4px'}}>
                    We Verify Your Payment (24 hours)
                  </p>
                  <p style={{fontSize: '13px', color: '#6b7280', margin: 0, lineHeight: 1.5}}>
                    Our team will verify your payment and approve your registration within 24 hours.
                  </p>
                </div>
              </div>
              
              {/* Step 4 */}
              <div style={{display: 'flex', gap: '12px', alignItems: 'flex-start'}}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#e5e7eb',
                  color: '#6b7280',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 700,
                  flexShrink: 0
                }}>4</div>
                <div>
                  <p style={{fontSize: '14px', fontWeight: 600, color: '#374151', margin: '0 0 4px'}}>
                    Receive Welcome Email & Access
                  </p>
                  <p style={{fontSize: '13px', color: '#6b7280', margin: 0, lineHeight: 1.5}}>
                    Once approved, you'll receive a welcome email with your login credentials and app access instructions.
                  </p>
                </div>
              </div>
              
              {/* Step 5 */}
              <div style={{display: 'flex', gap: '12px', alignItems: 'flex-start'}}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#e5e7eb',
                  color: '#6b7280',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 700,
                  flexShrink: 0
                }}>5</div>
                <div>
                  <p style={{fontSize: '14px', fontWeight: 600, color: '#374151', margin: '0 0 4px'}}>
                    Start Using EduDash Pro!
                  </p>
                  <p style={{fontSize: '13px', color: '#6b7280', margin: 0, lineHeight: 1.5}}>
                    Sign in to track your child's progress, communicate with teachers, and access learning resources.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Banking Details - Always show after registration */}
          <div style={{background: '#ecfdf5', border: '2px solid #10b981', borderRadius: '12px', padding: '24px', marginBottom: '24px', textAlign: 'left'}}>
            <h3 style={{fontSize: '16px', fontWeight: 700, color: '#065f46', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px'}}>
              <span>🏦</span> Step 1: Make Payment (R200.00)
            </h3>
            <p style={{color: '#047857', fontSize: '13px', marginBottom: '16px'}}>
              Transfer <strong>R200.00</strong> to our bank account using the details below:
            </p>
            <div style={{display: 'grid', gap: '10px'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #a7f3d0', paddingBottom: '8px'}}>
                <span style={{color: '#6b7280', fontSize: '14px'}}>Bank:</span>
                <span style={{color: '#065f46', fontWeight: 700, fontSize: '14px'}}>Capitec Bank</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #a7f3d0', paddingBottom: '8px'}}>
                <span style={{color: '#6b7280', fontSize: '14px'}}>Account Name:</span>
                <span style={{color: '#065f46', fontWeight: 700, fontSize: '14px'}}>EduDash Pro Pty Ltd</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #a7f3d0', paddingBottom: '8px'}}>
                <span style={{color: '#6b7280', fontSize: '14px'}}>Account Number:</span>
                <span style={{color: '#065f46', fontWeight: 700, fontSize: '14px'}}>1053747152</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #a7f3d0', paddingBottom: '8px'}}>
                <span style={{color: '#6b7280', fontSize: '14px'}}>Branch Code:</span>
                <span style={{color: '#065f46', fontWeight: 700, fontSize: '14px'}}>450105</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', background: '#d1fae5', padding: '12px', borderRadius: '8px', marginTop: '8px'}}>
                <span style={{color: '#065f46', fontSize: '14px', fontWeight: 600}}>Your Reference:</span>
                <span style={{color: '#065f46', fontWeight: 800, fontSize: '16px', letterSpacing: '1px', fontFamily: 'monospace'}}>{paymentReference}</span>
              </div>
            </div>
            <div style={{marginTop: '12px', padding: '12px', background: '#fef3c7', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px'}}>
              <span style={{fontSize: '18px'}}>⚠️</span>
              <p style={{color: '#92400e', fontSize: '13px', margin: 0}}>
                <strong>IMPORTANT:</strong> Use <strong>{paymentReference}</strong> as your payment reference so we can identify your payment quickly.
              </p>
            </div>
          </div>

          {/* POP Upload Section - After payment instructions */}
          <div style={{background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%)', border: '2px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', padding: '24px', marginBottom: '24px', textAlign: 'left'}}>
            <h3 style={{fontSize: '16px', fontWeight: 700, color: '#065f46', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px'}}>
              <span>📄</span> Step 2: Upload Proof of Payment
            </h3>
            <p style={{color: '#047857', fontSize: '13px', marginBottom: '16px', lineHeight: 1.5}}>
              After making payment, upload your proof of payment here for faster processing (usually approved within 24 hours instead of 2-3 days).
            </p>
            
            <div style={{border: '2px dashed rgba(16, 185, 129, 0.4)', borderRadius: '12px', padding: '24px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: 'rgba(0,0,0,0.1)'}}
              onClick={() => document.getElementById('popUpload')?.click()}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#10b981'; }}
              onDragLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.4)'; }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                const file = e.dataTransfer.files[0];
                if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
                  setProofOfPayment(file);
                }
              }}
            >
              <input
                id="popUpload"
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setProofOfPayment(e.target.files?.[0] || null)}
                style={{display: 'none'}}
              />
              {proofOfPayment ? (
                <div>
                  <span style={{fontSize: '32px', marginBottom: '8px', display: 'block'}}>✅</span>
                  <p style={{color: '#10b981', fontWeight: 600, fontSize: '14px'}}>{proofOfPayment.name}</p>
                  <p style={{color: '#6ee7b7', fontSize: '12px', marginTop: '4px'}}>
                    {(proofOfPayment.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setProofOfPayment(null); }}
                    style={{marginTop: '8px', padding: '4px 12px', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer'}}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div>
                  <span style={{fontSize: '32px', marginBottom: '8px', display: 'block'}}>📤</span>
                  <p style={{color: '#10b981', fontWeight: 600, fontSize: '14px'}}>Click or drag to upload proof of payment</p>
                  <p style={{color: '#6b7280', fontSize: '12px', marginTop: '4px'}}>PNG, JPG or PDF (max 5MB)</p>
                </div>
              )}
            </div>

            {proofOfPayment && (
              <button
                type="button"
                onClick={handlePOPUpload}
                disabled={uploadingProof}
                style={{
                  width: '100%',
                  marginTop: '16px',
                  padding: '14px',
                  background: uploadingProof ? '#9ca3af' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '15px',
                  fontWeight: 700,
                  cursor: uploadingProof ? 'not-allowed' : 'pointer',
                  boxShadow: uploadingProof ? 'none' : '0 4px 12px rgba(16, 185, 129, 0.3)'
                }}
              >
                {uploadingProof ? '📤 Uploading...' : '✅ Upload Proof of Payment'}
              </button>
            )}

            {error && (
              <p style={{color: '#ef4444', fontSize: '13px', marginTop: '12px', textAlign: 'center'}}>{error}</p>
            )}

            <p style={{color: '#6b7280', fontSize: '12px', marginTop: '16px', textAlign: 'center', fontStyle: 'italic'}}>
              Or email your proof to admin@edudashpro.org.za with reference: <strong>{paymentReference}</strong>
            </p>
          </div>
          
          {/* Amount Summary */}
          <div style={{background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '24px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
              <span style={{color: '#6b7280', fontSize: '14px'}}>Original Price:</span>
              <span style={{color: '#9ca3af', fontSize: '16px', textDecoration: 'line-through'}}>R400.00</span>
            </div>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
              <span style={{color: '#6b7280', fontSize: '14px'}}>Early Bird Discount (50%):</span>
              <span style={{color: '#10b981', fontSize: '16px', fontWeight: 600}}>-R200.00</span>
            </div>
            <div style={{borderTop: '2px solid #e5e7eb', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <span style={{color: '#1f2937', fontSize: '16px', fontWeight: 700}}>Total Amount Due:</span>
              <span style={{color: '#7c3aed', fontSize: '28px', fontWeight: 900}}>R200.00</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{display: 'grid', gridTemplateColumns: hasUploadedPOP ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px'}}>
            {!hasUploadedPOP && (
              <a 
                href={`mailto:admin@edudashpro.org.za?subject=Aftercare Payment - ${paymentReference}&body=Hi!%0A%0AI have registered my child ${formData.childFirstName} ${formData.childLastName} for the aftercare program.%0A%0APayment Reference: ${paymentReference}%0AAmount: R200.00%0A%0APlease find my proof of payment attached.%0A%0AThank you!`}
                style={{
                  padding: '14px 20px', 
                  background: '#7c3aed', 
                  color: '#fff', 
                  borderRadius: '10px', 
                  textDecoration: 'none', 
                  fontWeight: 700, 
                  fontSize: '15px',
                  textAlign: 'center',
                  boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <span>📧</span> Email Proof of Payment
              </a>
            )}
            <a 
              href={`https://wa.me/27674770975?text=Hi!%20I%20just%20registered%20${formData.childFirstName}%20${formData.childLastName}%20for%20aftercare.%0A%0AReference:%20${paymentReference}%0A${hasUploadedPOP ? 'I%20have%20uploaded%20my%20proof%20of%20payment.' : 'I%20need%20help%20with%20payment.'}`}
              style={{
                padding: '14px 20px', 
                background: '#25D366', 
                color: '#fff', 
                borderRadius: '10px', 
                textDecoration: 'none', 
                fontWeight: 700, 
                fontSize: '15px',
                textAlign: 'center',
                boxShadow: '0 4px 12px rgba(37, 211, 102, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <span>💬</span> {hasUploadedPOP ? 'Contact Us' : 'Get Help via WhatsApp'}
            </a>
          </div>
          
          {/* Home Button */}
          <div style={{textAlign: 'center'}}>
            <Link 
              href="/" 
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '12px 24px', 
                background: '#fff', 
                color: '#7c3aed', 
                borderRadius: '8px', 
                textDecoration: 'none', 
                fontWeight: 600, 
                fontSize: '14px',
                border: '1px solid #e5e7eb'
              }}
            >
              ← Back to Home
            </Link>
          </div>

          {/* Registration Summary */}
          <div style={{marginTop: '24px', padding: '16px', background: '#f9fafb', borderRadius: '8px', textAlign: 'left'}}>
            <p style={{fontSize: '12px', color: '#9ca3af', marginBottom: '8px'}}>Registration Summary:</p>
            <p style={{fontSize: '13px', color: '#6b7280'}}>
              <strong>Child:</strong> {formData.childFirstName} {formData.childLastName} (Grade {formData.childGrade})<br/>
              <strong>Parent:</strong> {formData.parentFirstName} {formData.parentLastName}<br/>
              <strong>Email:</strong> {formData.parentEmail}<br/>
              <strong>Phone:</strong> {formData.parentPhone}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{minHeight: '100vh', background: '#0a0a0f'}}>
      {/* Header */}
      <header style={{background: 'rgba(10, 10, 15, 0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', padding: '16px 20px'}}>
        <div style={{maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
          <Link href="/" style={{fontSize: '18px', fontWeight: 700, color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px'}}>
            <img src="/icon-192.png" alt="EduDash Pro logo" style={{width: '28px', height: '28px', borderRadius: '8px'}} />
            EduDash Pro
          </Link>
          <Link href="/aftercare" style={{color: '#9CA3AF', fontSize: '14px', textDecoration: 'none'}}>← Back to Program</Link>
        </div>
      </header>

      {/* Hero Banner */}
      <section style={{
        background: 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 50%, #8b5cf6 100%)',
        padding: '48px 20px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{position: 'absolute', top: '20px', left: '10%', fontSize: '24px', opacity: 0.6}}>✨</div>
        <div style={{position: 'absolute', top: '40px', right: '15%', fontSize: '20px', opacity: 0.5}}>⭐</div>
        
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(251, 191, 36, 0.2)',
          border: '2px solid #fbbf24',
          borderRadius: '50px',
          padding: '8px 20px',
          marginBottom: '16px'
        }}>
          <span style={{fontSize: '20px'}}>⚡</span>
          <span style={{color: '#fbbf24', fontWeight: 800, fontSize: '14px', textTransform: 'uppercase'}}>Early Bird Special - 50% OFF</span>
        </div>
        
        <h1 style={{fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 900, color: '#fff', marginBottom: '8px'}}>
          Aftercare Registration
        </h1>
        <p style={{color: 'rgba(255,255,255,0.9)', fontSize: '18px', marginBottom: '16px'}}>
          EduDash Pro Community School • Grade R to Grade 7
        </p>
        
        {/* Spots Remaining Counter */}
        {spotsRemaining !== null && (
          <div style={{
            background: spotsRemaining <= 5 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
            border: `2px solid ${spotsRemaining <= 5 ? '#ef4444' : '#10b981'}`,
            borderRadius: '12px',
            padding: '16px 24px',
            display: 'inline-block',
            marginBottom: '16px'
          }}>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px'}}>
              <span style={{fontSize: '24px'}}>{spotsRemaining <= 5 ? '🔥' : '🎯'}</span>
              <div>
                <p style={{color: '#fff', fontSize: '14px', margin: 0, opacity: 0.9}}>Early Bird Spots Remaining</p>
                <p style={{
                  color: spotsRemaining <= 5 ? '#fca5a5' : '#6ee7b7',
                  fontSize: '32px',
                  fontWeight: 900,
                  margin: 0,
                  lineHeight: 1
                }}>
                  {spotsRemaining} <span style={{fontSize: '16px', fontWeight: 600}}>of {EARLY_BIRD_LIMIT}</span>
                </p>
              </div>
            </div>
            {spotsRemaining <= 5 && spotsRemaining > 0 && (
              <p style={{color: '#fca5a5', fontSize: '12px', margin: '8px 0 0', fontWeight: 600}}>
                ⚠️ Almost sold out! Register now to secure 50% discount
              </p>
            )}
            {spotsRemaining === 0 && (
              <p style={{color: '#fca5a5', fontSize: '12px', margin: '8px 0 0', fontWeight: 600}}>
                Early bird spots filled! Standard rate: R400
              </p>
            )}
          </div>
        )}
        
        <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', flexWrap: 'wrap'}}>
          <div style={{background: 'rgba(255,255,255,0.15)', borderRadius: '8px', padding: '12px 20px', backdropFilter: 'blur(10px)'}}>
            <span style={{color: 'rgba(255,255,255,0.7)', fontSize: '14px', textDecoration: 'line-through'}}>R400.00</span>
            <span style={{color: '#fbbf24', fontSize: '24px', fontWeight: 900, marginLeft: '12px'}}>R200.00</span>
          </div>
        </div>
      </section>

      {/* Registration Form */}
      <section style={{padding: '48px 20px'}}>
        <div style={{maxWidth: '700px', margin: '0 auto'}}>
          {/* Process Overview */}
          <div style={{background: 'rgba(99, 102, 241, 0.1)', border: '2px solid rgba(99, 102, 241, 0.3)', borderRadius: '16px', padding: '24px', marginBottom: '32px'}}>
            <h3 style={{color: '#fff', fontSize: '18px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px'}}>
              <span>ℹ️</span> How Registration Works
            </h3>
            <div style={{display: 'grid', gap: '12px'}}>
              <div style={{display: 'flex', gap: '12px', alignItems: 'flex-start'}}>
                <div style={{width: '24px', height: '24px', borderRadius: '50%', background: '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0}}>1</div>
                <p style={{color: '#d1d5db', fontSize: '14px', margin: 0}}>Fill out and submit the registration form below</p>
              </div>
              <div style={{display: 'flex', gap: '12px', alignItems: 'flex-start'}}>
                <div style={{width: '24px', height: '24px', borderRadius: '50%', background: '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0}}>2</div>
                <p style={{color: '#d1d5db', fontSize: '14px', margin: 0}}>Make EFT payment of R200 using the banking details provided after registration</p>
              </div>
              <div style={{display: 'flex', gap: '12px', alignItems: 'flex-start'}}>
                <div style={{width: '24px', height: '24px', borderRadius: '50%', background: '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0}}>3</div>
                <p style={{color: '#d1d5db', fontSize: '14px', margin: 0}}>Upload proof of payment on the success page (or email it within 48 hours)</p>
              </div>
              <div style={{display: 'flex', gap: '12px', alignItems: 'flex-start'}}>
                <div style={{width: '24px', height: '24px', borderRadius: '50%', background: '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0}}>4</div>
                <p style={{color: '#d1d5db', fontSize: '14px', margin: 0}}>We verify payment and approve your registration (24 hours)</p>
              </div>
              <div style={{display: 'flex', gap: '12px', alignItems: 'flex-start'}}>
                <div style={{width: '24px', height: '24px', borderRadius: '50%', background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0}}>✓</div>
                <p style={{color: '#d1d5db', fontSize: '14px', margin: 0}}>You receive welcome email with login details to access EduDash Pro!</p>
              </div>
            </div>
          </div>
          
          <form onSubmit={handleSubmit}>
            {/* Parent Details */}
            <div style={{background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '24px', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.1)'}}>
              <h2 style={{color: '#fff', fontSize: '18px', fontWeight: 700, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                <span>👤</span> Parent/Guardian Details
              </h2>
              
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px'}}>
                <div>
                  <label style={{display: 'block', color: '#9CA3AF', fontSize: '13px', marginBottom: '6px'}}>First Name *</label>
                  <input
                    type="text"
                    name="parentFirstName"
                    value={formData.parentFirstName}
                    onChange={handleChange}
                    required
                    style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '14px'}}
                  />
                </div>
                <div>
                  <label style={{display: 'block', color: '#9CA3AF', fontSize: '13px', marginBottom: '6px'}}>Last Name *</label>
                  <input
                    type="text"
                    name="parentLastName"
                    value={formData.parentLastName}
                    onChange={handleChange}
                    required
                    style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '14px'}}
                  />
                </div>
                <div>
                  <label style={{display: 'block', color: '#9CA3AF', fontSize: '13px', marginBottom: '6px'}}>Email *</label>
                  <input
                    type="email"
                    name="parentEmail"
                    value={formData.parentEmail}
                    onChange={handleChange}
                    required
                    style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '14px'}}
                  />
                </div>
                <div>
                  <label style={{display: 'block', color: '#9CA3AF', fontSize: '13px', marginBottom: '6px'}}>Phone Number *</label>
                  <input
                    type="tel"
                    name="parentPhone"
                    value={formData.parentPhone}
                    onChange={handleChange}
                    required
                    placeholder="+27..."
                    style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '14px'}}
                  />
                </div>
                <div style={{gridColumn: 'span 2'}}>
                  <label style={{display: 'block', color: '#9CA3AF', fontSize: '13px', marginBottom: '6px'}}>ID Number</label>
                  <input
                    type="text"
                    name="parentIdNumber"
                    value={formData.parentIdNumber}
                    onChange={handleChange}
                    maxLength={13}
                    style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '14px'}}
                  />
                </div>
              </div>
            </div>

            {/* Child Details */}
            <div style={{background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '24px', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.1)'}}>
              <h2 style={{color: '#fff', fontSize: '18px', fontWeight: 700, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                <span>👧</span> Child Details
              </h2>
              
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px'}}>
                <div>
                  <label style={{display: 'block', color: '#9CA3AF', fontSize: '13px', marginBottom: '6px'}}>First Name *</label>
                  <input
                    type="text"
                    name="childFirstName"
                    value={formData.childFirstName}
                    onChange={handleChange}
                    required
                    style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '14px'}}
                  />
                </div>
                <div>
                  <label style={{display: 'block', color: '#9CA3AF', fontSize: '13px', marginBottom: '6px'}}>Last Name *</label>
                  <input
                    type="text"
                    name="childLastName"
                    value={formData.childLastName}
                    onChange={handleChange}
                    required
                    style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '14px'}}
                  />
                </div>
                <div>
                  <label style={{display: 'block', color: '#9CA3AF', fontSize: '13px', marginBottom: '6px'}}>Grade *</label>
                  <select
                    name="childGrade"
                    value={formData.childGrade}
                    onChange={handleChange}
                    required
                    style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(30,30,40,1)', color: '#fff', fontSize: '14px'}}
                  >
                    <option value="R">Grade R</option>
                    <option value="1">Grade 1</option>
                    <option value="2">Grade 2</option>
                    <option value="3">Grade 3</option>
                    <option value="4">Grade 4</option>
                    <option value="5">Grade 5</option>
                    <option value="6">Grade 6</option>
                    <option value="7">Grade 7</option>
                  </select>
                </div>
                <div>
                  <label style={{display: 'block', color: '#9CA3AF', fontSize: '13px', marginBottom: '6px'}}>Date of Birth</label>
                  <input
                    type="date"
                    name="childDateOfBirth"
                    value={formData.childDateOfBirth}
                    onChange={handleChange}
                    style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(30,30,40,1)', color: '#fff', fontSize: '14px'}}
                  />
                </div>
                <div style={{gridColumn: 'span 2'}}>
                  <label style={{display: 'block', color: '#9CA3AF', fontSize: '13px', marginBottom: '6px'}}>Allergies (if any)</label>
                  <input
                    type="text"
                    name="childAllergies"
                    value={formData.childAllergies}
                    onChange={handleChange}
                    placeholder="e.g., Peanuts, Dairy"
                    style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '14px'}}
                  />
                </div>
                <div style={{gridColumn: 'span 2'}}>
                  <label style={{display: 'block', color: '#9CA3AF', fontSize: '13px', marginBottom: '6px'}}>Medical Conditions (if any)</label>
                  <textarea
                    name="childMedicalConditions"
                    value={formData.childMedicalConditions}
                    onChange={handleChange}
                    rows={2}
                    placeholder="Any medical conditions we should be aware of"
                    style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '14px', resize: 'vertical'}}
                  />
                </div>
              </div>
            </div>

            {/* Emergency Contact */}
            <div style={{background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '24px', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.1)'}}>
              <h2 style={{color: '#fff', fontSize: '18px', fontWeight: 700, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                <span>🚨</span> Emergency Contact
              </h2>
              
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px'}}>
                <div>
                  <label style={{display: 'block', color: '#9CA3AF', fontSize: '13px', marginBottom: '6px'}}>Contact Name *</label>
                  <input
                    type="text"
                    name="emergencyContactName"
                    value={formData.emergencyContactName}
                    onChange={handleChange}
                    required
                    style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '14px'}}
                  />
                </div>
                <div>
                  <label style={{display: 'block', color: '#9CA3AF', fontSize: '13px', marginBottom: '6px'}}>Phone Number *</label>
                  <input
                    type="tel"
                    name="emergencyContactPhone"
                    value={formData.emergencyContactPhone}
                    onChange={handleChange}
                    required
                    style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '14px'}}
                  />
                </div>
                <div style={{gridColumn: 'span 2'}}>
                  <label style={{display: 'block', color: '#9CA3AF', fontSize: '13px', marginBottom: '6px'}}>Relationship to Child *</label>
                  <input
                    type="text"
                    name="emergencyContactRelation"
                    value={formData.emergencyContactRelation}
                    onChange={handleChange}
                    required
                    placeholder="e.g., Grandmother, Uncle, Family Friend"
                    style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '14px'}}
                  />
                </div>
              </div>
            </div>


            {/* How did you hear */}
            <div style={{background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '24px', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.1)'}}>
              <label style={{display: 'block', color: '#9CA3AF', fontSize: '13px', marginBottom: '6px'}}>How did you hear about us?</label>
              <select
                name="howDidYouHear"
                value={formData.howDidYouHear}
                onChange={handleChange}
                style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(30,30,40,1)', color: '#fff', fontSize: '14px'}}
              >
                <option value="">Select an option</option>
                <option value="facebook">Facebook</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="friend">Friend/Family</option>
                <option value="school">School</option>
                <option value="google">Google Search</option>
                <option value="flyer">Flyer/Poster</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Terms */}
            <div style={{marginBottom: '24px'}}>
              <label style={{display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer'}}>
                <input
                  type="checkbox"
                  name="acceptTerms"
                  checked={formData.acceptTerms}
                  onChange={handleChange}
                  required
                  style={{marginTop: '4px', width: '20px', height: '20px', accentColor: '#7c3aed'}}
                />
                <span style={{color: '#9CA3AF', fontSize: '14px', lineHeight: 1.5}}>
                  I agree to the <Link href="/terms" style={{color: '#7c3aed'}}>Terms of Service</Link> and <Link href="/privacy" style={{color: '#7c3aed'}}>Privacy Policy</Link>. I understand that the registration fee of R200.00 is payable to complete enrollment.
                </span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || !formData.acceptTerms}
              style={{
                width: '100%',
                padding: '16px',
                background: formData.acceptTerms ? 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)' : '#374151',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: 700,
                cursor: formData.acceptTerms ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
                boxShadow: formData.acceptTerms ? '0 4px 20px rgba(124, 58, 237, 0.4)' : 'none'
              }}
            >
              {isSubmitting ? 'Submitting...' : 'Complete Registration →'}
            </button>

            {error && (
              <p style={{color: '#ef4444', fontSize: '14px', marginTop: '16px', textAlign: 'center'}}>{error}</p>
            )}
          </form>

          {/* Contact Info */}
          <div style={{marginTop: '32px', textAlign: 'center', padding: '24px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)'}}>
            <p style={{color: '#9CA3AF', fontSize: '14px', marginBottom: '16px'}}>Need help? Contact us:</p>
            <div style={{display: 'flex', justifyContent: 'center', gap: '24px', flexWrap: 'wrap'}}>
              <a href="mailto:info@edudashpro.org.za" style={{color: '#7c3aed', fontSize: '14px', textDecoration: 'none'}}>📧 info@edudashpro.org.za</a>
              <a href="tel:+27674770975" style={{color: '#7c3aed', fontSize: '14px', textDecoration: 'none'}}>📞 +27 67 477 0975</a>
              <a href="https://wa.me/27815236000" style={{color: '#25D366', fontSize: '14px', textDecoration: 'none'}}>💬 WhatsApp</a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
