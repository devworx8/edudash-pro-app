'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { Brain, Cpu, Laptop, CheckCircle, X, Loader2 } from 'lucide-react';

export default function STEMProgramsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [authLoading, setAuthLoading] = useState(true);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const { profile, loading: profileLoading } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const preschoolId = profile?.preschoolId || profile?.organizationId;

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setUserId(session.user.id);
      setAuthLoading(false);
    };
    initAuth();
  }, [router, supabase]);

  useEffect(() => {
    if (!preschoolId) return;

    const loadSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('preschool_settings')
          .select('*')
          .eq('preschool_id', preschoolId)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;

        if (!data) {
          // Create default settings
          const { data: newSettings, error: createError } = await supabase
            .from('preschool_settings')
            .insert({
              preschool_id: preschoolId,
              enable_ai_program: false,
              enable_robotics_program: false,
              enable_computer_literacy: false,
            })
            .select()
            .single();

          if (createError) throw createError;
          setSettings(newSettings);
        } else {
          setSettings(data);
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [preschoolId, supabase]);

  const updateSetting = async (field: string, value: boolean) => {
    if (!preschoolId || !settings) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('preschool_settings')
        .update({ [field]: value })
        .eq('preschool_id', preschoolId);

      if (error) throw error;

      setSettings({ ...settings, [field]: value });
    } catch (error) {
      console.error('Error updating setting:', error);
      alert('Failed to update setting');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || profileLoading || loading) {
    return (
      <PrincipalShell
        tenantSlug={tenantSlug}
        userEmail={profile?.email}
        userName={profile?.firstName}
        preschoolName={profile?.preschoolName}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="animate-spin" size={32} />
        </div>
      </PrincipalShell>
    );
  }

  const programs = [
    {
      id: 'ai',
      name: 'AI Program',
      description: 'Enable AI-enhanced lessons and activities for students',
      icon: Brain,
      color: '#8b5cf6',
      enabled: settings?.enable_ai_program || false,
      field: 'enable_ai_program',
    },
    {
      id: 'robotics',
      name: 'Robotics Program',
      description: 'Enable robotics activities and basic programming concepts',
      icon: Cpu,
      color: '#f59e0b',
      enabled: settings?.enable_robotics_program || false,
      field: 'enable_robotics_program',
    },
    {
      id: 'computer_literacy',
      name: 'Computer Literacy Program',
      description: 'Enable computer skills training and digital literacy activities',
      icon: Laptop,
      color: '#06b6d4',
      enabled: settings?.enable_computer_literacy || false,
      field: 'enable_computer_literacy',
    },
  ];

  return (
    <PrincipalShell
      tenantSlug={tenantSlug}
      userEmail={profile?.email}
      userName={profile?.firstName}
      preschoolName={profile?.preschoolName}
    >
      <div className="container">
        <h1 className="h1">STEM Program Management</h1>
        <p className="muted" style={{ marginBottom: 24 }}>
          Enable or disable STEM programs for your school. Teachers can only create lessons for enabled programs.
        </p>

        <div className="section">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {programs.map((program) => {
              const Icon = program.icon;
              return (
                <div key={program.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: 16, flex: 1 }}>
                      <div style={{
                        width: 48,
                        height: 48,
                        borderRadius: 12,
                        background: `${program.color}20`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <Icon size={24} color={program.color} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ margin: '0 0 4px 0', fontSize: 18, fontWeight: 600 }}>
                          {program.name}
                        </h3>
                        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>
                          {program.description}
                        </p>
                      </div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={program.enabled}
                        onChange={(e) => updateSetting(program.field, e.target.checked)}
                        disabled={saving}
                        style={{ width: 20, height: 20, cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: 14, fontWeight: 600 }}>
                        {program.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="section">
          <div className="card" style={{ background: '#f0f9ff', border: '1px solid #0ea5e9' }}>
            <h3 style={{ marginBottom: 8, fontSize: 16, fontWeight: 600 }}>Program Status</h3>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>
              When a program is enabled, teachers can create lessons and assign activities related to that program.
              Parents and students will have access to practice activities for enabled programs.
            </p>
          </div>
        </div>
      </div>
    </PrincipalShell>
  );
}
