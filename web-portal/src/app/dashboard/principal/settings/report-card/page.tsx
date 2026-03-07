'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { ArrowLeft, School, MapPin, Phone, Mail, Image as ImageIcon, Save, Eye } from 'lucide-react';

export default function ReportCardSettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);

  const [formData, setFormData] = useState({
    school_name: '',
    school_logo_url: '',
    school_address: '',
    school_phone: '',
    school_email: '',
    school_website: '',
    principal_name: '',
    principal_signature_url: '',
    report_card_header: '',
    report_card_footer: '',
    show_logo: true,
    show_address: true,
    show_contact: true,
    show_principal_signature: true,
  });

  const { profile } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const preschoolName = profile?.preschoolName;
  const preschoolId = profile?.preschoolId || profile?.organizationId;

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setUserId(session.user.id);
    };
    initAuth();
  }, [router, supabase]);

  useEffect(() => {
    if (!preschoolId) return;

    const loadSettings = async () => {
      try {
        const { data: preschool } = await supabase
          .from('preschools')
          .select('*')
          .eq('id', preschoolId)
          .single();

        if (preschool) {
          setFormData({
            school_name: preschool.name || '',
            school_logo_url: preschool.logo_url || '',
            school_address: preschool.address || preschool.physical_address || '',
            school_phone: preschool.phone || preschool.contact_phone || '',
            school_email: preschool.email || preschool.contact_email || '',
            school_website: preschool.website_url || '',
            principal_name: profile?.firstName && profile?.lastName 
              ? `${profile.firstName} ${profile.lastName}` 
              : '',
            principal_signature_url: '',
            report_card_header: preschool.settings?.report_card_header || 'Student Progress Report',
            report_card_footer: preschool.settings?.report_card_footer || 'This report is confidential and should be discussed with parents/guardians.',
            show_logo: preschool.settings?.show_logo !== false,
            show_address: preschool.settings?.show_address !== false,
            show_contact: preschool.settings?.show_contact !== false,
            show_principal_signature: preschool.settings?.show_principal_signature !== false,
          });
        }
      } catch (err) {
        console.error('Error loading settings:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [preschoolId, profile, supabase]);

  const handleFileUpload = async (file: File, type: 'logo' | 'signature') => {
    if (!preschoolId) return;

    const setUploading = type === 'logo' ? setUploadingLogo : setUploadingSignature;
    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${type}_${preschoolId}_${Date.now()}.${fileExt}`;
      const filePath = `${preschoolId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('school-assets')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('school-assets')
        .getPublicUrl(filePath);

      if (type === 'logo') {
        setFormData({ ...formData, school_logo_url: publicUrl });
      } else {
        setFormData({ ...formData, principal_signature_url: publicUrl });
      }

      alert(`✅ ${type === 'logo' ? 'Logo' : 'Signature'} uploaded successfully!`);
    } catch (err: any) {
      console.error('Upload error:', err);
      alert(`Error uploading ${type}: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!preschoolId) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('preschools')
        .update({
          name: formData.school_name,
          logo_url: formData.school_logo_url,
          address: formData.school_address,
          physical_address: formData.school_address,
          phone: formData.school_phone,
          contact_phone: formData.school_phone,
          email: formData.school_email,
          contact_email: formData.school_email,
          website_url: formData.school_website,
          settings: {
            report_card_header: formData.report_card_header,
            report_card_footer: formData.report_card_footer,
            principal_name: formData.principal_name,
            principal_signature_url: formData.principal_signature_url,
            show_logo: formData.show_logo,
            show_address: formData.show_address,
            show_contact: formData.show_contact,
            show_principal_signature: formData.show_principal_signature,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', preschoolId);

      if (error) throw error;

      alert('✅ Report card settings saved successfully!');
    } catch (err: any) {
      console.error('Error saving:', err);
      alert(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PrincipalShell 
        tenantSlug={tenantSlug} 
        preschoolName={preschoolName} 
        preschoolId={preschoolId}
        hideRightSidebar={true}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-slate-400">Loading settings...</p>
        </div>
      </PrincipalShell>
    );
  }

  return (
    <PrincipalShell 
      tenantSlug={tenantSlug} 
      preschoolName={preschoolName} 
      preschoolId={preschoolId}
      hideRightSidebar={true}
    >
      <div className="section">
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: 32 }}>
            <button
              onClick={() => router.back()}
              className="btn btnSecondary"
              style={{ marginBottom: 16, display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <ArrowLeft size={16} />
              Back to Settings
            </button>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'between', gap: 16, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <h1 className="h1" style={{ marginBottom: 4 }}>Report Card Configuration</h1>
                <p className="subtitle">Customize how your school's report cards appear</p>
              </div>
              <button
                onClick={() => setPreviewOpen(true)}
                className="btn btnSecondary"
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <Eye size={18} />
                Preview
              </button>
            </div>
          </div>

          {/* School Information */}
          <div className="card" style={{ marginBottom: 24 }}>
            <h2 className="h2" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <School size={20} />
              School Information
            </h2>
            
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
              <div>
                <label className="label">School Name *</label>
                <input
                  type="text"
                  className="input"
                  value={formData.school_name}
                  onChange={(e) => setFormData({ ...formData, school_name: e.target.value })}
                  placeholder="Young Eagles Preschool"
                  style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--foreground)' }}
                />
              </div>

              <div>
                <label className="label">Principal Name</label>
                <input
                  type="text"
                  className="input"
                  value={formData.principal_name}
                  onChange={(e) => setFormData({ ...formData, principal_name: e.target.value })}
                  placeholder="Mr./Mrs. Principal Name"
                  style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--foreground)' }}
                />
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ImageIcon size={16} />
                School Logo
              </label>
              <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, 'logo');
                  }}
                  style={{ display: 'none' }}
                  id="logo-upload"
                />
                <label 
                  htmlFor="logo-upload" 
                  className="btn btnPrimary"
                  style={{ 
                    cursor: uploadingLogo ? 'not-allowed' : 'pointer',
                    opacity: uploadingLogo ? 0.6 : 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  <ImageIcon size={16} />
                  {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                </label>
                <span style={{ color: 'var(--muted)', fontSize: 14, alignSelf: 'center' }}>or enter URL below</span>
              </div>
              <input
                type="text"
                className="input"
                value={formData.school_logo_url}
                onChange={(e) => setFormData({ ...formData, school_logo_url: e.target.value })}
                placeholder="https://example.com/logo.png"
                style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--foreground)' }}
              />
              {formData.school_logo_url && (
                <div style={{ marginTop: 8, padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card-hover)' }}>
                  <img 
                    src={formData.school_logo_url} 
                    alt="School logo preview" 
                    style={{ maxHeight: 60, objectFit: 'contain' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Contact Information */}
          <div className="card" style={{ marginBottom: 24 }}>
            <h2 className="h2" style={{ marginBottom: 16 }}>Contact Information</h2>
            
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MapPin size={16} />
                  School Address
                </label>
                <textarea
                  className="input"
                  value={formData.school_address}
                  onChange={(e) => setFormData({ ...formData, school_address: e.target.value })}
                  placeholder="123 Education Street, City, Province, 0000"
                  rows={2}
                  style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--foreground)', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <div>
                  <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Phone size={16} />
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    className="input"
                    value={formData.school_phone}
                    onChange={(e) => setFormData({ ...formData, school_phone: e.target.value })}
                    placeholder="+27 12 345 6789"
                    style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--foreground)' }}
                  />
                </div>

                <div>
                  <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Mail size={16} />
                    Email Address
                  </label>
                  <input
                    type="email"
                    className="input"
                    value={formData.school_email}
                    onChange={(e) => setFormData({ ...formData, school_email: e.target.value })}
                    placeholder="info@school.com"
                    style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--foreground)' }}
                  />
                </div>

                <div>
                  <label className="label">Website (Optional)</label>
                  <input
                    type="url"
                    className="input"
                    value={formData.school_website}
                    onChange={(e) => setFormData({ ...formData, school_website: e.target.value })}
                    placeholder="www.school.com"
                    style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--foreground)' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Report Card Customization */}
          <div className="card" style={{ marginBottom: 24 }}>
            <h2 className="h2" style={{ marginBottom: 16 }}>Report Card Customization</h2>
            
            <div style={{ marginBottom: 16 }}>
              <label className="label">Report Header Text</label>
              <input
                type="text"
                className="input"
                value={formData.report_card_header}
                onChange={(e) => setFormData({ ...formData, report_card_header: e.target.value })}
                placeholder="Student Progress Report"
                style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--foreground)' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="label">Report Footer Text</label>
              <textarea
                className="input"
                value={formData.report_card_footer}
                onChange={(e) => setFormData({ ...formData, report_card_footer: e.target.value })}
                placeholder="This report is confidential..."
                rows={2}
                style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--foreground)', resize: 'vertical' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="label">Principal Signature</label>
              <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, 'signature');
                  }}
                  style={{ display: 'none' }}
                  id="signature-upload"
                />
                <label 
                  htmlFor="signature-upload" 
                  className="btn btnSecondary"
                  style={{ 
                    cursor: uploadingSignature ? 'not-allowed' : 'pointer',
                    opacity: uploadingSignature ? 0.6 : 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  <ImageIcon size={16} />
                  {uploadingSignature ? 'Uploading...' : 'Upload Signature'}
                </label>
                <span style={{ color: 'var(--muted)', fontSize: 14, alignSelf: 'center' }}>or enter URL below</span>
              </div>
              <input
                type="text"
                className="input"
                value={formData.principal_signature_url}
                onChange={(e) => setFormData({ ...formData, principal_signature_url: e.target.value })}
                placeholder="https://example.com/signature.png"
                style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--foreground)' }}
              />
              {formData.principal_signature_url && (
                <div style={{ marginTop: 8, padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card-hover)' }}>
                  <img 
                    src={formData.principal_signature_url} 
                    alt="Signature preview" 
                    style={{ maxHeight: 50, objectFit: 'contain' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}
            </div>

            <div style={{ 
              padding: 16, 
              background: 'var(--muted)', 
              borderRadius: 8,
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))'
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.show_logo}
                  onChange={(e) => setFormData({ ...formData, show_logo: e.target.checked })}
                  style={{ width: 18, height: 18 }}
                />
                <span style={{ fontSize: 14 }}>Show School Logo</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.show_address}
                  onChange={(e) => setFormData({ ...formData, show_address: e.target.checked })}
                  style={{ width: 18, height: 18 }}
                />
                <span style={{ fontSize: 14 }}>Show Address</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.show_contact}
                  onChange={(e) => setFormData({ ...formData, show_contact: e.target.checked })}
                  style={{ width: 18, height: 18 }}
                />
                <span style={{ fontSize: 14 }}>Show Contact Info</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.show_principal_signature}
                  onChange={(e) => setFormData({ ...formData, show_principal_signature: e.target.checked })}
                  style={{ width: 18, height: 18 }}
                />
                <span style={{ fontSize: 14 }}>Show Principal Signature</span>
              </label>
            </div>
          </div>

          {/* Save Button */}
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => router.back()}
              className="btn btnSecondary"
              style={{ flex: 1 }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="btn btnPrimary"
              disabled={saving}
              style={{ flex: 1 }}
            >
              <Save size={18} style={{ marginRight: 8 }} />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {previewOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}
          onClick={() => setPreviewOpen(false)}
        >
          <div
            style={{
              background: 'white',
              padding: 40,
              borderRadius: 8,
              maxWidth: 800,
              maxHeight: '90vh',
              overflow: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: 30 }}>
              {formData.show_logo && formData.school_logo_url && (
                <img 
                  src={formData.school_logo_url} 
                  alt="School logo" 
                  style={{ maxHeight: 80, marginBottom: 16 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <h1 style={{ color: '#1f2937', marginBottom: 8 }}>{formData.school_name}</h1>
              {formData.show_address && formData.school_address && (
                <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 4 }}>{formData.school_address}</p>
              )}
              {formData.show_contact && (
                <p style={{ color: '#6b7280', fontSize: 14 }}>
                  {formData.school_phone && `Tel: ${formData.school_phone}`}
                  {formData.school_phone && formData.school_email && ' | '}
                  {formData.school_email && `Email: ${formData.school_email}`}
                </p>
              )}
            </div>

            <h2 style={{ 
              color: '#1f2937', 
              fontSize: 24, 
              fontWeight: 600, 
              textAlign: 'center',
              borderBottom: '2px solid #3b82f6',
              paddingBottom: 12,
              marginBottom: 30
            }}>
              {formData.report_card_header}
            </h2>

            <div style={{ marginBottom: 30, padding: 20, background: '#f9fafb', borderRadius: 8 }}>
              <p style={{ color: '#374151', textAlign: 'center', fontStyle: 'italic' }}>
                [Report content would appear here]
              </p>
            </div>

            {formData.show_principal_signature && formData.principal_name && (
              <div style={{ marginTop: 40, textAlign: 'right' }}>
                {formData.principal_signature_url && (
                  <img 
                    src={formData.principal_signature_url} 
                    alt="Signature" 
                    style={{ maxHeight: 50, marginBottom: 8 }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <p style={{ fontWeight: 600, color: '#1f2937', marginBottom: 4 }}>{formData.principal_name}</p>
                <p style={{ color: '#6b7280', fontSize: 14 }}>Principal</p>
              </div>
            )}

            {formData.report_card_footer && (
              <p style={{ 
                color: '#6b7280', 
                fontSize: 12, 
                textAlign: 'center', 
                marginTop: 30,
                paddingTop: 20,
                borderTop: '1px solid #e5e7eb'
              }}>
                {formData.report_card_footer}
              </p>
            )}

            <button
              onClick={() => setPreviewOpen(false)}
              className="btn btnPrimary"
              style={{ width: '100%', marginTop: 20 }}
            >
              Close Preview
            </button>
          </div>
        </div>
      )}
    </PrincipalShell>
  );
}
