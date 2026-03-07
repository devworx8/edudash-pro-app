'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { useChildrenData } from '@/lib/hooks/parent/useChildrenData';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import type { ChildCard } from '@/lib/hooks/parent/types';
import { Users, Plus, UserPlus, Camera, Loader2, ArrowLeft } from 'lucide-react';

const AVATAR_BUCKET = 'avatars';
const STUDENT_AVATAR_FOLDER = 'student_avatars';
const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

type SupabaseClient = ReturnType<typeof createClient>;

interface ParentProfileRow {
  id: string;
  organization_id: string | null;
  preschool_id: string | null;
}

interface StudentOwnershipRow {
  id: string;
  organization_id: string | null;
  preschool_id: string | null;
  parent_id: string | null;
  guardian_id: string | null;
}

const getSafeFileExtension = (file: File) => {
  const fromName = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (fromName) return fromName;
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
};

const resolveParentProfile = async (
  supabase: SupabaseClient,
  authUserId: string
): Promise<ParentProfileRow | null> => {
  const byId = await supabase
    .from('profiles')
    .select('id, organization_id, preschool_id')
    .eq('id', authUserId)
    .maybeSingle();

  if (byId.data?.id) {
    return {
      id: byId.data.id,
      organization_id: byId.data.organization_id ?? null,
      preschool_id: byId.data.preschool_id ?? null,
    };
  }

  const byAuthId = await supabase
    .from('profiles')
    .select('id, organization_id, preschool_id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (!byAuthId.data?.id) {
    return null;
  }

  return {
    id: byAuthId.data.id,
    organization_id: byAuthId.data.organization_id ?? null,
    preschool_id: byAuthId.data.preschool_id ?? null,
  };
};

const isStudentInScope = (student: StudentOwnershipRow, parentProfile: ParentProfileRow) => {
  const scopeId = parentProfile.organization_id || parentProfile.preschool_id;
  if (!scopeId) return true;
  if (student.organization_id && student.organization_id !== scopeId) return false;
  if (student.preschool_id && student.preschool_id !== scopeId) return false;
  return true;
};

const resolveAuthorizedStudent = async (
  supabase: SupabaseClient,
  childId: string,
  authUserId: string,
  parentProfile: ParentProfileRow
): Promise<StudentOwnershipRow | null> => {
  const parentFilters = [
    `parent_id.eq.${parentProfile.id}`,
    `guardian_id.eq.${parentProfile.id}`,
    `parent_id.eq.${authUserId}`,
    `guardian_id.eq.${authUserId}`,
  ];

  const linked = await supabase
    .from('students')
    .select('id, organization_id, preschool_id, parent_id, guardian_id')
    .eq('id', childId)
    .or(parentFilters.join(','))
    .maybeSingle();

  if (linked.data?.id && isStudentInScope(linked.data as StudentOwnershipRow, parentProfile)) {
    return linked.data as StudentOwnershipRow;
  }

  const relationship = await supabase
    .from('student_parent_relationships')
    .select('student_id')
    .eq('student_id', childId)
    .eq('parent_id', parentProfile.id)
    .maybeSingle();

  if (!relationship.data?.student_id) {
    return null;
  }

  const fallbackStudent = await supabase
    .from('students')
    .select('id, organization_id, preschool_id, parent_id, guardian_id')
    .eq('id', childId)
    .maybeSingle();

  if (!fallbackStudent.data?.id) {
    return null;
  }

  const student = fallbackStudent.data as StudentOwnershipRow;
  return isStudentInScope(student, parentProfile) ? student : null;
};

