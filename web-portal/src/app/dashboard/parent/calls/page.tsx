'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { SubPageHeader } from '@/components/dashboard/SubPageHeader';
import {
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneOff,
  Video, Clock, Trash2, Filter,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type CallType = 'voice' | 'video';
type CallDirection = 'incoming' | 'outgoing';
type CallStatus = 'completed' | 'missed' | 'declined' | 'no_answer';
type FilterType = 'all' | 'missed' | 'incoming' | 'outgoing';

interface CallRecord {
  id: string;
  caller_id: string;
  callee_id: string;
  call_type: CallType;
  direction: CallDirection;
  status: CallStatus;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  caller_profile?: { first_name: string; last_name: string; avatar_url?: string };
  callee_profile?: { first_name: string; last_name: string; avatar_url?: string };
}

export default function CallsHistoryPage() {
  const router = useRouter();
  const supabase = createClient();

  const [userId, setUserId] = useState<string>('');
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/sign-in'); return; }
      setUserId(user.id);
      await loadCalls(user.id);
    };
    init();
  }, []);

  const loadCalls = async (uid: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('active_calls')
      .select(`
        id, caller_id, callee_id, call_type, status, started_at, ended_at, duration_seconds,
        caller_profile:profiles!active_calls_caller_id_fkey(first_name, last_name, avatar_url),
        callee_profile:profiles!active_calls_callee_id_fkey(first_name, last_name, avatar_url)
      `)
      .or(`caller_id.eq.${uid},callee_id.eq.${uid}`)
      .order('started_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      const mapped = data.map((call: any) => ({
        ...call,
        direction: call.caller_id === uid ? 'outgoing' : 'incoming',
        caller_profile: Array.isArray(call.caller_profile) ? call.caller_profile[0] : call.caller_profile,
        callee_profile: Array.isArray(call.callee_profile) ? call.callee_profile[0] : call.callee_profile,
      }));
      setCalls(mapped);
    }
    setLoading(false);
  };

  const handleClearHistory = async () => {
    if (!confirm('Clear all call history? This cannot be undone.')) return;
    const { error } = await supabase
      .from('active_calls')
      .delete()
      .or(`caller_id.eq.${userId},callee_id.eq.${userId}`);
    if (!error) setCalls([]);
  };

  const filteredCalls = useMemo(() => {
    if (filter === 'all') return calls;
    if (filter === 'missed') return calls.filter((c) => c.status === 'missed' || c.status === 'no_answer');
    if (filter === 'incoming') return calls.filter((c) => c.direction === 'incoming');
    if (filter === 'outgoing') return calls.filter((c) => c.direction === 'outgoing');
    return calls;
  }, [calls, filter]);

  const counts = useMemo(() => ({
    all: calls.length,
    missed: calls.filter((c) => c.status === 'missed' || c.status === 'no_answer').length,
    incoming: calls.filter((c) => c.direction === 'incoming').length,
    outgoing: calls.filter((c) => c.direction === 'outgoing').length,
  }), [calls]);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '0s';
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const getCallIcon = (call: CallRecord) => {
    if (call.status === 'missed' || call.status === 'no_answer') return <PhoneMissed size={18} style={{ color: '#ef4444' }} />;
    if (call.status === 'declined') return <PhoneOff size={18} style={{ color: '#9ca3af' }} />;
    if (call.direction === 'incoming') return <PhoneIncoming size={18} style={{ color: '#10b981' }} />;
    return <PhoneOutgoing size={18} style={{ color: '#3b82f6' }} />;
  };

  const getContactName = (call: CallRecord) => {
    const profile = call.direction === 'outgoing' ? call.callee_profile : call.caller_profile;
    if (!profile) return 'Unknown';
    return `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown';
  };

  const filterButtons: { key: FilterType; label: string; color: string }[] = [
    { key: 'all', label: 'All', color: 'var(--primary)' },
    { key: 'missed', label: 'Missed', color: '#ef4444' },
    { key: 'incoming', label: 'Incoming', color: '#10b981' },
    { key: 'outgoing', label: 'Outgoing', color: '#3b82f6' },
  ];

  return (
    <ParentShell hideHeader={true}>
      <div style={{ margin: 'calc(var(--space-3) * -1) calc(var(--space-2) * -1)', padding: 0 }}>
        <SubPageHeader
          title="Call History"
          subtitle="View your recent voice and video calls"
          icon={<Phone size={28} color="white" />}
        />

        <div style={{ width: '100%', padding: 20, maxWidth: 800, margin: '0 auto' }}>
          {/* Filter chips */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            {filterButtons.map((btn) => (
              <button
                key={btn.key}
                onClick={() => setFilter(btn.key)}
                style={{
                  padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: filter === btn.key ? btn.color : 'var(--surface)',
                  color: filter === btn.key ? 'white' : 'var(--text)',
                  fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'all 0.2s',
                }}
              >
                {btn.label} ({counts[btn.key]})
              </button>
            ))}
            {calls.length > 0 && (
              <button
                onClick={handleClearHistory}
                style={{
                  marginLeft: 'auto', padding: '8px 12px', borderRadius: 8, border: 'none',
                  background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <Trash2 size={14} /> Clear
              </button>
            )}
          </div>

          {/* Call list */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div className="spinner" style={{ margin: '0 auto' }} />
              <p style={{ color: 'var(--muted)', marginTop: 16 }}>Loading calls...</p>
            </div>
          ) : filteredCalls.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              <Phone size={48} style={{ margin: '0 auto', color: 'var(--muted)', opacity: 0.4 }} />
              <h3 style={{ marginTop: 16 }}>No calls</h3>
              <p style={{ color: 'var(--muted)', margin: '8px 0 0' }}>
                {filter === 'all' ? 'Your call history will appear here.' : `No ${filter} calls found.`}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredCalls.map((call) => (
                <div
                  key={call.id}
                  className="card"
                  style={{
                    padding: 16, display: 'flex', alignItems: 'center', gap: 14,
                    borderLeft: `3px solid ${call.status === 'missed' || call.status === 'no_answer' ? '#ef4444' : call.direction === 'incoming' ? '#10b981' : '#3b82f6'}`,
                  }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: call.call_type === 'video' ? 'rgba(139,92,246,0.1)' : 'rgba(59,130,246,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {call.call_type === 'video'
                      ? <Video size={20} style={{ color: '#8b5cf6' }} />
                      : getCallIcon(call)
                    }
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {getContactName(call)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
                      {getCallIcon(call)}
                      <span style={{ textTransform: 'capitalize' }}>
                        {call.direction} {call.call_type}
                      </span>
                      {call.duration_seconds != null && call.duration_seconds > 0 && (
                        <>
                          <span>·</span>
                          <span>{formatDuration(call.duration_seconds)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {formatDistanceToNow(new Date(call.started_at), { addSuffix: true })}
                    </div>
                    {(call.status === 'missed' || call.status === 'no_answer') && (
                      <span style={{
                        display: 'inline-block', marginTop: 4, fontSize: 11,
                        padding: '2px 8px', borderRadius: 6,
                        background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 600,
                      }}>
                        Missed
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ParentShell>
  );
}
