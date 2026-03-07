'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TertiaryShell } from '@/components/dashboard/tertiary/TertiaryShell';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, BookOpen } from 'lucide-react';
import Link from 'next/link';

export default function NewCoursePage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [organizationName, setOrganizationName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    duration_weeks: 8,
    credits: 10,
    prerequisites: '',
    learning_outcomes: '',
    status: 'draft' as 'draft' | 'active',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    initAuth();
  }, []);

  async function initAuth() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push('/sign-in');
        return;
      }

      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, role, organization_id')
        .eq('id', session.user.id)
        .single();

      if (error) {
        console.error('Error loading profile:', error);
        return;
      }

      setProfile(profileData);

      if (profileData?.organization_id) {
        const { data: orgData } = await supabase
          .from('organizations')
          .select('name, slug')
          .eq('id', profileData.organization_id)
          .maybeSingle();

        if (orgData) {
          setOrganizationName(orgData.name);
          setTenantSlug(orgData.slug);
        }
      }
    } catch (error) {
      console.error('Error in initAuth:', error);
    }
  }

  function validateForm(): boolean {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Course title is required';
    }
    if (!formData.description.trim()) {
      newErrors.description = 'Course description is required';
    }
    if (formData.duration_weeks < 1 || formData.duration_weeks > 52) {
      newErrors.duration_weeks = 'Duration must be between 1 and 52 weeks';
    }
    if (formData.credits < 1 || formData.credits > 100) {
      newErrors.credits = 'Credits must be between 1 and 100';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      // TODO: Replace with actual Supabase insert
      // const { data, error } = await supabase
      //   .from('courses')
      //   .insert([{
      //     ...formData,
      //     organization_id: profile.organization_id,
      //     created_by: profile.id,
      //   }])
      //   .select()
      //   .single();

      // if (error) throw error;

      // Mock success for MVP
      await new Promise((resolve) => setTimeout(resolve, 1000));
      router.push('/dashboard/admin-tertiary/courses');
    } catch (error) {
      console.error('Error creating course:', error);
      setErrors({ submit: 'Failed to create course. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  if (!profile) {
    return (
      <TertiaryShell
        userEmail=""
        userName=""
        userRole="admin"
        hideRightSidebar={true}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-slate-400">Loading...</p>
        </div>
      </TertiaryShell>
    );
  }

  return (
    <TertiaryShell
      tenantSlug={tenantSlug}
      organizationName={organizationName}
      userEmail={profile.email}
      userName={profile.first_name}
      userRole={profile.role}
      hideRightSidebar={true}
    >
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link
          href="/dashboard/admin-tertiary/courses"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 16,
            padding: '8px 16px',
            fontSize: 14,
            color: 'var(--muted)',
            textDecoration: 'none',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          <ArrowLeft style={{ width: 16, height: 16 }} />
          Back to Courses
        </Link>
        <h1 className="h1">Create New Course</h1>
        <p style={{ marginTop: 8, fontSize: 16, color: 'var(--muted)' }}>
          Set up a new course with curriculum details and requirements
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <div className="card" style={{ padding: 32, marginBottom: 24 }}>
          <div className="section">
            <div className="sectionTitle">Course Information</div>

            {/* Title */}
            <div style={{ marginBottom: 24 }}>
              <label
                htmlFor="title"
                style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 8,
                  color: 'var(--text)',
                }}
              >
                Course Title *
              </label>
              <input
                id="title"
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Business Management Fundamentals"
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 8,
                  border: `1px solid ${errors.title ? '#ef4444' : 'var(--border)'}`,
                  background: 'var(--bg)',
                  fontSize: 15,
                  color: 'var(--text)',
                }}
              />
              {errors.title && (
                <p style={{ marginTop: 4, fontSize: 13, color: '#ef4444' }}>{errors.title}</p>
              )}
            </div>

            {/* Description */}
            <div style={{ marginBottom: 24 }}>
              <label
                htmlFor="description"
                style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 8,
                  color: 'var(--text)',
                }}
              >
                Course Description *
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Provide a detailed description of the course content and objectives"
                rows={4}
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 8,
                  border: `1px solid ${errors.description ? '#ef4444' : 'var(--border)'}`,
                  background: 'var(--bg)',
                  fontSize: 15,
                  color: 'var(--text)',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
              {errors.description && (
                <p style={{ marginTop: 4, fontSize: 13, color: '#ef4444' }}>{errors.description}</p>
              )}
            </div>

            {/* Duration and Credits */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div>
                <label
                  htmlFor="duration_weeks"
                  style={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: 8,
                    color: 'var(--text)',
                  }}
                >
                  Duration (weeks) *
                </label>
                <input
                  id="duration_weeks"
                  type="number"
                  min="1"
                  max="52"
                  value={formData.duration_weeks}
                  onChange={(e) =>
                    setFormData({ ...formData, duration_weeks: parseInt(e.target.value) || 0 })
                  }
                  style={{
                    width: '100%',
                    padding: 12,
                    borderRadius: 8,
                    border: `1px solid ${errors.duration_weeks ? '#ef4444' : 'var(--border)'}`,
                    background: 'var(--bg)',
                    fontSize: 15,
                    color: 'var(--text)',
                  }}
                />
                {errors.duration_weeks && (
                  <p style={{ marginTop: 4, fontSize: 13, color: '#ef4444' }}>{errors.duration_weeks}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="credits"
                  style={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: 8,
                    color: 'var(--text)',
                  }}
                >
                  Credits *
                </label>
                <input
                  id="credits"
                  type="number"
                  min="1"
                  max="100"
                  value={formData.credits}
                  onChange={(e) =>
                    setFormData({ ...formData, credits: parseInt(e.target.value) || 0 })
                  }
                  style={{
                    width: '100%',
                    padding: 12,
                    borderRadius: 8,
                    border: `1px solid ${errors.credits ? '#ef4444' : 'var(--border)'}`,
                    background: 'var(--bg)',
                    fontSize: 15,
                    color: 'var(--text)',
                  }}
                />
                {errors.credits && (
                  <p style={{ marginTop: 4, fontSize: 13, color: '#ef4444' }}>{errors.credits}</p>
                )}
              </div>
            </div>

            {/* Prerequisites */}
            <div style={{ marginBottom: 24 }}>
              <label
                htmlFor="prerequisites"
                style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 8,
                  color: 'var(--text)',
                }}
              >
                Prerequisites
              </label>
              <textarea
                id="prerequisites"
                value={formData.prerequisites}
                onChange={(e) => setFormData({ ...formData, prerequisites: e.target.value })}
                placeholder="List any prerequisites or prior knowledge required (optional)"
                rows={3}
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  fontSize: 15,
                  color: 'var(--text)',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            </div>

            {/* Learning Outcomes */}
            <div style={{ marginBottom: 24 }}>
              <label
                htmlFor="learning_outcomes"
                style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 8,
                  color: 'var(--text)',
                }}
              >
                Learning Outcomes
              </label>
              <textarea
                id="learning_outcomes"
                value={formData.learning_outcomes}
                onChange={(e) => setFormData({ ...formData, learning_outcomes: e.target.value })}
                placeholder="What will students be able to do after completing this course? (optional)"
                rows={4}
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  fontSize: 15,
                  color: 'var(--text)',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            </div>

            {/* Status */}
            <div>
              <label
                htmlFor="status"
                style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 8,
                  color: 'var(--text)',
                }}
              >
                Status
              </label>
              <select
                id="status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  fontSize: 15,
                  color: 'var(--text)',
                }}
              >
                <option value="draft">Draft - Not visible to students</option>
                <option value="active">Active - Open for enrollment</option>
              </select>
              <p style={{ marginTop: 4, fontSize: 13, color: 'var(--muted)' }}>
                Draft courses can be edited before making them active
              </p>
            </div>
          </div>
        </div>

        {/* Submit Error */}
        {errors.submit && (
          <div
            className="card"
            style={{
              padding: 16,
              marginBottom: 24,
              background: '#fef2f2',
              border: '1px solid #fecaca',
            }}
          >
            <p style={{ color: '#ef4444', fontSize: 14 }}>{errors.submit}</p>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <Link
            href="/dashboard/admin-tertiary/courses"
            style={{
              padding: '12px 24px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 15,
              textDecoration: 'none',
              color: 'var(--text)',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 24px',
              background: loading ? '#9ca3af' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 15,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
              border: 'none',
            }}
          >
            <Save style={{ width: 20, height: 20 }} />
            {loading ? 'Creating...' : 'Create Course'}
          </button>
        </div>
      </form>
    </TertiaryShell>
  );
}
