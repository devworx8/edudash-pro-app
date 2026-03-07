'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { ArrowLeft, Save, User } from 'lucide-react';

interface StudentDetail {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  gender: string | null;
  medical_info: string | null;
  allergies: string | null;
  status: string;
  enrollment_date: string | null;
  guardian_id: string | null;
  class_id: string | null;
  preschool_id: string;
}

export default function EditStudentPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    gender: '',
    medical_info: '',
    allergies: '',
    status: 'active',
    class_id: '',
  });
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);

  const { profile } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const preschoolName = profile?.preschoolName;
  const preschoolId = profile?.preschoolId || profile?.organizationId;

  const studentId = params.id as string;

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

  // Load student and classes
  useEffect(() => {
    if (!preschoolId || !studentId) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // Load student
        const { data: studentData, error: studentError } = await supabase
          .from('students')
          .select('*')
          .eq('id', studentId)
          .eq('preschool_id', preschoolId)
          .single();

        if (studentError || !studentData) {
          console.error('Error loading student:', studentError);
          return;
        }

        setStudent(studentData);
        setFormData({
          first_name: studentData.first_name || '',
          last_name: studentData.last_name || '',
          date_of_birth: studentData.date_of_birth || '',
          gender: studentData.gender || '',
          medical_info: studentData.medical_info || '',
          allergies: studentData.allergies || '',
          status: studentData.status || 'active',
          class_id: studentData.class_id || '',
        });

        // Load classes
        const { data: classesData } = await supabase
          .from('classes')
          .select('id, name')
          .eq('preschool_id', preschoolId)
          .order('name');

        if (classesData) {
          setClasses(classesData);
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [preschoolId, studentId, supabase]);

  const handleSave = async () => {
    if (!student) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('students')
        .update({
          first_name: formData.first_name,
          last_name: formData.last_name,
          date_of_birth: formData.date_of_birth || null,
          gender: formData.gender || null,
          medical_info: formData.medical_info || null,
          allergies: formData.allergies || null,
          status: formData.status,
          class_id: formData.class_id || null,
        })
        .eq('id', student.id);

      if (error) {
        alert('Error saving student: ' + error.message);
        return;
      }

      // Update class assignment if class changed
      if (formData.class_id && formData.class_id !== student.class_id) {
        // Remove old assignment
        if (student.class_id) {
          await supabase
            .from('class_assignments')
            .delete()
            .eq('student_id', student.id)
            .eq('class_id', student.class_id);
        }

        // Add new assignment
        await supabase
          .from('class_assignments')
          .insert({
            student_id: student.id,
            class_id: formData.class_id,
            assigned_date: new Date().toISOString().split('T')[0],
            start_date: new Date().toISOString().split('T')[0],
            status: 'active',
          });
      }

      router.push(`/dashboard/principal/students/${student.id}`);
    } catch (error) {
      console.error('Error saving student:', error);
      alert('An error occurred while saving');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={preschoolId} hideRightSidebar={true}>
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-slate-400">Loading...</p>
        </div>
      </PrincipalShell>
    );
  }

  if (!student) {
    return (
      <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={preschoolId} hideRightSidebar={true}>
        <div className="section">
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <h3 style={{ marginBottom: 8 }}>Student not found</h3>
            <button 
              className="btn btnPrimary"
              onClick={() => router.push('/dashboard/principal/students')}
            >
              <ArrowLeft size={18} style={{ marginRight: 8 }} />
              Back to Students
            </button>
          </div>
        </div>
      </PrincipalShell>
    );
  }

  return (
    <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={preschoolId} hideRightSidebar={true}>
      <div className="section">
        <button 
          className="btn btnSecondary"
          onClick={() => router.push(`/dashboard/principal/students/${student.id}`)}
          style={{ marginBottom: 16 }}
        >
          <ArrowLeft size={18} style={{ marginRight: 8 }} />
          Back to Student
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div 
            style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 600,
              fontSize: 24,
            }}
          >
            <User size={32} />
          </div>
          <div>
            <h1 className="h1" style={{ marginBottom: 0 }}>Edit Student</h1>
            <p style={{ color: 'var(--muted)', marginTop: 4 }}>
              {student.first_name} {student.last_name}
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 24, maxWidth: 800 }}>
          {/* Personal Information */}
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>Personal Information</h3>
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 14,
                    }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
                    Last Name *
                  </label>
                  <input
                    type="text"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 14,
                    }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={formData.date_of_birth}
                    onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 14,
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
                    Gender
                  </label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 14,
                    }}
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Class Assignment */}
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>Class Assignment</h3>
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
                Assigned Class
              </label>
              <select
                value={formData.class_id}
                onChange={(e) => setFormData({ ...formData, class_id: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 14,
                }}
              >
                <option value="">No class assigned</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Medical Information */}
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>Medical Information</h3>
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
                  Allergies
                </label>
                <input
                  type="text"
                  value={formData.allergies}
                  onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                  placeholder="e.g., Peanuts, Dairy, Penicillin"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 14,
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
                  Medical Notes
                </label>
                <textarea
                  value={formData.medical_info}
                  onChange={(e) => setFormData({ ...formData, medical_info: e.target.value })}
                  placeholder="Any medical conditions, medications, or special requirements"
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 14,
                    resize: 'vertical',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>Status</h3>
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
                Student Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 14,
                }}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button 
              className="btn btnSecondary"
              onClick={() => router.push(`/dashboard/principal/students/${student.id}`)}
              disabled={saving}
            >
              Cancel
            </button>
            <button 
              className="btn btnPrimary"
              onClick={handleSave}
              disabled={saving || !formData.first_name || !formData.last_name}
            >
              <Save size={18} style={{ marginRight: 8 }} />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </PrincipalShell>
  );
}
