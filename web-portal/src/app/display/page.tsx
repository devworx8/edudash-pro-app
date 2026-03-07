'use client';

import { Suspense } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useDisplayData } from '@/lib/display/useDisplayData';
import type { DisplayData, DisplayRoutineBlock, DisplayLessonWithDetails } from '@/lib/display/types';
import { buildOfflineTvPackPayload, exportOfflineTvPack } from '@/lib/display/offlineTvPack';
import { clampPercent, ratioToPercent } from '@/lib/ui/clampPercent';
import {
  BookOpen,
  UtensilsCrossed,
  Megaphone,
  Lightbulb,
  Clock,
  BellRing,
  Volume2,
  VolumeX,
  HardDriveDownload,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

function EmptySectionNotice({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center opacity-60">
      <p className="text-lg" style={{ color: 'var(--muted, #888)' }}>{message}</p>
    </div>
  );
}

const SECTION_ROTATION_SEC = 45;
const DISPLAY_DATA_REFRESH_MS = 60 * 1000;
const SECTIONS = ['routine', 'lessons', 'menu', 'announcements', 'insights'] as const;
type DisplaySection = (typeof SECTIONS)[number];
const DISPLAY_UI_VERSION_LABEL = 'Next-Gen UI';
const TRUSTED_TV_STORAGE_KEY = 'edudash.display.trustedTv.v1';

type ReminderEvent = {
  id: string;
  title: string;
  startsAtMs: number;
  source: 'routine' | 'lesson';
};

type CurrentLiveItem = {
  id: string;
  title: string;
  source: 'routine' | 'lesson';
  startMs: number;
  endMs: number;
};

type TrustedTvPairing = {
  token: string;
  expiresAt?: string | null;
  orgId?: string | null;
  classId?: string | null;
};

const REMINDER_THRESHOLDS = [15, 10, 5] as const;

const SECTION_LABELS: Record<DisplaySection, string> = {
  routine: 'Routine',
  lessons: 'Lessons',
  menu: 'Menu',
  announcements: 'Announcements',
  insights: 'Insights',
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso.slice(11, 16);
  }
}