export default function ChildrenPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userEmail, setUserEmail] = useState<string>();
  const [userId, setUserId] = useState<string>();
  const { slug } = useTenantSlug(userId);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push('/sign-in');
        return;
      }

      setUserEmail(session.user.email);
      setUserId(session.user.id);
      setLoading(false);
    };

    initAuth();
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <ParentShell tenantSlug={slug} userEmail={userEmail} hideHeader={true}>
      <div className="section">
        <div style={{ marginBottom: 24 }}>
          <h1 className="h1">My Children</h1>
          <p style={{ color: 'var(--textLight)', marginTop: 8 }}>
            Manage your children's profiles and link them to your account
          </p>
        </div>

        <ChildrenContent userId={userId} />
      </div>
    </ParentShell>
  );
}

function ChildrenContent({ userId }: { userId: string | undefined }) {
  const supabase = createClient();
  const { childrenCards, loading, error, refetch } = useChildrenData(userId);
  const router = useRouter();
  const [uploadingChildId, setUploadingChildId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [avatarOverrides, setAvatarOverrides] = useState<Record<string, string>>({});

  const handleChildAvatarUpload = useCallback(async (child: ChildCard, file?: File) => {
    if (!file) return;

    if (!userId) {
      setUploadError('You must be signed in to upload a photo.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setUploadError('Please select an image file.');
      return;
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      setUploadError('Image must be smaller than 5MB.');
      return;
    }

    try {
      setUploadError(null);
      setUploadSuccess(null);
      setUploadingChildId(child.id);

      const parentProfile = await resolveParentProfile(supabase, userId);
      if (!parentProfile) {
        throw new Error('Parent profile not found.');
      }

      const authorizedStudent = await resolveAuthorizedStudent(supabase, child.id, userId, parentProfile);
      if (!authorizedStudent) {
        throw new Error('This child is not linked to your account.');
      }

      const fileExt = getSafeFileExtension(file);
      const filePath = `${userId}/${STUDENT_AVATAR_FOLDER}/${child.id}_${Date.now()}.${fileExt}`;

      const { error: uploadErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(filePath, file, {
          contentType: file.type || 'image/jpeg',
          upsert: true,
        });

      if (uploadErr) {
        throw new Error(uploadErr.message || 'Failed to upload image.');
      }

      const { data: publicUrlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);
      const publicUrl = publicUrlData?.publicUrl;

      if (!publicUrl) {
        throw new Error('Unable to create image URL.');
      }

      const { error: updateErr } = await supabase
        .from('students')
        .update({ avatar_url: publicUrl })
        .eq('id', child.id);

      if (updateErr) {
        throw new Error(updateErr.message || 'Failed to update child profile image.');
      }

      setAvatarOverrides((prev) => ({ ...prev, [child.id]: publicUrl }));
      setUploadSuccess(`Updated ${child.firstName} ${child.lastName}'s photo.`);
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload child photo.';
      setUploadError(message);
    } finally {
      setUploadingChildId(null);
    }
  }, [refetch, supabase, userId]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <div className="spinner" style={{ margin: '0 auto' }}></div>
        <p style={{ color: 'var(--textLight)', marginTop: 16 }}>Loading children...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ 
        padding: 16, 
        background: 'var(--danger-subtle)', 
        border: '1px solid var(--danger)',
        color: 'var(--danger)'
      }}>
        {error}
      </div>
    );
  }

  if (!childrenCards || childrenCards.length === 0) {
    return (
      <div className="card" style={{ padding: 48, textAlign: 'center' }}>
        <Users className="icon64" style={{ margin: '0 auto 16px', color: 'var(--textLight)' }} />
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No Children Linked</h3>
        <p style={{ color: 'var(--textMuted)', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
          Search for your child by name to link them to your account. The school will approve your request.
        </p>
        <button
          onClick={() => router.push('/dashboard/parent/claim-child')}
          className="btn btnPrimary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <UserPlus className="icon16" />
          Search & Claim Child
        </button>
      </div>
    );
  }

  return (
    <>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 24,
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div style={{ fontSize: 14, color: 'var(--textLight)' }}>
          {childrenCards.length} {childrenCards.length === 1 ? 'child' : 'children'} linked
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => router.push('/dashboard/parent')}
            className="btn btnSecondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <ArrowLeft className="icon16" />
            Back to Dashboard
          </button>
          <button
            onClick={() => router.push('/dashboard/parent/claim-child')}
            className="btn btnSecondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <Plus className="icon16" />
            Add Another Child
          </button>
        </div>
      </div>

      {uploadError && (
        <div className="card" style={{
          padding: 12,
          marginBottom: 16,
          background: 'var(--danger-subtle)',
          border: '1px solid var(--danger)',
          color: 'var(--danger)',
        }}>
          {uploadError}
        </div>
      )}

      {uploadSuccess && (
        <div className="card" style={{
          padding: 12,
          marginBottom: 16,
          background: 'var(--success-subtle)',
          border: '1px solid var(--success)',
          color: 'var(--success)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <span>{uploadSuccess}</span>
          <button
            onClick={() => router.push('/dashboard/parent')}
            className="btn btnSecondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <ArrowLeft className="icon16" />
            Back to Dashboard
          </button>
        </div>
      )}

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 16
      }}>
        {childrenCards.map((c) => {
          const displayAvatarUrl = avatarOverrides[c.id] || c.avatarUrl || null;
          const isUploading = uploadingChildId === c.id;
          const initials = `${c.firstName?.[0] || ''}${c.lastName?.[0] || ''}`.toUpperCase() || 'ST';

          return (
            <div key={c.id} className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div
                    className="avatar"
                    style={{
                      width: 56,
                      height: 56,
                      fontSize: 20,
                      overflow: 'hidden',
                      border: '2px solid var(--border)',
                      background: 'var(--surface)',
                    }}
                  >
                    {displayAvatarUrl ? (
                      <img
                        src={displayAvatarUrl}
                        alt={`${c.firstName} ${c.lastName}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      initials
                    )}
                  </div>
                  <label
                    htmlFor={`child-avatar-${c.id}`}
                    style={{
                      position: 'absolute',
                      right: -6,
                      bottom: -6,
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      border: '1px solid var(--border)',
                      background: isUploading ? 'var(--surface)' : 'var(--primary)',
                      color: isUploading ? 'var(--textLight)' : '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: isUploading || uploadingChildId !== null ? 'not-allowed' : 'pointer',
                      opacity: isUploading || uploadingChildId !== null ? 0.8 : 1,
                    }}
                    title={isUploading ? 'Uploading...' : 'Update photo'}
                  >
                    {isUploading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
                  </label>
                  <input
                    id={`child-avatar-${c.id}`}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    disabled={uploadingChildId !== null}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      void handleChildAvatarUpload(c, file);
                      event.target.value = '';
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                    {c.firstName} {c.lastName}
                  </h3>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 600,
                    background: c.status === 'active' ? 'var(--success-subtle)' : 'var(--warning-subtle)',
                    color: c.status === 'active' ? 'var(--success)' : 'var(--warning)',
                    textTransform: 'capitalize'
                  }}>
                    {c.status}
                  </span>
                </div>
              </div>
              
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 8,
                paddingTop: 16,
                borderTop: '1px solid var(--border)'
              }}>
                <div style={{ fontSize: 13, color: 'var(--textMuted)' }}>
                  <strong style={{ color: 'var(--text)' }}>Class:</strong> {c.className || 'Not assigned'}
                </div>
                
                <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                  <div style={{ flex: 1, textAlign: 'center', padding: 12, background: 'var(--surface)', borderRadius: 8 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>
                      {c.upcomingEvents}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--textLight)', marginTop: 4 }}>
                      Events
                    </div>
                  </div>
                  
                  <div style={{ flex: 1, textAlign: 'center', padding: 12, background: 'var(--surface)', borderRadius: 8 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: c.homeworkPending > 0 ? 'var(--warning)' : 'var(--success)' }}>
                      {c.homeworkPending}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--textLight)', marginTop: 4 }}>
                      Homework
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
