'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { SuperAdminShell } from '@/components/dashboard/superadmin/SuperAdminShell';
import RegistrationNotifications from '@/components/admin/RegistrationNotifications';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [profile, setProfile] = useState<{ email?: string; first_name?: string } | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.push('/sign-in');
        return;
      }

      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('role, email, first_name')
        .eq('id', session.user.id)
        .single();

      if (error || profileData?.role !== 'superadmin') {
        alert(`Access Denied: You need superadmin role. Current role: ${profileData?.role || 'none'}`);
        router.push('/dashboard');
        return;
      }

      setProfile({
        email: profileData?.email ?? session.user.email ?? undefined,
        first_name: profileData?.first_name ?? undefined,
      });
      setAuthorized(true);
    } catch (err) {
      console.error('[Admin] Auth check error:', err);
      alert('Error checking authorization');
      router.push('/sign-in');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--surface-0)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 120,
            height: 120,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            boxShadow: '0 0 60px rgba(124, 58, 237, 0.6)',
          }}>
            <span style={{ fontSize: 48, fontWeight: 'bold', color: 'white' }}>📚</span>
          </div>
          <h2 style={{ color: 'var(--text)', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>EduDash Pro</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return null;
  }

  return (
    <SuperAdminShell
      userEmail={profile?.email}
      userName={profile?.first_name}
      hideRightSidebar
      topBarRight={<RegistrationNotifications />}
    >
      {children}
    </SuperAdminShell>
  );
}