function formatClockLabel(dateMs: number): string {
  return new Date(dateMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function parseDateWithClock(dateLabel: string, clock: string | null): number | null {
  if (!clock) return null;
  const normalized = String(clock).trim();
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  const date = new Date(`${dateLabel}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function readTrustedTvPairingStorage(): TrustedTvPairing | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(TRUSTED_TV_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TrustedTvPairing;
    if (!parsed || typeof parsed.token !== 'string' || !parsed.token.trim()) return null;
    return {
      token: parsed.token.trim(),
      expiresAt: parsed.expiresAt || null,
      orgId: parsed.orgId || null,
      classId: parsed.classId || null,
    };
  } catch {
    return null;
  }
}

function writeTrustedTvPairingStorage(pairing: TrustedTvPairing): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TRUSTED_TV_STORAGE_KEY, JSON.stringify(pairing));
}

function clearTrustedTvPairingStorage(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TRUSTED_TV_STORAGE_KEY);
}

function hasMenuItems(data: NonNullable<DisplayData>): boolean {
  return Boolean(
    data.menuToday &&
      (data.menuToday.breakfast?.length || data.menuToday.lunch?.length || data.menuToday.snack?.length)
  );
}

function playThresholdChime(threshold: number): void {
  if (typeof window === 'undefined') return;
  try {
    const audioWindow = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctx = audioWindow.AudioContext || audioWindow.webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();
    const gain = ctx.createGain();
    gain.gain.value = threshold === 5 ? 0.3 : threshold === 10 ? 0.24 : 0.2;
    gain.connect(ctx.destination);

    const signature: Record<number, number[]> = {
      15: [523, 659],
      10: [659, 784, 659],
      5: [880, 988, 1174, 988],
    };
    const tones = signature[threshold] || [660, 880];
    let cursor = ctx.currentTime;

    tones.forEach((freq) => {
      const oscillator = ctx.createOscillator();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(freq, cursor);
      oscillator.connect(gain);

      oscillator.start(cursor);
      oscillator.stop(cursor + 0.25);
      cursor += 0.34;
    });

    window.setTimeout(() => {
      void ctx.close();
    }, 2200);
  } catch {
    // Visual overlay remains active when audio autoplay is blocked.
  }
}

const NEXTGEN_PILL =
  'rounded-full border border-slate-600/50 bg-slate-800/70 px-3 py-1.5 text-xs font-semibold transition-all hover:border-[var(--primary)]/50 hover:bg-[var(--primary-subtle)] text-[var(--text-secondary)]';
const NEXTGEN_PILL_ACTIVE =
  'rounded-full border border-[var(--primary)]/60 bg-gradient-to-r from-[var(--primary)]/35 to-fuchsia-500/30 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] shadow-[0_8px_24px_-16px_rgba(124,58,237,0.7)]';

function EmptyCardState({
  title,
  message,
  checklist,
}: {
  title: string;
  message: string;
  checklist?: string[];
}) {
  return (
    <div className="card">
      <p className="text-lg font-semibold text-white">{title}</p>
      <p className="mt-3 text-sm text-slate-400 leading-tight">{message}</p>
      {checklist && checklist.length > 0 && (
        <ul className="mt-4 grid gap-3">
          {checklist.map((item) => (
            <li key={item} className="flex items-center gap-2 text-xs sm:text-sm text-slate-400 font-medium leading-tight">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-violet-400" />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Find the lesson whose scheduled_at falls within a routine block's time window (same day). */
function getLessonForBlock(
  block: DisplayRoutineBlock,
  dateLabel: string,
  lessons: DisplayLessonWithDetails[]
): DisplayLessonWithDetails | null {
  if (block.linkedLesson) {
    return block.linkedLesson;
  }
  const blockStartMs = parseDateWithClock(dateLabel, block.startTime);
  const blockEndMs = parseDateWithClock(dateLabel, block.endTime);
  if (blockStartMs == null || blockEndMs == null) return null;
  for (const lesson of lessons) {
    const lessonStartMs = new Date(lesson.scheduled_at).getTime();
    if (Number.isFinite(lessonStartMs) && lessonStartMs >= blockStartMs && lessonStartMs < blockEndMs) {
      return lesson;
    }
  }
  return null;
}

function SectionRoutine({
  data,
  nowMs,
}: {
  data: NonNullable<DisplayData>;
  nowMs?: number;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedBlockId, setExpandedBlockId] = useState<string | null>(null);
  const { routine, themeLabel, dateLabel, lessons } = data;
  const currentBlockId = useMemo(() => {
    if (!routine?.blocks?.length || nowMs == null) return null;
    for (const block of routine.blocks) {
      const startMs = parseDateWithClock(dateLabel, block.startTime);
      const endMs = parseDateWithClock(dateLabel, block.endTime);
      if (startMs != null && endMs != null && nowMs >= startMs && nowMs < endMs) {
        return block.id;
      }
    }
    return null;
  }, [routine?.blocks, dateLabel, nowMs]);

  const handleHeaderKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsExpanded((prev) => !prev);
    }
  };

  return (
    <section className="card display-glass relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.12),transparent_55%)]" />
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          onKeyDown={handleHeaderKeyDown}
          aria-expanded={isExpanded}
          className="display-routine-toggle flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg text-left transition-colors hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/50"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl shadow-md" style={{ backgroundColor: 'rgba(124, 58, 237, 0.2)' }}>
              <Clock className="h-5 w-5" style={{ color: 'var(--primary)' }} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="sectionTitle" style={{ marginBottom: 0 }}>Today&apos;s routine</span>
              {routine?.blocks?.length ? (
                <span className="display-routine-count">
                  {routine.blocks.length} blocks planned
                </span>
              ) : null}
            </span>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-6 w-6 shrink-0" style={{ color: 'var(--text-secondary)' }} />
          ) : (
            <ChevronDown className="h-6 w-6 shrink-0" style={{ color: 'var(--text-secondary)' }} />
          )}
        </button>
        {themeLabel && (
          <p className="display-routine-theme section-subtitle">Theme: {themeLabel}</p>
        )}
        {isExpanded && (
          <>
            {routine?.blocks?.length ? (
              <ul className="display-routine-list">
                {routine.blocks.map((block) => {
                  const isActive = currentBlockId === block.id;
                  const linkedLesson = getLessonForBlock(block, dateLabel, lessons ?? []);
                  const isBlockExpanded = expandedBlockId === block.id;
                  const toggleBlock = () => setExpandedBlockId((id) => (id === block.id ? null : block.id));
                  return (
                    <li
                      key={block.id}
                      className={`display-routine-item rounded-xl overflow-hidden ${
                        isActive
                          ? 'display-glass-routine-block-active'
                          : 'display-glass-routine-block'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={toggleBlock}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleBlock();
                          }
                        }}
                        aria-expanded={isBlockExpanded}
                        className="display-routine-row flex w-full cursor-pointer items-center gap-4 text-left transition-colors hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--primary)]/50"
                      >
                        <span className="display-routine-time min-w-[5rem] font-mono" style={{ color: '#c4b5fd' }}>
                          {block.startTime ?? '–'}–{block.endTime ?? '–'}
                        </span>
                        <span className={`display-routine-title flex-1 ${isActive ? 'font-semibold' : ''}`} style={{ color: 'var(--text-primary)' }}>
                          {block.title}
                          {block.lessonLinkSource && (
                            <span
                              className="ml-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                              style={{
                                borderColor: block.lessonLinkSource === 'manual' ? 'rgba(236,72,153,0.35)' : 'rgba(139,92,246,0.4)',
                                background:
                                  block.lessonLinkSource === 'manual'
                                    ? 'rgba(236,72,153,0.14)'
                                    : 'rgba(124,58,237,0.16)',
                                color: block.lessonLinkSource === 'manual' ? '#f9a8d4' : '#c4b5fd',
                              }}
                            >
                              {block.lessonLinkSource}
                            </span>
                          )}
                        </span>
                        {isBlockExpanded ? (
                          <ChevronUp className="h-5 w-5 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                        ) : (
                          <ChevronDown className="h-5 w-5 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                        )}
                      </button>
                      {isBlockExpanded && (
                        <div className="display-routine-detail border-t border-white/[0.06]" style={{ color: 'var(--text-secondary)' }}>
                          {linkedLesson ? (
                            <div className="space-y-4">
                              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{linkedLesson.title}</p>
                              {linkedLesson.description && (
                                <p className="text-sm">{linkedLesson.description}</p>
                              )}
                              {linkedLesson.steps && linkedLesson.steps.length > 0 ? (
                                <div>
                                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>What to do next</p>
                                  <ol className="list-decimal space-y-2 pl-5">
                                    {linkedLesson.steps.map((step, i) => (
                                      <li key={i}>
                                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{step.title}</span>
                                        {step.duration ? <span className="ml-2 text-sm opacity-90">({step.duration})</span> : null}
                                        {step.description ? <p className="mt-0.5 text-sm opacity-90">{step.description}</p> : null}
                                      </li>
                                    ))}
                                  </ol>
                                </div>
                              ) : null}
                              {linkedLesson.media?.resources && linkedLesson.media.resources.length > 0 ? (
                                <div>
                                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Resources</p>
                                  <ul className="list-disc pl-5 text-sm">
                                    {linkedLesson.media.resources.map((r, i) => (
                                      <li key={i}>{r.title}</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <p className="text-sm">
                              No lesson scheduled for this block. Schedule a lesson in the teacher dashboard for this time to see instructions here.
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyCardState
                title="Routine pending"
                message="No routine blocks found for today yet."
                checklist={[
                  'Generate and save the weekly routine in the principal planner.',
                  'Ensure today has published routine blocks with start/end times.',
                ]}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}

function SectionLessons({ data }: { data: NonNullable<DisplayData> }) {
  const { lessons } = data;
  return (
    <section className="card display-glass relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.1),transparent_55%)]" />
      <div className="relative flex items-center gap-3 mb-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl shadow-md" style={{ backgroundColor: 'rgba(124, 58, 237, 0.2)' }}>
          <BookOpen className="h-5 w-5 text-violet-300" />
        </span>
        <h2 className="sectionTitle" style={{ marginBottom: 0 }}>Lessons of the day</h2>
      </div>
      {lessons?.length ? (
        <ul className="display-section-body space-y-5 text-base leading-relaxed">
          {lessons.map((lesson) => (
            <li key={lesson.id} className="border-b border-slate-700/60 px-1 pb-5 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-lg text-violet-300">
                  {formatTime(lesson.scheduled_at)}
                </span>
                <span className="text-xl font-semibold text-white">{lesson.title}</span>
                {lesson.duration_minutes != null && (
                  <span className="text-slate-400">{lesson.duration_minutes} min</span>
                )}
              </div>
              {lesson.description && (
                <p className="mt-1 text-slate-300">{lesson.description}</p>
              )}
              {lesson.steps?.length ? (
                <div className="mt-3 pl-4">
                  <p className="mb-1 text-sm font-medium text-slate-400">Steps</p>
                  <ol className="list-decimal space-y-1 text-lg text-slate-200">
                    {lesson.steps.slice(0, 5).map((step, i) => (
                      <li key={i}>
                        {step.title}
                        {step.duration ? ` (${step.duration})` : ''}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
              {lesson.media?.resources?.length ? (
                <div className="mt-2 text-slate-400">
                  Resources: {lesson.media.resources.map((r) => r.title).join(', ')}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyCardState
          title="No lessons scheduled"
          message="Add a scheduled lesson and it will appear here in real time."
          checklist={[
            'Schedule at least one lesson for today.',
            'Set lesson duration so reminder alerts can trigger.',
          ]}
        />
      )}
    </section>
  );
}

function SectionMenu({ data }: { data: NonNullable<DisplayData> }) {
  const { menuToday } = data;
  const hasAny = hasMenuItems(data);
  return (
    <section className="card display-glass relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.1),transparent_55%)]" />
      <div className="relative flex items-center gap-3 mb-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl shadow-md" style={{ backgroundColor: 'rgba(124, 58, 237, 0.2)' }}>
          <UtensilsCrossed className="h-5 w-5 text-violet-300" />
        </span>
        <h2 className="sectionTitle" style={{ marginBottom: 0 }}>Today&apos;s menu</h2>
      </div>
      {hasAny && menuToday ? (
        <div className="display-section-body grid gap-5 text-xl leading-relaxed sm:grid-cols-3">
          {menuToday.breakfast?.length ? (
            <div>
              <p className="mb-1 font-medium text-slate-400">Breakfast</p>
              <ul className="text-white">
                {menuToday.breakfast.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {menuToday.lunch?.length ? (
            <div>
              <p className="mb-1 font-medium text-slate-400">Lunch</p>
              <ul className="text-white">
                {menuToday.lunch.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {menuToday.snack?.length ? (
            <div>
              <p className="mb-1 font-medium text-slate-400">Snack</p>
              <ul className="text-white">
                {menuToday.snack.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <EmptyCardState
          title="Menu not published"
          message="No breakfast/lunch/snack items were found for today."
          checklist={['Publish this week menu to include breakfast/lunch/snack entries.']}
        />
      )}
    </section>
  );
}

function SectionAnnouncements({ data }: { data: NonNullable<DisplayData> }) {
  const { announcements } = data;
  return (
    <section className="card display-glass relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.1),transparent_55%)]" />
      <div className="relative flex items-center gap-3 mb-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl shadow-md" style={{ backgroundColor: 'rgba(124, 58, 237, 0.2)' }}>
          <Megaphone className="h-5 w-5 text-violet-300" />
        </span>
        <h2 className="sectionTitle" style={{ marginBottom: 0 }}>Announcements</h2>
      </div>
      {announcements?.length ? (
        <ul className="display-section-body space-y-4 text-base leading-relaxed">
          {announcements.map((a) => (
            <li key={a.id} className="rounded-lg bg-slate-800/40 px-4 py-3">
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{a.title}</p>
              <p className="text-slate-300">{a.body_preview}</p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyCardState
          title="Quiet channel"
          message="No announcements are queued for display right now."
          checklist={['Share a principal or teacher announcement to pin school notices here.']}
        />
      )}
    </section>
  );
}

function SectionInsights({ data }: { data: NonNullable<DisplayData> }) {
  const { insights } = data;
  return (
    <section className="card display-glass relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.1),transparent_55%)]" />
      <div className="relative flex items-center gap-3 mb-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl shadow-md" style={{ backgroundColor: 'rgba(124, 58, 237, 0.2)' }}>
          <Lightbulb className="h-5 w-5 text-violet-300" />
        </span>
        <h2 className="sectionTitle" style={{ marginBottom: 0 }}>{insights?.title || 'Class insights'}</h2>
      </div>
      {insights?.bullets?.length ? (
        <ul className="display-section-body list-disc space-y-3 pl-6 pr-2 text-lg leading-relaxed text-slate-200">
          {insights.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      ) : (
        <EmptyCardState
          title="Insights pending"
          message="AI insights will appear when enough recent classroom data is available."
          checklist={['Insights appear after routine and lesson activity accumulates over time.']}
        />
      )}
    </section>
  );
}

function DisplayPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgParam = searchParams.get('org');
  const classParam = searchParams.get('class');
  const tokenParam = searchParams.get('token');
  const codeParam = searchParams.get('code')?.trim().toUpperCase() || null;
  const [userId, setUserId] = useState<string | undefined>();
  const [authResolved, setAuthResolved] = useState(false);
  const [trustedTvReady, setTrustedTvReady] = useState(false);
  const [trustedTvPairing, setTrustedTvPairing] = useState<TrustedTvPairing | null>(null);
  const [tokenData, setTokenData] = useState<DisplayData | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [displayLinkUrl, setDisplayLinkUrl] = useState<string | null>(null);
  const [displayJoinCode, setDisplayJoinCode] = useState<string | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [previewMode, setPreviewMode] = useState<'focus' | 'grid'>('grid');
  const [autoRotatePreview, setAutoRotatePreview] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [reminderSoundEnabled, setReminderSoundEnabled] = useState(true);
  const [reminderNotice, setReminderNotice] = useState<string | null>(null);
  const [thresholdOverlay, setThresholdOverlay] = useState<{ threshold: number; title: string } | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [exportingUsbPack, setExportingUsbPack] = useState(false);
  const [bootTimeoutReached, setBootTimeoutReached] = useState(false);

  const firedReminderKeysRef = useRef<Set<string>>(new Set());
  const pairingAttemptedRef = useRef(false);
  const previewModeSeededRef = useRef(false);

  const supabase = useMemo(() => createClient(), []);
  const { profile, loading: profileLoading } = useUserProfile(userId);

  useEffect(() => {
    setTrustedTvPairing(readTrustedTvPairingStorage());
    setTrustedTvReady(true);
  }, []);

  const orgId = orgParam || profile?.preschoolId || profile?.organizationId || null;
  const classId = classParam || null;
  const trustedTvToken = trustedTvPairing?.token || null;
  const usePairFlow = !!trustedTvToken;
  const useTokenFlow = !!(orgParam && tokenParam);
  const useCodeFlow = !!codeParam && !orgParam && !tokenParam;
  const useTvFlow = usePairFlow || useTokenFlow || useCodeFlow;
  const trustedTvExpiryLabel = useMemo(() => {
    if (!trustedTvPairing?.expiresAt) return null;
    const date = new Date(trustedTvPairing.expiresAt);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
  }, [trustedTvPairing?.expiresAt]);

  const clearTrustedTvPairing = useCallback((notice?: string) => {
    clearTrustedTvPairingStorage();
    setTrustedTvPairing(null);
    pairingAttemptedRef.current = false;
    if (notice) setActionNotice(notice);
  }, []);

  const fetchByPair = useCallback(async () => {
    if (!trustedTvToken) return;
    setTokenLoading(true);
    setTokenError(null);
    try {
      const res = await fetch(`/api/display/data?pair=${encodeURIComponent(trustedTvToken)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 403) {
          clearTrustedTvPairing('Trusted TV pairing expired. Enter a join code to pair this screen again.');
        }
        throw new Error(err.error || `Request failed: ${res.status}`);
      }
      const json = await res.json();
      setTokenData(json as DisplayData);
    } catch (e) {
      setTokenError(e instanceof Error ? e.message : 'Failed to load display');
      setTokenData(null);
    } finally {
      setTokenLoading(false);
    }
  }, [trustedTvToken, clearTrustedTvPairing]);

  const fetchByToken = useCallback(async () => {
    if (!orgParam || !tokenParam) return;
    setTokenLoading(true);
    setTokenError(null);
    try {
      const params = new URLSearchParams({ org: orgParam, token: tokenParam });
      if (classParam) params.set('class', classParam);
      const res = await fetch(`/api/display/data?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed: ${res.status}`);
      }
      const json = await res.json();
      setTokenData(json as DisplayData);
    } catch (e) {
      setTokenError(e instanceof Error ? e.message : 'Failed to load display');
      setTokenData(null);
    } finally {
      setTokenLoading(false);
    }
  }, [orgParam, tokenParam, classParam]);

  const fetchByCode = useCallback(async () => {
    if (!codeParam) return;
    setTokenLoading(true);
    setTokenError(null);
    try {
      const res = await fetch(`/api/display/data?code=${encodeURIComponent(codeParam)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed: ${res.status}`);
      }
      const json = await res.json();
      setTokenData(json as DisplayData);
    } catch (e) {
      setTokenError(e instanceof Error ? e.message : 'Failed to load display');
      setTokenData(null);
    } finally {
      setTokenLoading(false);
    }
  }, [codeParam]);

  useEffect(() => {
    if (usePairFlow) {
      fetchByPair();
      return;
    }
    if (useTokenFlow) {
      fetchByToken();
    } else if (useCodeFlow) {
      fetchByCode();
    }
  }, [usePairFlow, useTokenFlow, useCodeFlow, fetchByPair, fetchByToken, fetchByCode]);

  useEffect(() => {
    if (!trustedTvReady || usePairFlow || pairingAttemptedRef.current) return;
    if (!useCodeFlow && !useTokenFlow) return;

    pairingAttemptedRef.current = true;

    const claimPairing = async () => {
      try {
        const payload = useCodeFlow
          ? { code: codeParam, deviceName: 'TV Display' }
          : { org: orgParam, token: tokenParam, class: classParam, deviceName: 'TV Display' };
        const res = await fetch('/api/display/pair/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) return;

        const json = await res.json().catch(() => null);
        const pairToken = String(json?.pairToken || '').trim();
        if (!pairToken) return;

        const pairing: TrustedTvPairing = {
          token: pairToken,
          expiresAt: json?.expiresAt || null,
          orgId: json?.orgId || null,
          classId: json?.classId || null,
        };
        writeTrustedTvPairingStorage(pairing);
        setTrustedTvPairing(pairing);
        setActionNotice(
          `Trusted TV paired successfully. This screen will stay connected for ${Number(json?.expiresInDays) || 180} days.`,
        );
        router.replace('/display');
      } catch {
        // Best-effort: existing 24h flow still works if pairing claim fails.
      }
    };

    void claimPairing();
  }, [trustedTvReady, usePairFlow, useCodeFlow, useTokenFlow, codeParam, orgParam, tokenParam, classParam, router]);

  useEffect(() => {
    if (!useTvFlow || !tokenData) return;
    const fn = usePairFlow ? fetchByPair : (useCodeFlow ? fetchByCode : fetchByToken);
    const t = setInterval(fn, DISPLAY_DATA_REFRESH_MS);
    return () => clearInterval(t);
  }, [useTvFlow, usePairFlow, useCodeFlow, tokenData, fetchByPair, fetchByToken, fetchByCode]);

  const {
    data: sessionData,
    loading: sessionLoading,
    error: sessionError,
    refetch: refetchSession,
  } = useDisplayData({
    orgId: useTvFlow ? null : orgId,
    classId,
    enabled: !!orgId && !useTvFlow,
  });

  const data = useTvFlow ? tokenData : sessionData;
  const loading = useTvFlow ? tokenLoading : sessionLoading;
  const error = useTvFlow ? tokenError : sessionError;
  const refetch = useTvFlow
    ? (usePairFlow ? fetchByPair : (useCodeFlow ? fetchByCode : fetchByToken))
    : refetchSession;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refresh = () => {
      void refetch();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refetch]);

  const dataHealth = useMemo(() => {
    if (!data) {
      return {
        routineBlocks: 0,
        lessonBlocks: 0,
        menuItems: 0,
        announcements: 0,
        insightBullets: 0,
        filledSections: 0,
      };
    }
    const routineBlocks = data.routine?.blocks?.length || 0;
    const lessonBlocks = data.lessons?.length || 0;
    const menuItems = (data.menuToday?.breakfast?.length || 0) + (data.menuToday?.lunch?.length || 0) + (data.menuToday?.snack?.length || 0);
    const announcements = data.announcements?.length || 0;
    const insightBullets = data.insights?.bullets?.length || 0;
    const filledSections = [routineBlocks > 0, lessonBlocks > 0, menuItems > 0, announcements > 0, insightBullets > 0]
      .filter(Boolean)
      .length;
    return {
      routineBlocks,
      lessonBlocks,
      menuItems,
      announcements,
      insightBullets,
      filledSections,
    };
  }, [data]);

  const noContentSignal = dataHealth.filledSections === 0;

  useEffect(() => {
    if (data) setLastUpdatedAt(new Date());
  }, [data]);

  useEffect(() => {
    if (!actionNotice) return;
    const timeout = window.setTimeout(() => setActionNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [actionNotice]);

  useEffect(() => {
    if (useTvFlow || previewModeSeededRef.current) return;
    if (typeof window === 'undefined') return;
    previewModeSeededRef.current = true;
    if (window.matchMedia('(max-width: 840px)').matches) {
      setPreviewMode('focus');
    }
  }, [useTvFlow]);

  useEffect(() => {
    if (useTvFlow) {
      setAuthResolved(true);
      return;
    }
    const init = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user?.id) setUserId(session.user.id);
      } catch {
        // If auth bootstrap fails on TV/browser, continue to join-code view instead of hanging.
      } finally {
        setAuthResolved(true);
      }
    };
    void init();
  }, [supabase, useTvFlow]);

  useEffect(() => {
    if (useTvFlow) {
      setBootTimeoutReached(false);
      return;
    }
    setBootTimeoutReached(false);
    const timeout = window.setTimeout(() => setBootTimeoutReached(true), 6000);
    return () => window.clearTimeout(timeout);
  }, [useTvFlow]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const reminderEvents = useMemo<ReminderEvent[]>(() => {
    if (!data) return [];

    const events: ReminderEvent[] = [];
    data.routine?.blocks?.forEach((block) => {
      const startsAtMs = parseDateWithClock(data.dateLabel, block.startTime);
      if (!startsAtMs) return;
      events.push({
        id: `routine:${block.id}`,
        title: block.title || 'Routine block',
        startsAtMs,
        source: 'routine',
      });
    });

    data.lessons?.forEach((lesson) => {
      const startsAtMs = new Date(lesson.scheduled_at).getTime();
      if (!Number.isFinite(startsAtMs)) return;
      events.push({
        id: `lesson:${lesson.id}`,
        title: lesson.title || 'Lesson',
        startsAtMs,
        source: 'lesson',
      });
    });

    return events.sort((a, b) => a.startsAtMs - b.startsAtMs);
  }, [data]);

  const nextReminderEvent = useMemo(
    () => reminderEvents.find((event) => event.startsAtMs > nowMs) || null,
    [reminderEvents, nowMs]
  );

  const upcomingEvents = useMemo(
    () => reminderEvents.filter((event) => event.startsAtMs > nowMs).slice(0, 4),
    [reminderEvents, nowMs]
  );

  const currentLiveItem = useMemo<CurrentLiveItem | null>(() => {
    if (!data) return null;

    const currentRoutine = (data.routine?.blocks || [])
      .map((block) => {
        const startMs = parseDateWithClock(data.dateLabel, block.startTime);
        const endMs = parseDateWithClock(data.dateLabel, block.endTime);
        if (!startMs || !endMs || endMs <= startMs) return null;
        return {
          id: `routine:${block.id}`,
          title: block.title || 'Routine block',
          source: 'routine' as const,
          startMs,
          endMs,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .find((item) => nowMs >= item.startMs && nowMs < item.endMs);

    if (currentRoutine) return currentRoutine;

    const currentLesson = (data.lessons || [])
      .map((lesson) => {
        const startMs = new Date(lesson.scheduled_at).getTime();
        if (!Number.isFinite(startMs)) return null;
        const durationMin = Number(lesson.duration_minutes) || 30;
        const endMs = startMs + durationMin * 60_000;
        return {
          id: `lesson:${lesson.id}`,
          title: lesson.title || 'Lesson',
          source: 'lesson' as const,
          startMs,
          endMs,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .find((item) => nowMs >= item.startMs && nowMs < item.endMs);

    return currentLesson || null;
  }, [data, nowMs]);

  const currentLiveProgressPct = currentLiveItem
    ? ratioToPercent(nowMs - currentLiveItem.startMs, currentLiveItem.endMs - currentLiveItem.startMs)
    : 0;

  const dismissReminderOverlay = useCallback(() => {
    setReminderNotice(null);
    setThresholdOverlay(null);
  }, []);

  const handleExportUsbPack = useCallback(() => {
    if (!data) {
      setActionNotice('Cannot export yet. Room data is still loading.');
      return;
    }
    try {
      setExportingUsbPack(true);
      const payload = buildOfflineTvPackPayload(data, {
        orgId,
        classId,
      });
      exportOfflineTvPack(payload);
      setActionNotice('Offline TV Pack downloaded: HTML + JSON + README.');
    } catch (err) {
      setActionNotice(err instanceof Error ? err.message : 'Failed to export Offline TV Pack.');
    } finally {
      window.setTimeout(() => setExportingUsbPack(false), 500);
    }
  }, [classId, data, orgId]);

  const nextReminderMinutes = nextReminderEvent
    ? Math.max(0, Math.ceil((nextReminderEvent.startsAtMs - nowMs) / 60_000))
    : null;

  useEffect(() => {
    if (!nextReminderEvent) return;

    const msUntil = nextReminderEvent.startsAtMs - nowMs;
    if (msUntil <= 0 || msUntil > 15 * 60_000) return;

    const threshold = REMINDER_THRESHOLDS.find(
      (minute) => msUntil <= minute * 60_000 && msUntil > (minute - 1) * 60_000
    );
    if (!threshold) return;

    const reminderKey = `${nextReminderEvent.id}:${threshold}`;
    if (firedReminderKeysRef.current.has(reminderKey)) return;

    firedReminderKeysRef.current.add(reminderKey);
    const message = `${threshold}-minute reminder • ${nextReminderEvent.title}`;
    setReminderNotice(message);
    setThresholdOverlay({ threshold, title: nextReminderEvent.title });
    if (reminderSoundEnabled) {
      playThresholdChime(threshold);
    }

    const timeoutId = window.setTimeout(() => {
      setReminderNotice((current) => (current === message ? null : current));
      setThresholdOverlay((current) =>
        current?.title === nextReminderEvent.title && current?.threshold === threshold ? null : current,
      );
    }, 9000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [nextReminderEvent, nowMs, reminderSoundEnabled]);

  useEffect(() => {
    if (!thresholdOverlay) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        dismissReminderOverlay();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [thresholdOverlay, dismissReminderOverlay]);

  // Keyboard / D-pad navigation for TV remotes
  useEffect(() => {
    if (!useTvFlow) return;
    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          setCurrentSectionIndex((i) => (i + 1) % Math.max(1, availableSections.length));
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          setCurrentSectionIndex((i) => (i - 1 + availableSections.length) % Math.max(1, availableSections.length));
          break;
        case 'F11':
          // Let browser handle fullscreen toggle
          break;
        case 'f': {
          // 'f' key toggles fullscreen as a TV-friendly shortcut
          e.preventDefault();
          if (document.fullscreenElement) {
            document.exitFullscreen?.();
          } else {
            document.documentElement.requestFullscreen?.();
          }
          break;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [useTvFlow, availableSections.length]);

  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const availableSections = useMemo(() => {
    if (!data) return SECTIONS;
    const out: DisplaySection[] = [];
    if (data.routine?.blocks?.length || data.themeLabel) out.push('routine');
    if (data.lessons?.length) out.push('lessons');
    if (hasMenuItems(data)) out.push('menu');
    if (data.announcements?.length) out.push('announcements');
    if (data.insights?.bullets?.length) out.push('insights');
    return out.length ? out : SECTIONS;
  }, [data]);

  const showRotation = availableSections.length > 1;
  const showAllSections = !useTvFlow && (previewMode === 'grid' || noContentSignal);
  const rotationEnabled = showRotation && !showAllSections && (useTvFlow || autoRotatePreview);

  useEffect(() => {
    if (!rotationEnabled) return;
    const t = setInterval(() => {
      setCurrentSectionIndex((i) => (i + 1) % Math.max(1, availableSections.length));
    }, SECTION_ROTATION_SEC * 1000);
    return () => clearInterval(t);
  }, [rotationEnabled, availableSections.length]);

  useEffect(() => {
    setCurrentSectionIndex((i) => (i >= availableSections.length ? 0 : i));
  }, [availableSections.length]);

  const currentSection = availableSections[currentSectionIndex] ?? availableSections[0] ?? 'routine';

  const renderSection = useCallback(
    (section: DisplaySection) => {
      if (!data) return null;
      if (section === 'routine') return <SectionRoutine data={data} nowMs={nowMs} />;
      if (section === 'lessons') return <SectionLessons data={data} />;
      if (section === 'menu') return <SectionMenu data={data} />;
      if (section === 'announcements') return <SectionAnnouncements data={data} />;
      return <SectionInsights data={data} />;
    },
    [data, nowMs]
  );

  if (!trustedTvReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-xl" style={{ color: 'var(--muted)' }}>Preparing display…</p>
      </div>
    );
  }

  if (!useTvFlow && !bootTimeoutReached && (!authResolved || (userId && profileLoading)) && !orgId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-xl" style={{ color: 'var(--muted)' }}>Preparing display…</p>
      </div>
    );
  }

  if (!useTvFlow && authResolved && !profileLoading && !orgId && !userId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 sm:p-8">
        <div
          className="w-full max-w-lg rounded-3xl p-8 sm:p-10 shadow-2xl backdrop-blur-xl"
          style={{
            background: 'linear-gradient(145deg, var(--surface-1) 0%, var(--surface-2) 50%, var(--card) 100%)',
            border: '1px solid var(--border)',
            boxShadow:
              '0 0 0 1px rgba(255,255,255,0.05), 0 25px 50px -12px rgba(0,0,0,0.5), 0 0 80px -20px var(--primary-subtle)',
          }}
        >
          <div className="mb-6 flex justify-center">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
              style={{ background: 'var(--primary-subtle)', color: 'var(--primary)' }}
            >
              <Clock className="h-8 w-8" />
            </div>
          </div>
          <h1 className="text-center text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: 'var(--text-primary)' }}>
            Room Display
          </h1>
          <p className="mt-2 text-center text-sm" style={{ color: 'var(--muted)' }}>
            Show routine, lessons, menu and announcements on a TV. This page auto-refreshes every minute.
          </p>

          <div className="mt-8 rounded-2xl p-5" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              How to get the link on the TV
            </h2>
            <ol className="mt-4 space-y-3 text-[var(--text-secondary)]">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: 'var(--primary)', color: 'white' }}>1</span>
                On your phone or laptop, <strong style={{ color: 'var(--text-primary)' }}>sign in</strong> to EduDash Pro.
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: 'var(--primary)', color: 'white' }}>2</span>
                Open <strong style={{ color: 'var(--text-primary)' }}>Dashboard</strong> and tap or click <strong style={{ color: 'var(--primary)' }}>&quot;Daily Room (TV)&quot;</strong>.
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: 'var(--primary)', color: 'white' }}>3</span>
                Copy the link, then on the <strong style={{ color: 'var(--text-primary)' }}>TV browser</strong> open that link. No sign-in needed on the TV.
              </li>
            </ol>
          </div>

          <p className="mt-4 text-center text-xs" style={{ color: 'var(--muted)' }}>
            Or on the TV, add <code className="rounded px-1.5 py-0.5" style={{ background: 'var(--surface-2)' }}>?org=...&amp;token=...</code> to the URL (get the full link from a signed-in device).
          </p>

          <div className="mt-6 rounded-2xl p-5" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              On the TV: enter join code
            </h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              Open this page on the TV, then type the 6-character code from your phone or laptop.
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              After first pairing, this TV stays trusted for months and reconnects automatically.
            </p>
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                inputMode="text"
                maxLength={8}
                placeholder="e.g. ABC123"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                className="flex-1 rounded-xl border px-4 py-3 text-center text-lg font-mono font-bold tracking-widest"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              <button
                type="button"
                onClick={() => {
                  const code = joinCodeInput.trim().toUpperCase();
                  if (code.length >= 4) router.push(`/display?code=${encodeURIComponent(code)}`);
                }}
                className="shrink-0 rounded-xl px-6 py-3 text-base font-semibold text-white"
                style={{ background: 'var(--primary)' }}
              >
                Go
              </button>
            </div>
          </div>

          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={() => router.push('/sign-in')}
              className="rounded-xl px-8 py-3.5 text-base font-semibold text-white transition-all hover:scale-[1.02] hover:opacity-90 active:scale-[0.98]"
              style={{ background: 'var(--primary)', boxShadow: '0 4px 14px 0 rgba(124, 58, 237, 0.4)' }}
            >
              Sign in to get TV link
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-xl" style={{ color: 'var(--muted)' }}>Loading display…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
        <p className="text-xl" style={{ color: 'var(--danger)' }}>{error}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-xl px-6 py-3 font-medium text-white transition-colors hover:opacity-90"
          style={{ background: 'var(--primary)' }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-xl" style={{ color: 'var(--muted)' }}>No data for this organisation.</p>
      </div>
    );
  }

  return (
    <div className={`display-root relative min-h-screen overflow-x-hidden overflow-y-auto ${useTvFlow ? 'tv-mode' : ''}`}>
      {thresholdOverlay && (
        <div
          className="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-slate-950/55 backdrop-blur-sm threshold-overlay-backdrop"
          onClick={dismissReminderOverlay}
        >
          <div
            className="threshold-overlay-content rounded-3xl border border-amber-300/40 bg-gradient-to-br from-amber-300/15 to-rose-300/10 px-8 py-7 text-center shadow-[0_24px_80px_-28px_rgba(245,158,11,0.55)]"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-100">Reminder Alert</p>
            <p className="mt-2 text-5xl font-black text-white">{thresholdOverlay.threshold} min</p>
            <p className="mt-3 text-lg font-semibold text-amber-100">{thresholdOverlay.title}</p>
            <p className="mt-1 text-xs text-slate-200">Prepare transition now.</p>
            <button
              type="button"
              onClick={dismissReminderOverlay}
              className="mt-4 rounded-lg border border-amber-200/45 bg-amber-100/15 px-4 py-2 text-xs font-semibold text-amber-50"
            >
              Dismiss
            </button>
            <p className="mt-2 text-[11px] text-amber-100/80">Tap outside, press Enter, or Esc to close.</p>
          </div>
        </div>
      )}
      {/* Container: same max-width and flow as dashboard content (cards on gradient background). */}
      <div className="display-container">
        {actionNotice && (
          <div className="card display-glass mb-4 rounded-2xl border-fuchsia-300/30 bg-fuchsia-500/10 px-4 py-3 text-sm font-semibold text-fuchsia-100 backdrop-blur-md">
            {actionNotice}
          </div>
        )}
        {reminderNotice && (
          <div className="card display-glass mb-4 rounded-2xl border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100 backdrop-blur-md">
            {reminderNotice}
          </div>
        )}

        <header className="card display-glass-header display-header-shell mb-8 flex flex-wrap items-start justify-between gap-6 rounded-2xl">
          <div className="display-header-brand min-w-0">
            <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-widest" style={{ borderColor: 'rgba(139,92,246,0.4)', background: 'var(--primary-subtle)', color: '#ddd6fe' }}>{DISPLAY_UI_VERSION_LABEL}</span>
            <h1 className="display-title mt-3 flex items-center gap-3 font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              <Image
                src="/icon-192.png"
                alt="EduDash Pro"
                width={40}
                height={40}
                className="h-9 w-9 shrink-0 rounded-xl object-contain md:h-10 md:w-10"
              />
              EduDash Pro – Room Display
            </h1>
            <p className="display-date mt-2" style={{ color: 'var(--text-secondary)' }}>
              {data.dayName}, {data.dateLabel}
            </p>
            <div className="display-header-meta-row mt-3">
              <span className="display-meta-pill">
                {useTvFlow ? 'Live TV mode' : 'Desktop preview'}
              </span>
              {lastUpdatedAt ? (
                <span className="display-meta-pill">
                  Updated {lastUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              ) : null}
              {usePairFlow ? (
                <span className="display-meta-pill display-meta-pill-accent">
                  Trusted TV paired{trustedTvExpiryLabel ? ` • Expires ${trustedTvExpiryLabel}` : ''}
                </span>
              ) : null}
            </div>
          </div>

          <div className="display-header-right flex w-full min-w-0 flex-col items-stretch gap-2 md:w-auto md:max-w-[460px] md:items-end">
            <div className="card display-glass display-reminder-card w-full rounded-2xl">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Upcoming reminder</p>
                <button
                  type="button"
                  onClick={() => setReminderSoundEnabled((prev) => !prev)}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors ${reminderSoundEnabled ? 'border-[var(--primary)]/50' : 'border-slate-600/50'}`}
                  style={{ background: reminderSoundEnabled ? 'var(--primary-subtle)' : 'rgba(15,23,42,0.72)', color: 'var(--text-secondary)' }}
                >
                  {reminderSoundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                  {reminderSoundEnabled ? 'Sound on' : 'Sound off'}
                </button>
              </div>
              {nextReminderEvent ? (
                <>
                  <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                    <BellRing className="mr-1 inline h-4 w-4" style={{ color: 'var(--primary)' }} />
                    {nextReminderEvent.title}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Starts at {formatClockLabel(nextReminderEvent.startsAtMs)} • in {nextReminderMinutes} min ({nextReminderEvent.source})
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {REMINDER_THRESHOLDS.map((threshold) => {
                      const remainingMs = nextReminderEvent.startsAtMs - nowMs;
                      const active = remainingMs <= threshold * 60_000;
                      return (
                        <span
                          key={threshold}
                          className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                          style={{
                            background: active ? 'rgba(124,58,237,0.22)' : 'rgba(15,23,42,0.42)',
                            color: active ? '#ede9fe' : '#94a3b8',
                            border: '1px solid rgba(148, 163, 184, 0.24)',
                          }}
                        >
                          {threshold}m
                        </span>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>No upcoming lessons or routine blocks found for reminder alerts.</p>
              )}
            </div>

            {userId && !useTvFlow && (
              <>
                <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={async () => {
                      setLinkError(null);
                      setLinkCopied(false);
                      setDisplayLinkUrl(null);
                      setDisplayJoinCode(null);
                      try {
                        const res = await fetch('/api/display/link');
                        if (!res.ok) {
                          const err = await res.json().catch(() => ({}));
                          throw new Error(err.error || 'Failed to get link');
                        }
                        const { url, joinCode } = await res.json();
                        setDisplayLinkUrl(url);
                        if (joinCode) setDisplayJoinCode(joinCode);
                        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                          await navigator.clipboard.writeText(joinCode ? `${joinCode} (or open: ${url})` : url);
                          setLinkCopied(true);
                          setTimeout(() => setLinkCopied(false), 3000);
                        }
                      } catch (e) {
                        setLinkError(e instanceof Error ? e.message : 'Failed');
                      }
                    }}
                    className="rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90"
                    style={{ background: linkCopied ? 'var(--success)' : 'var(--primary)' }}
                  >
                    {linkCopied ? 'Copied! Open on TV' : 'Get TV link'}
                  </button>
                  <button
                    type="button"
                    onClick={handleExportUsbPack}
                    disabled={exportingUsbPack}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-fuchsia-200/35 bg-fuchsia-500/14 px-4 py-2.5 text-sm font-semibold text-fuchsia-100 transition-colors hover:bg-fuchsia-500/22 disabled:opacity-70"
                  >
                    <HardDriveDownload className="h-4 w-4" />
                    {exportingUsbPack ? 'Exporting...' : 'Export USB Pack'}
                  </button>
                </div>
                {displayJoinCode && (
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Join code:{' '}
                    <span className="select-all font-mono text-lg font-bold tracking-widest" style={{ color: 'var(--primary)' }}>
                      {displayJoinCode}
                    </span>
                    <span className="ml-1 text-xs" style={{ color: 'var(--muted)' }}>(type on TV)</span>
                  </p>
                )}
                {displayLinkUrl && (
                  <p className="max-w-xs break-all text-xs" style={{ color: 'var(--muted)' }}>
                    Or open:{' '}
                    <span className="select-all font-mono" style={{ color: 'var(--cyan)' }}>{displayLinkUrl}</span>
                  </p>
                )}
                {linkError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{linkError}</p>}
                <div className="mt-1 flex w-full flex-wrap justify-start gap-2 md:justify-end">
                  <button
                    type="button"
                    onClick={() => setPreviewMode((prev) => (prev === 'focus' ? 'grid' : 'focus'))}
                    className={previewMode === 'grid' ? NEXTGEN_PILL_ACTIVE : NEXTGEN_PILL}
                  >
                    {previewMode === 'focus' ? 'Grid preview' : 'Focus preview'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoRotatePreview((prev) => !prev)}
                    className={autoRotatePreview ? NEXTGEN_PILL_ACTIVE : NEXTGEN_PILL}
                  >
                    {autoRotatePreview ? 'Auto-rotate on' : 'Auto-rotate off'}
                  </button>
                </div>
                <p className="text-right text-[11px]" style={{ color: 'var(--muted)' }}>
                  Preview mode only. TV mode stays optimized for fullscreen playback.
                </p>
              </>
            )}
          </div>

          {showRotation && !showAllSections && (
            <div className="flex w-full flex-wrap items-center gap-2">
              {availableSections.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setCurrentSectionIndex(i)}
                  className={currentSection === s ? `${NEXTGEN_PILL_ACTIVE} px-4 py-2 text-sm` : `${NEXTGEN_PILL} px-4 py-2 text-sm`}
                >
                  {SECTION_LABELS[s]}
                </button>
              ))}
            </div>
          )}
        </header>

        <div className="section display-overview-section">
          <div className="sectionTitle display-section-heading">Overview</div>
          <div className="display-stats-grid grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {/* Hero: Routine blocks + current block + next */}
          <div
            className={`card tile display-glass-tile col-span-2 sm:col-span-3 lg:col-span-2 min-w-0 rounded-2xl ${currentLiveItem ? 'current-block-live' : ''}`}
          >
            <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Routine blocks</p>
            <p className="display-stat-number mt-1 text-2xl font-black" style={{ color: 'var(--text-primary)' }}>{dataHealth.routineBlocks}</p>
            <div className="mt-4 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Current block now</p>
              {currentLiveItem ? (
                <>
                  <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {currentLiveItem.title}
                    <span className="ml-2 text-xs uppercase tracking-wider" style={{ color: '#c4b5fd' }}>{currentLiveItem.source}</span>
                  </p>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800/80">
                    <div
                      className="current-block-progress h-full rounded-full bg-gradient-to-r from-violet-400 via-fuchsia-400 to-indigo-400 transition-all"
                      style={{ width: `${clampPercent(currentLiveProgressPct)}%` }}
                    />
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {formatClockLabel(currentLiveItem.startMs)} - {formatClockLabel(currentLiveItem.endMs)} • {Math.max(0, Math.ceil((currentLiveItem.endMs - nowMs) / 60_000))} min left
                  </p>
                </>
              ) : (
                <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                  No active block right now.
                </p>
              )}
              {nextReminderEvent && (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wider pt-1" style={{ color: 'var(--text-secondary)' }}>Routine</p>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{nextReminderEvent.title}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {formatClockLabel(nextReminderEvent.startsAtMs)} • in {nextReminderMinutes} min ({nextReminderEvent.source})
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="card tile display-glass-tile rounded-2xl">
            <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Lessons</p>
            <p className="display-stat-number mt-1 text-2xl font-black" style={{ color: 'var(--text-primary)' }}>{dataHealth.lessonBlocks}</p>
          </div>
          <div className="card tile display-glass-tile rounded-2xl">
            <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Menu items</p>
            <p className="display-stat-number mt-1 text-2xl font-black" style={{ color: 'var(--text-primary)' }}>{dataHealth.menuItems}</p>
          </div>
          <div className="card tile display-glass-tile rounded-2xl">
            <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Announcements</p>
            <p className="display-stat-number mt-1 text-2xl font-black" style={{ color: 'var(--text-primary)' }}>{dataHealth.announcements}</p>
          </div>
          <div className="card tile display-glass-tile rounded-2xl">
            <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Display state</p>
            <p className="mt-1 text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              {noContentSignal ? 'Setup needed' : `${dataHealth.filledSections}/5 live`}
            </p>
          </div>
          </div>
        </div>

        {upcomingEvents.length > 0 && (
          <div className="section">
            <div className="sectionTitle display-section-heading">Upcoming</div>
            <div className="card grid gap-3 md:grid-cols-4">
            {upcomingEvents.map((event) => {
              const mins = Math.max(0, Math.ceil((event.startsAtMs - nowMs) / 60_000));
              return (
                <div key={event.id} className="rounded-lg border border-slate-600/40 bg-slate-800/40 px-4 py-3">
                  <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{event.source}</p>
                  <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{event.title}</p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{formatClockLabel(event.startsAtMs)} • in {mins} min</p>
                </div>
              );
            })}
            </div>
          </div>
        )}

        {noContentSignal && !useTvFlow && (
          <div className="section">
            <div className="card grid gap-3 md:grid-cols-[1.7fr_1fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Setup checklist</p>
              <p className="mt-2 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Room Display is connected, but today has no published classroom content yet.</p>
              <ul className="mt-3 grid gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--primary)' }} />Save and share today&apos;s routine to teachers.</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--primary)' }} />Schedule at least one lesson block with start time.</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--primary)' }} />Publish menu/announcements to enrich the wall display.</li>
              </ul>
            </div>
            <div className="rounded-lg border border-slate-600/50 bg-slate-800/40 p-5">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Offline fallback ready</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                You can still export an Offline TV Pack now and copy it to USB for standalone playback.
              </p>
              <button
                type="button"
                onClick={handleExportUsbPack}
                disabled={exportingUsbPack}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-70"
                style={{ borderColor: 'rgba(236,72,153,0.4)', background: 'var(--primary-subtle)', color: 'var(--text-primary)' }}
              >
                <HardDriveDownload className="h-3.5 w-3.5" />
                {exportingUsbPack ? 'Exporting...' : 'Export USB Pack'}
              </button>
            </div>
          </div>
          </div>
        )}

        <div className={`dashboardSections mx-auto ${showAllSections ? 'max-w-7xl' : 'max-w-5xl'}`}>
          {showAllSections ? (
            <div className="section grid gap-4 xl:grid-cols-2 xl:grid-rows-1">
              <div className="min-h-0 xl:row-span-1">
                {renderSection('routine')}
              </div>
              <div className="flex flex-col gap-6 min-h-0">
                {renderSection('lessons')}
                {renderSection('menu')}
                {renderSection('announcements')}
                {renderSection('insights')}
              </div>
            </div>
          ) : showRotation ? (
            <div className="section min-h-[min(68vh,720px)]">{renderSection(currentSection)}</div>
          ) : (
            <>
              <div className="section">{renderSection('routine')}</div>
              <div className="section">{renderSection('lessons')}</div>
              <div className="section">{renderSection('menu')}</div>
              <div className="section">{renderSection('announcements')}</div>
              <div className="section">{renderSection('insights')}</div>
            </>
          )}
        </div>

        <footer className="mt-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
          {useTvFlow ? 'Data refreshes every minute. ' : 'Preview refreshes every minute with your live dashboard data. '}
          15/10/5 reminder pattern is active for upcoming routine and lesson starts. Use fullscreen (F11) for TV.
        </footer>
      </div>
    </div>
  );
}

export default function DisplayPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-xl" style={{ color: 'var(--muted)' }}>Loading display…</p>
        </div>
      )}
    >
      <DisplayPageClient />
    </Suspense>
  );
}
