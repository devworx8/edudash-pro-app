'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import type { DisplayData } from '@/lib/display/types';
import { Clock, BookOpen, UtensilsCrossed, Megaphone, Lightbulb } from 'lucide-react';

/**
 * /display/signage — Minimal auto-rotating signage mode for lobby TVs.
 *
 * Usage: /display/signage?code=ABC123  (or ?pair=..., ?org=...&token=...)
 *
 * Features:
 * - Full-screen, no interactive controls
 * - Auto-rotates sections every 30s
 * - Large 10-foot readable text
 * - Clock + school branding
 * - Keyboard: ArrowRight/ArrowLeft to manually advance
 */

const ROTATION_SEC = 30;
const REFRESH_MS = 60_000;
const SECTIONS = ['routine', 'lessons', 'menu', 'announcements', 'insights'] as const;
type Section = (typeof SECTIONS)[number];

const TRUSTED_TV_KEY = 'edudash.display.trustedTv.v1';

function readPairToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TRUSTED_TV_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.token === 'string' ? parsed.token : null;
  } catch {
    return null;
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso.slice(11, 16);
  }
}

function SignageClient() {
  const searchParams = useSearchParams();
  const codeParam = searchParams.get('code')?.trim().toUpperCase() || null;
  const orgParam = searchParams.get('org');
  const tokenParam = searchParams.get('token');

  const [data, setData] = useState<DisplayData | null>(null);
  const [sectionIdx, setSectionIdx] = useState(0);
  const [clock, setClock] = useState(() => new Date());

  const pairToken = useMemo(() => readPairToken(), []);

  const fetchData = useCallback(async () => {
    try {
      let url = '/api/display/data';
      if (pairToken) {
        url += `?pair=${encodeURIComponent(pairToken)}`;
      } else if (codeParam) {
        url += `?code=${encodeURIComponent(codeParam)}`;
      } else if (orgParam && tokenParam) {
        url += `?org=${encodeURIComponent(orgParam)}&token=${encodeURIComponent(tokenParam)}`;
      } else {
        return;
      }
      const res = await fetch(url);
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // silently retry on next interval
    }
  }, [pairToken, codeParam, orgParam, tokenParam]);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(t);
  }, [fetchData]);

  // Clock tick every second
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Available sections based on data
  const available = useMemo<Section[]>(() => {
    if (!data) return ['routine'];
    const out: Section[] = [];
    if (data.routine?.blocks?.length) out.push('routine');
    if (data.lessons?.length) out.push('lessons');
    if (data.menuToday?.breakfast?.length || data.menuToday?.lunch?.length || data.menuToday?.snack?.length)
      out.push('menu');
    if (data.announcements?.length) out.push('announcements');
    if (data.insights?.bullets?.length) out.push('insights');
    return out.length ? out : ['routine'];
  }, [data]);

  // Auto-rotate
  useEffect(() => {
    if (available.length <= 1) return;
    const t = setInterval(() => {
      setSectionIdx((i) => (i + 1) % available.length);
    }, ROTATION_SEC * 1000);
    return () => clearInterval(t);
  }, [available.length]);

  // Keep index in bounds
  useEffect(() => {
    setSectionIdx((i) => (i >= available.length ? 0 : i));
  }, [available.length]);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSectionIdx((i) => (i + 1) % available.length);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSectionIdx((i) => (i - 1 + available.length) % available.length);
      } else if (e.key === 'f') {
        e.preventDefault();
        if (document.fullscreenElement) document.exitFullscreen?.();
        else document.documentElement.requestFullscreen?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [available.length]);

  const current = available[sectionIdx] ?? 'routine';
  const clockStr = clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const SECTION_ICONS: Record<Section, typeof Clock> = {
    routine: Clock,
    lessons: BookOpen,
    menu: UtensilsCrossed,
    announcements: Megaphone,
    insights: Lightbulb,
  };
  const SECTION_TITLES: Record<Section, string> = {
    routine: 'Daily Routine',
    lessons: 'Lessons',
    menu: "Today's Menu",
    announcements: 'Announcements',
    insights: 'Insights',
  };

  const Icon = SECTION_ICONS[current];

  return (
    <div className="display-root tv-mode" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', cursor: 'none' }}>
      {/* Top bar: branding + clock */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'clamp(1rem, 2.5vw, 2rem) clamp(1.5rem, 3vw, 3rem)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Image src="/icon-192.png" alt="EduDash Pro" width={48} height={48} style={{ borderRadius: 12 }} />
          <div>
            <h1 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', fontWeight: 800, color: 'var(--text-primary)' }}>
              EduDash Pro
            </h1>
            {data?.dateLabel && (
              <p style={{ fontSize: 'clamp(0.9rem, 1.6vw, 1.2rem)', color: 'var(--text-secondary)', marginTop: 2 }}>
                {data.dayName}, {data.dateLabel}
              </p>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 'clamp(2rem, 4vw, 3.2rem)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
            {clockStr}
          </p>
        </div>
      </header>

      {/* Section indicator dots */}
      {available.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 'clamp(0.5rem, 1vw, 1rem)' }}>
          {available.map((s, i) => (
            <div
              key={s}
              style={{
                width: i === sectionIdx ? 28 : 10,
                height: 10,
                borderRadius: 5,
                background: i === sectionIdx ? 'var(--primary)' : 'rgba(148,163,184,0.3)',
                transition: 'all 0.3s ease',
              }}
            />
          ))}
        </div>
      )}

      {/* Main content */}
      <main style={{
        flex: 1, padding: 'clamp(1rem, 2vw, 2rem) clamp(1.5rem, 3vw, 3rem)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 'clamp(1rem, 2vw, 1.5rem)' }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16,
            background: 'rgba(124, 58, 237, 0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon style={{ width: 28, height: 28, color: 'var(--primary)' }} />
          </div>
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.2vw, 2.6rem)', fontWeight: 700, color: 'var(--text-primary)' }}>
            {SECTION_TITLES[current]}
          </h2>
        </div>

        <div style={{
          flex: 1, fontSize: 'clamp(1.2rem, 2vw, 1.6rem)', lineHeight: 1.7,
          color: 'var(--text-primary)', overflowY: 'auto',
        }}>
          {current === 'routine' && data?.routine?.blocks?.length ? (
            <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 'clamp(0.6rem, 1.2vw, 1rem)' }}>
              {data.routine.blocks.map((block) => (
                <li key={block.id} className="display-glass-routine-block" style={{ padding: 'clamp(0.8rem, 1.5vw, 1.2rem)', borderRadius: 12 }}>
                  <span style={{ fontFamily: 'monospace', color: '#c4b5fd', marginRight: 12, fontSize: '0.9em' }}>
                    {block.startTime}–{block.endTime}
                  </span>
                  <span style={{ fontWeight: 600 }}>{block.title}</span>
                </li>
              ))}
            </ul>
          ) : current === 'lessons' && data?.lessons?.length ? (
            <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 'clamp(0.8rem, 1.5vw, 1.2rem)' }}>
              {data.lessons.map((lesson) => (
                <li key={lesson.id} style={{ borderBottom: '1px solid rgba(148,163,184,0.15)', paddingBottom: 12 }}>
                  <span style={{ fontFamily: 'monospace', color: '#c4b5fd', marginRight: 12, fontSize: '0.9em' }}>
                    {formatTime(lesson.scheduled_at)}
                  </span>
                  <span style={{ fontWeight: 600 }}>{lesson.title}</span>
                  {lesson.duration_minutes != null && (
                    <span style={{ color: 'var(--text-secondary)', marginLeft: 8, fontSize: '0.85em' }}>
                      ({lesson.duration_minutes} min)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : current === 'menu' && data?.menuToday ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'clamp(1rem, 2vw, 2rem)' }}>
              {data.menuToday.breakfast?.length ? (
                <div>
                  <p style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8 }}>Breakfast</p>
                  <ul style={{ listStyle: 'disc', paddingLeft: 20 }}>
                    {data.menuToday.breakfast.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </div>
              ) : null}
              {data.menuToday.lunch?.length ? (
                <div>
                  <p style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8 }}>Lunch</p>
                  <ul style={{ listStyle: 'disc', paddingLeft: 20 }}>
                    {data.menuToday.lunch.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </div>
              ) : null}
              {data.menuToday.snack?.length ? (
                <div>
                  <p style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8 }}>Snack</p>
                  <ul style={{ listStyle: 'disc', paddingLeft: 20 }}>
                    {data.menuToday.snack.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : current === 'announcements' && data?.announcements?.length ? (
            <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 'clamp(0.8rem, 1.5vw, 1.2rem)' }}>
              {data.announcements.map((a) => (
                <li key={a.id} className="display-glass" style={{ padding: 'clamp(0.8rem, 1.5vw, 1.2rem)', borderRadius: 12 }}>
                  <p style={{ fontWeight: 700 }}>{a.title}</p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9em', marginTop: 4 }}>{a.body_preview}</p>
                </li>
              ))}
            </ul>
          ) : current === 'insights' && data?.insights?.bullets?.length ? (
            <ul style={{ listStyle: 'disc', paddingLeft: 24, display: 'grid', gap: 8 }}>
              {data.insights.bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          ) : (
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem' }}>No content available for this section.</p>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        textAlign: 'center', padding: 'clamp(0.5rem, 1vw, 1rem)',
        color: 'var(--muted)', fontSize: 'clamp(0.7rem, 1.1vw, 0.85rem)',
      }}>
        Auto-refreshes every minute · Press ← → to navigate · Press F for fullscreen
      </footer>
    </div>
  );
}

export default function SignagePage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontSize: '1.4rem', color: 'var(--muted)' }}>Loading signage…</p>
        </div>
      }
    >
      <SignageClient />
    </Suspense>
  );
}
