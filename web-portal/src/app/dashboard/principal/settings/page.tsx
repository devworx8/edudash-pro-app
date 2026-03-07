'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { Settings, User, Lock, Bell, Globe, CreditCard, FileText, Activity, MessageCircle } from 'lucide-react';

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);

  const { profile } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const preschoolName = profile?.preschoolName;

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

  if (loading) {
    return (
      <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={profile?.preschoolId} hideRightSidebar={true}>
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-slate-400">Loading settings...</p>
        </div>
      </PrincipalShell>
    );
  }

  const quickActions = [
    {
      label: 'School Profile',
      description: 'Manage school information, contact details, and address',
      icon: Settings,
      onClick: () => router.push('/dashboard/principal/settings/school-profile'),
      color: '#3b82f6',
    },
    {
      label: 'Fee Structure',
      description: 'Configure registration fees, tuition, and other charges',
      icon: CreditCard,
      onClick: () => router.push('/dashboard/principal/settings/fees'),
      color: '#10b981',
    },
    {
      label: 'Report Card Configuration',
      description: 'Customize school branding, logo, and report card layout',
      icon: FileText,
      onClick: () => router.push('/dashboard/principal/settings/report-card'),
      color: '#8b5cf6',
    },
    {
      label: 'Learner Lifecycle',
      description: 'Configure inactivity thresholds, grace rules, and at-risk automation',
      icon: Activity,
      onClick: () => router.push('/dashboard/principal/settings/learner-lifecycle'),
      color: '#ef4444',
    },
    {
      label: 'Messaging & Groups',
      description: 'Auto-add teachers as admins when they create class groups',
      icon: MessageCircle,
      onClick: () => router.push('/dashboard/principal/settings/messaging-groups'),
      color: '#06b6d4',
    },
  ];

  const settingSections = [
    {
      title: 'Account Settings',
      icon: User,
      items: [
        { label: 'Profile Information', value: profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'Not set' : 'Not set' },
        { label: 'Email', value: profile?.email || 'Not set' },
        { label: 'Role', value: profile?.role || 'principal' },
      ],
    },
    {
      title: 'Security & Privacy',
      icon: Lock,
      items: [
        { label: 'Password', value: '••••••••' },
        { label: 'Two-Factor Authentication', value: 'Disabled' },
        { label: 'Data Protection', value: 'Enabled' },
      ],
    },
    {
      title: 'Notifications',
      icon: Bell,
      items: [
        { label: 'Email Notifications', value: 'Enabled' },
        { label: 'Push Notifications', value: 'Enabled' },
        { label: 'SMS Alerts', value: 'Disabled' },
      ],
    },
    {
      title: 'Regional Settings',
      icon: Globe,
      items: [
        { label: 'Language', value: 'English (South Africa)' },
        { label: 'Timezone', value: 'Africa/Johannesburg' },
        { label: 'Currency', value: 'ZAR (R)' },
      ],
    },
    {
      title: 'Billing & Subscription',
      icon: CreditCard,
      items: [
        { label: 'Current Plan', value: 'Professional' },
        { label: 'Billing Cycle', value: 'Monthly' },
        { label: 'Next Invoice', value: 'Not available' },
      ],
    },
  ];

  return (
    <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={profile?.preschoolId} hideRightSidebar={true}>
      <div className="section">
        <h1 className="h1">Settings</h1>

        {/* Quick Actions */}
        <div style={{ display: 'grid', gap: 16, marginBottom: 24 }}>
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={action.onClick}
                className="card"
                style={{
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  border: '2px solid transparent',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = action.color;
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: `${action.color}20`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={24} style={{ color: action.color }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ marginBottom: 4 }}>{action.label}</h3>
                    <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
                      {action.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'grid', gap: 24 }}>
          {settingSections.map((section) => {
            const Icon = section.icon;
            return (
              <div key={section.title} className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <Icon size={24} style={{ color: 'var(--primary)' }} />
                  <h3>{section.title}</h3>
                </div>
                <div style={{ display: 'grid', gap: 16 }}>
                  {section.items.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingBottom: idx < section.items.length - 1 ? 16 : 0,
                        borderBottom:
                          idx < section.items.length - 1 ? '1px solid var(--divider)' : 'none',
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>{item.label}</span>
                      <span style={{ color: 'var(--muted)' }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="card" style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Settings size={24} style={{ color: 'var(--muted)' }} />
            <h3>About & Support</h3>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 500 }}>App Version</span>
              <span style={{ color: 'var(--muted)' }}>1.0.0</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 500 }}>Terms of Service</span>
              <a href="#" style={{ color: 'var(--primary)' }}>View</a>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 500 }}>Privacy Policy</span>
              <a href="#" style={{ color: 'var(--primary)' }}>View</a>
            </div>
          </div>
        </div>
      </div>
    </PrincipalShell>
  );
}
