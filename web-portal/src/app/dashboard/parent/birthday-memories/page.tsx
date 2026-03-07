'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { useParentDashboardData } from '@/lib/hooks/useParentDashboardData';
import { createClient } from '@/lib/supabase/client';

interface BirthdayMemoryEvent {
  id: string;
  birthday_student_id: string;
  event_date: string;
}

interface BirthdayMemoryMedia {
  id: string;
  media_type: 'image' | 'video';
  storage_path: string;
  preview_path?: string | null;
  created_at: string;
}

function BirthdayMemoriesContent() {
  const searchParams = useSearchParams();
  const { profile, tenantSlug, userName } = useParentDashboardData();
  const supabase = createClient();

  const birthdayStudentId = searchParams.get('birthdayStudentId') || '';
  const eventDate = searchParams.get('eventDate') || '';

  const [event, setEvent] = useState<BirthdayMemoryEvent | null>(null);
  const [media, setMedia] = useState<BirthdayMemoryMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canQuery = useMemo(() => Boolean(profile && birthdayStudentId && eventDate), [profile, birthdayStudentId, eventDate]);

  const loadEvent = useCallback(async () => {
    if (!canQuery) return;
    const { data, error } = await supabase.functions.invoke('birthday-memories', {
      body: {
        action: 'get_or_create_event',
        payload: {
          birthday_student_id: birthdayStudentId,
          event_date: eventDate,
        },
      },
    });

    if (error || !data?.success) {
      setError('Unable to load memories');
      return;
    }
    setEvent(data.data as BirthdayMemoryEvent);
  }, [birthdayStudentId, eventDate, canQuery]);

  const loadMedia = useCallback(async () => {
    if (!event?.id) return;
    const { data, error } = await supabase.functions.invoke('birthday-memories', {
      body: { action: 'list_media', payload: { event_id: event.id } },
    });

    if (error || !data?.success) {
      setError('Unable to load memories');
      return;
    }

    setMedia((data.data as BirthdayMemoryMedia[]) || []);
  }, [event?.id]);

  useEffect(() => {
    const init = async () => {
      if (!canQuery) {
        setLoading(false);
        return;
      }
      await loadEvent();
      setLoading(false);
    };
    void init();
  }, [canQuery, loadEvent]);

  useEffect(() => {
    void loadMedia();
  }, [loadMedia]);

  const handleView = useCallback(async (mediaId: string) => {
    const { data } = await supabase.functions.invoke('birthday-memories', {
      body: { action: 'get_view_url', payload: { media_id: mediaId } },
    });

    if (!data?.success || !data?.url) return;
    window.open(data.url, '_blank');
  }, []);

  const handleDownload = useCallback(async (mediaId: string) => {
    const { data } = await supabase.functions.invoke('birthday-memories', {
      body: { action: 'get_download_url', payload: { media_id: mediaId } },
    });

    if (!data?.success || !data?.url) {
      alert('Only parents of the birthday child can download.');
      return;
    }
    window.open(data.url, '_blank');
  }, []);

  return (
    <ParentShell tenantSlug={tenantSlug} userEmail={profile?.email || userName}>
      <div className="pageContent" style={{ padding: '24px' }}>
        <h2>Birthday Memories</h2>
        <p>School-wide memories for this celebration.</p>

        {loading && <p>Loading...</p>}
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

        {!loading && media.length === 0 && <p>No memories yet.</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px', marginTop: '16px' }}>
          {media.map((item) => (
            <div key={item.id} style={{ background: 'var(--surface)', borderRadius: '12px', padding: '12px', border: '1px solid var(--border)' }}>
              <div style={{ height: '160px', background: 'var(--surface-2)', borderRadius: '10px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {item.media_type === 'image' ? (
                  <img src={item.preview_path || ''} alt="Birthday" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span>Video</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" onClick={() => handleView(item.id)}>
                  View
                </button>
                <button className="btn btn-primary" onClick={() => handleDownload(item.id)}>
                  Download
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ParentShell>
  );
}

export default function ParentBirthdayMemoriesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}>
      <BirthdayMemoriesContent />
    </Suspense>
  );
}
