'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { Users, Plus, Send } from 'lucide-react';

interface WaitlistEntry {
  id: string;
  child_first_name: string;
  child_last_name: string;
  child_date_of_birth: string | null;
  parent_name: string;
  parent_phone: string | null;
  status: string;
  position: number;
  preferred_start_date: string | null;
  notes: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: '#dbeafe', text: '#1e40af', label: 'Waiting' },
  offered: { bg: '#fef3c7', text: '#92400e', label: 'Offered' },
  accepted: { bg: '#d1fae5', text: '#065f46', label: 'Accepted' },
  declined: { bg: '#fee2e2', text: '#991b1b', label: 'Declined' },
  expired: { bg: '#f3f4f6', text: '#6b7280', label: 'Expired' },
  enrolled: { bg: '#ede9fe', text: '#5b21b6', label: 'Enrolled' },
};

export default function WaitlistPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const { profile } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const preschoolId = profile?.preschoolId || profile?.organizationId;

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/sign-in'); return; }
      setUserId(session.user.id);
    };
    init();
  }, [router, supabase]);

  const fetchEntries = useCallback(async () => {
    if (!preschoolId) return;
    const { data } = await supabase
      .from('waitlist_entries')
      .select('*')
      .eq('school_id', preschoolId)
      .order('position');
    setEntries((data as WaitlistEntry[]) || []);
    setLoading(false);
  }, [preschoolId, supabase]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const activeCount = entries.filter((e) => e.status === 'active').length;

  return (
    <PrincipalShell tenantSlug={tenantSlug} userEmail={profile?.email} userName={profile?.firstName} preschoolName={profile?.preschoolName}>
      <div style={{ padding: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h1 className="h1">Waitlist</h1>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>{activeCount} children waiting</p>
          </div>
          <button className="qa" style={{ background: 'var(--primary)', color: 'white', border: 'none', gap: 6 }}>
            <Plus size={16} /> Add Entry
          </button>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading...</p>
        ) : entries.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <Users size={40} color="var(--muted)" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontWeight: 600 }}>No waitlist entries</p>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>Add children to the waiting list</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {entries.map((entry) => {
              const s = STATUS_STYLES[entry.status] || STATUS_STYLES.active;
              const age = entry.child_date_of_birth
                ? Math.floor((Date.now() - new Date(entry.child_date_of_birth).getTime()) / (365.25 * 86400000))
                : null;

              return (
                <div key={entry.id} className="card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ background: 'var(--primary-light, #ede9fe)', color: 'var(--primary)', padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                      #{entry.position}
                    </span>
                    <span style={{ background: s.bg, color: s.text, padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                      {s.label}
                    </span>
                  </div>
                  <div style={{ fontWeight: 600 }}>{entry.child_first_name} {entry.child_last_name}</div>
                  {age !== null && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Age: {age} years</div>}
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>👤 {entry.parent_name}</div>
                  {entry.parent_phone && <div style={{ fontSize: 13, color: 'var(--muted)' }}>📱 {entry.parent_phone}</div>}
                  {entry.preferred_start_date && (
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                      📅 Preferred: {new Date(entry.preferred_start_date).toLocaleDateString()}
                    </div>
                  )}
                  {entry.status === 'active' && (
                    <button style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--primary)', color: 'white', border: 'none', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, marginTop: 10 }}>
                      <Send size={12} /> Offer Spot
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PrincipalShell>
  );
}
