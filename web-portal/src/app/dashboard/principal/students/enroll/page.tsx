'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { ArrowLeft, UserPlus } from 'lucide-react';

interface Class {
  id: string;
  name: string;
  grade_level: string;
  current_students: number;
  max_students: number;
}

interface Parent {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
}

export default function EnrollStudentPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [preschoolId, setPreschoolId] = useState<string>('');
  const [organizationId, setOrganizationId] = useState<string>('');
  
  const [classes, setClasses] = useState<Class[]>([]);
  const [searchedParents, setSearchedParents] = useState<Parent[]>([]);
  const [searchingParents, setSearchingParents] = useState(false);
  
  const currentYear = new Date().getFullYear();
  
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    gender: '',
    id_number: '',
    class_id: '',
    status: 'active',
    enrollment_date: new Date().toISOString().split('T')[0],
    academic_year: currentYear.toString(),
    home_address: '',
    home_phone: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
    medical_conditions: '',
    allergies: '',
    medication: '',
    parent_search: '',
    selected_parent_id: '',
  });

  const { profile } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const preschoolName = profile?.preschoolName;

  // Auth check
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

  // Load principal's preschool info and classes
  useEffect(() => {
    if (!userId) return;
    
    const loadData = async () => {
      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('organization_id, preschool_id')
          .eq('id', userId)
          .single();

        if (profileData) {
          setOrganizationId(profileData.organization_id);
          setPreschoolId(profileData.preschool_id);

          const { data: classesData } = await supabase
            .from('classes')
            .select('id, name, grade_level, current_students, max_students')
            .eq('preschool_id', profileData.preschool_id)
            .eq('active', true)
            .order('grade_level');

          if (classesData) {
            setClasses(classesData);
          }
        }
      } catch (err) {
        console.error('Error loading data:', err);
        setError('Failed to load school data');
      }
    };

    loadData();
  }, [userId, supabase]);

  // Search for existing parents
  const searchParents = async () => {
    if (!formData.parent_search.trim()) {
      setSearchedParents([]);
      return;
    }

    setSearchingParents(true);
    try {
      const searchTerm = formData.parent_search.toLowerCase();
      
      const { data, error: searchError } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, phone')
        .eq('role', 'parent')
        .eq('organization_id', organizationId)
        .or(`email.ilike.%${searchTerm}%,first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%`)
        .limit(10);

      if (searchError) throw searchError;
      setSearchedParents(data || []);
    } catch (err) {
      console.error('Error searching parents:', err);
    } finally {
      setSearchingParents(false);
    }
  };

  // Generate student ID
  const generateStudentId = async (): Promise<string> => {
    try {
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', organizationId)
        .single();

      // Use first 2-3 letters of org name as code
      const orgCode = org?.name?.substring(0, 3).toUpperCase() || 'STU';
      const year = formData.academic_year.slice(-2);

      const { count } = await supabase
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('preschool_id', preschoolId);

      const nextNum = ((count || 0) + 1).toString().padStart(4, '0');
      return `${orgCode}-${year}-${nextNum}`;
    } catch (err) {
      console.error('Error generating student ID:', err);
      return `STU-${formData.academic_year.slice(-2)}-${Date.now().toString().slice(-4)}`;
    }
  };

  // Submit enrollment
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!formData.first_name || !formData.last_name || !formData.date_of_birth) {
        throw new Error('Please fill in all required fields');
      }

      if (!formData.class_id) {
        throw new Error('Please select a class');
      }

      const studentIdCode = await generateStudentId();

      const { data: student, error: studentError } = await supabase
        .from('students')
        .insert({
          student_id: studentIdCode,
          organization_id: organizationId,
          preschool_id: preschoolId,
          class_id: formData.class_id,
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          date_of_birth: formData.date_of_birth,
          gender: formData.gender || null,
          id_number: formData.id_number || null,
          status: formData.status,
          enrollment_date: formData.enrollment_date,
          academic_year: formData.academic_year,
          home_address: formData.home_address || null,
          home_phone: formData.home_phone || null,
          emergency_contact_name: formData.emergency_contact_name || null,
          emergency_contact_phone: formData.emergency_contact_phone || null,
          emergency_contact_relation: formData.emergency_contact_relationship || null,
          medical_conditions: formData.medical_conditions || null,
          allergies: formData.allergies || null,
          medication: formData.medication || null,
          guardian_id: formData.selected_parent_id || null,
          parent_id: formData.selected_parent_id || null,
        })
        .select()
        .single();

      if (studentError) throw studentError;

      if (formData.selected_parent_id) {
        const { error: linkError } = await supabase
          .from('student_guardians')
          .insert({
            student_id: student.id,
            guardian_id: formData.selected_parent_id,
            relationship: 'parent',
            primary_contact: true,
            can_pickup: true,
            financial_responsibility: true,
          });

        if (linkError) console.error('Error linking parent:', linkError);
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/dashboard/principal/students');
      }, 2000);

    } catch (err: any) {
      console.error('Enrollment error:', err);
      setError(err.message || 'Failed to enroll student');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={preschoolId} hideRightSidebar={true}>
      <div className="section" style={{ maxWidth: 1000, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <button
            className="btn btnGhost"
            onClick={() => router.back()}
            style={{ marginBottom: 16 }}
          >
            <ArrowLeft size={18} style={{ marginRight: 8 }} />
            Back to Students
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <UserPlus size={32} style={{ color: 'var(--primary)' }} />
            <div>
              <h1 className="h1" style={{ marginBottom: 4 }}>Enroll New Student</h1>
              <p style={{ fontSize: 14, color: 'var(--muted)' }}>Add a student directly without registration form</p>
            </div>
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="card" style={{ marginBottom: 24, padding: 16, backgroundColor: '#fee', borderColor: '#f88' }}>
            <p style={{ color: '#c00', margin: 0 }}>{error}</p>
          </div>
        )}
        
        {success && (
          <div className="card" style={{ marginBottom: 24, padding: 16, backgroundColor: '#efe', borderColor: '#8f8' }}>
            <p style={{ color: '#0a0', margin: 0 }}>✅ Student enrolled successfully! Redirecting...</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="card">
          {/* Student Information */}
          <div style={{ padding: 24, borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Student Information</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>First Name *</label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  required
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, backgroundColor: 'var(--input-bg)', color: 'var(--foreground)' }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Last Name *</label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  required
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, backgroundColor: 'var(--input-bg)', color: 'var(--foreground)' }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Date of Birth *</label>
                <input
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                  required
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, backgroundColor: 'var(--input-bg)', color: 'var(--foreground)', colorScheme: 'dark' }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Gender</label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, backgroundColor: 'var(--input-bg)', color: 'var(--foreground)' }}
                >
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>ID Number</label>
                <input
                  type="text"
                  value={formData.id_number}
                  onChange={(e) => setFormData({ ...formData, id_number: e.target.value })}
                  placeholder="Optional"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, backgroundColor: 'var(--input-bg)', color: 'var(--foreground)' }}
                />
              </div>
            </div>
          </div>

          {/* Academic Information */}
          <div style={{ padding: 24, borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Academic Details</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Class *</label>
                <select
                  value={formData.class_id}
                  onChange={(e) => setFormData({ ...formData, class_id: e.target.value })}
                  required
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, backgroundColor: 'var(--input-bg)', color: 'var(--foreground)' }}
                >
                  <option value="">Select a class</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} ({cls.current_students}/{cls.max_students} students)
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, backgroundColor: 'var(--input-bg)', color: 'var(--foreground)' }}
                >
                  <option value="registered">Registered</option>
                  <option value="active">Active</option>
                  <option value="enrolled">Enrolled</option>
                </select>
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Enrollment Date</label>
                <input
                  type="date"
                  value={formData.enrollment_date}
                  onChange={(e) => setFormData({ ...formData, enrollment_date: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, backgroundColor: 'var(--input-bg)', color: 'var(--foreground)', colorScheme: 'dark' }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Academic Year</label>
                <input
                  type="text"
                  value={formData.academic_year}
                  onChange={(e) => setFormData({ ...formData, academic_year: e.target.value })}
                  placeholder={currentYear.toString()}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, backgroundColor: 'var(--input-bg)', color: 'var(--foreground)' }}
                />
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div style={{ padding: 24, borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Contact & Emergency</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Home Address</label>
                <input
                  type="text"
                  value={formData.home_address}
                  onChange={(e) => setFormData({ ...formData, home_address: e.target.value })}
                  placeholder="Optional"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, backgroundColor: 'var(--input-bg)', color: 'var(--foreground)' }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Home Phone</label>
                <input
                  type="tel"
                  value={formData.home_phone}
                  onChange={(e) => setFormData({ ...formData, home_phone: e.target.value })}
                  placeholder="Optional"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, backgroundColor: 'var(--input-bg)', color: 'var(--foreground)' }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Emergency Contact Name</label>
                <input
                  type="text"
                  value={formData.emergency_contact_name}
                  onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                  placeholder="Optional"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, backgroundColor: 'var(--input-bg)', color: 'var(--foreground)' }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Emergency Contact Phone</label>
                <input
                  type="tel"
                  value={formData.emergency_contact_phone}
                  onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
                  placeholder="Optional"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, backgroundColor: 'var(--input-bg)', color: 'var(--foreground)' }}
                />
              </div>
            </div>
          </div>

          {/* Medical Information */}
          <div style={{ padding: 24, borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Medical Information (Optional)</h2>
            
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Medical Conditions</label>
                <textarea
                  value={formData.medical_conditions}
                  onChange={(e) => setFormData({ ...formData, medical_conditions: e.target.value })}
                  rows={2}
                  placeholder="Any medical conditions to be aware of..."
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', backgroundColor: 'var(--input-bg)', color: 'var(--foreground)' }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Allergies</label>
                <textarea
                  value={formData.allergies}
                  onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                  rows={2}
                  placeholder="Food allergies, medication allergies, etc."
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', backgroundColor: 'var(--input-bg)', color: 'var(--foreground)' }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Current Medication</label>
                <textarea
                  value={formData.medication}
                  onChange={(e) => setFormData({ ...formData, medication: e.target.value })}
                  rows={2}
                  placeholder="Any regular medication..."
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', backgroundColor: 'var(--input-bg)', color: 'var(--foreground)' }}
                />
              </div>
            </div>
          </div>

          {/* Parent Linking */}
          <div style={{ padding: 24, borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Parent/Guardian (Optional)</h2>
            <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 16 }}>
              Search for an existing parent or skip to add later
            </p>
            
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={formData.parent_search}
                onChange={(e) => {
                  setFormData({ ...formData, parent_search: e.target.value });
                  searchParents();
                }}
                placeholder="Start typing parent's email or name..."
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, backgroundColor: 'var(--input-bg)', color: 'var(--foreground)' }}
              />
              
              {searchingParents && (
                <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>Searching...</p>
              )}
              
              {searchedParents.length > 0 && (
                <div style={{ marginTop: 8, border: '1px solid var(--border)', borderRadius: 8, maxHeight: 200, overflowY: 'auto' }}>
                  {searchedParents.map((parent) => (
                    <button
                      key={parent.id}
                      type="button"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          selected_parent_id: parent.id,
                          parent_search: `${parent.first_name} ${parent.last_name} (${parent.email})`,
                        });
                        setSearchedParents([]);
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: 12,
                        borderBottom: '1px solid var(--border)',
                        background: 'transparent',
                        cursor: 'pointer',
                      }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <div style={{ fontWeight: 500 }}>{parent.first_name} {parent.last_name}</div>
                      <div style={{ fontSize: 13, color: 'var(--muted)' }}>{parent.email}</div>
                      {parent.phone && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{parent.phone}</div>}
                    </button>
                  ))}
                </div>
              )}
              
              {formData.selected_parent_id && (
                <div style={{ marginTop: 8, padding: 12, backgroundColor: '#e3f2fd', borderRadius: 8 }}>
                  <p style={{ fontSize: 14, color: '#1976d2', margin: 0 }}>
                    ✓ Parent selected. Student will be linked after enrollment.
                  </p>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, selected_parent_id: '', parent_search: '' })}
                    style={{ fontSize: 13, color: '#1976d2', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4 }}
                  >
                    Clear selection
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div style={{ padding: 24, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btnSecondary"
              onClick={() => router.back()}
              disabled={loading}
            >
              Cancel
            </button>
            
            <button
              type="submit"
              className="btn btnPrimary"
              disabled={loading}
              style={{ minWidth: 140 }}
            >
              {loading ? 'Enrolling...' : 'Enroll Student'}
            </button>
          </div>
        </form>
      </div>
    </PrincipalShell>
  );
}
