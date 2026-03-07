'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TertiaryShell } from '@/components/dashboard/tertiary/TertiaryShell';
import { useRouter } from 'next/navigation';
import { Settings } from 'lucide-react';

export default function InstructorSettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<any>(null);
  const [organizationName, setOrganizationName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');

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

      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, role, organization_id')
        .eq('id', session.user.id)
        .single();

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

  if (!profile) {
    return (
      <TertiaryShell userEmail="" userName="" userRole="instructor" hideRightSidebar={true}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
          <p style={{ color: 'var(--muted)' }}>Loading...</p>
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
      <h1 className="h1">Settings</h1>
      <p style={{ marginTop: 8, marginBottom: 24, fontSize: 16, color: 'var(--muted)' }}>
        Manage your profile and preferences
      </p>

      <div className="card" style={{ padding: 80, textAlign: 'center' }}>
        <Settings style={{ width: 64, height: 64, margin: '0 auto 24px', color: 'var(--muted)', opacity: 0.5 }} />
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Coming Soon</h2>
        <p style={{ fontSize: 16, color: 'var(--muted)', maxWidth: 400, margin: '0 auto' }}>
          Profile settings and preferences will be available soon
        </p>
      </div>
    </TertiaryShell>
  );
}
