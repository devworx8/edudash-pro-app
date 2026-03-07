'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { ArrowLeft, MessageCircle, Save } from 'lucide-react';

export default function MessagingGroupsSettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [groupCreatorAutoAddAsAdmin, setGroupCreatorAutoAddAsAdmin] = useState(true);
  const [saved, setSaved] = useState(false);

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
      setLoading(false);
    };
    initAuth();
  }, [router, supabase]);

  useEffect(() => {
    const load = async () => {
      if (!preschoolId) return;
      const { data } = await supabase
        .from('preschool_settings')
        .select('group_creator_auto_add_as_admin')
        .eq('preschool_id', preschoolId)
        .maybeSingle();
      setGroupCreatorAutoAddAsAdmin(data?.group_creator_auto_add_as_admin !== false);
    };
    load();
  }, [preschoolId, supabase]);

  const handleSave = async () => {
    if (!preschoolId) return;
    setSaving(true);
    setSaved(false);
    try {
      const { error } = await supabase
        .from('preschool_settings')
        .upsert(
          { preschool_id: preschoolId, group_creator_auto_add_as_admin: groupCreatorAutoAddAsAdmin },
          { onConflict: 'preschool_id' }
        );
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={preschoolId} hideRightSidebar={true}>
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-slate-400">Loading settings...</p>
        </div>
      </PrincipalShell>
    );
  }

  return (
    <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={preschoolId} hideRightSidebar={true}>
      <div className="section">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-400 hover:text-foreground mb-6"
        >
          <ArrowLeft size={20} />
          Back
        </button>

        <h1 className="h1" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <MessageCircle size={32} />
          Messaging & Groups
        </h1>

        <div className="card" style={{ marginTop: 24 }}>
          <h2 style={{ marginBottom: 8 }}>Class group creation</h2>
          <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
            When teachers create class groups, automatically add them as admins. Turn off if you prefer only the class teacher and parents in each group.
          </p>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <span style={{ fontWeight: 500 }}>Auto-add teacher as admin when they create a group</span>
            <button
              onClick={() => setGroupCreatorAutoAddAsAdmin((v) => !v)}
              style={{
                padding: '8px 16px',
                borderRadius: 999,
                border: '2px solid',
                borderColor: groupCreatorAutoAddAsAdmin ? 'var(--primary)' : 'var(--border)',
                background: groupCreatorAutoAddAsAdmin ? 'var(--primary)' : 'transparent',
                color: groupCreatorAutoAddAsAdmin ? 'white' : 'var(--muted)',
                fontWeight: 600,
              }}
            >
              {groupCreatorAutoAddAsAdmin ? 'ON' : 'OFF'}
            </button>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="btn primary"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {saving ? (
              'Saving...'
            ) : saved ? (
              '✓ Saved'
            ) : (
              <>
                <Save size={18} />
                Save
              </>
            )}
          </button>
        </div>
      </div>
    </PrincipalShell>
  );
}
