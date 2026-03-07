/**
 * ParentDashboardContentSections (Web)
 *
 * Extracted from parent/page.tsx — contains the homework,
 * live classes, teacher notes, progress, insights, birthdays,
 * birthday chart, daily activity, and overview CollapsibleSections.
 *
 * ≤400 lines (WARP-compliant component)
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { CollapsibleSection } from '@/components/dashboard/parent/CollapsibleSection';
import { HomeworkCard } from '@/components/dashboard/parent/HomeworkCard';
import { JoinLiveLessonWithToggle } from '@/components/calls';
import { TeacherQuickNotesCard } from '@/components/dashboard/parent/TeacherQuickNotesCard';
import { ChildProgressBadgesCard } from '@/components/dashboard/parent/ChildProgressBadgesCard';
import { DailyActivityFeedCard } from '@/components/dashboard/parent/DailyActivityFeedCard';
import { UpcomingBirthdaysCard } from '@/components/dashboard/parent/UpcomingBirthdaysCard';
import { BirthdayChartPreviewCard } from '@/components/dashboard/parent/BirthdayChartPreviewCard';
import { MetricCard } from '@/components/dashboard/parent/MetricCard';
import { OnboardingHint } from '@/components/dashboard/parent/OnboardingHint';
import { ParentInsightsSection } from '@/components/dashboard/parent/ParentInsightsSection';
import { createClient } from '@/lib/supabase/client';
import type { ProactiveInsight, PredictiveAlert } from '@/lib/hooks/parent/useParentInsights';
import { BookOpen, BarChart3, MessageCircle, PhoneOff, CalendarCheck, Video, Cake, Sparkles, CalendarDays } from 'lucide-react';
import type { ParentDashboardCopy } from '@/app/dashboard/parent/parentDashboardCopy';

// --- Shared empty state ---
function SectionEmptyState({ title, description, actionLabel, onAction }: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="card" style={{ display: 'grid', gap: 12 }}>
      <div>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <p style={{ margin: '6px 0 0', color: 'var(--muted)' }}>{description}</p>
      </div>
      {actionLabel && onAction && (
        <button className="btn btn-primary" onClick={onAction}>{actionLabel}</button>
      )}
    </div>
  );
}

interface ActiveChild {
  id: string;
  firstName: string;
  classId?: string;
}

type ReminderItem = {
  id: string;
  title: string;
  eventDate: string;
  daysUntil: number;
  nextReminderLabel: string | null;
  sentLabels: string[];
};

interface ParentDashboardContentSectionsProps {
  COPY: ParentDashboardCopy;
  openSection: string | null;
  toggleSection: (key: string) => void;
  userId: string | undefined;
  hasOrganization: boolean;
  hasChildren: boolean;
  activeChild: ActiveChild | null;
  activeChildId: string | null;
  allChildrenArePreschoolers: boolean;
  showLiveClassesHint: boolean;
  dismissLiveClassesHint: () => void;
  preschoolId: string | undefined;
  // Insights
  parentInsights: ProactiveInsight[];
  parentAlerts: PredictiveAlert[];
  insightsLoading: boolean;
  insightsError: string | null;
  hasUrgentInsights: boolean;
  // Metrics
  unreadCount: number;
  missedCalls: number;
  homeworkCount: number;
  attendanceRate: number;
  pendingHomework: number;
  organizationId: string | undefined;
}

export function ParentDashboardContentSections({
  COPY,
  openSection,
  toggleSection,
  userId,
  hasOrganization,
  hasChildren,
  activeChild,
  activeChildId,
  allChildrenArePreschoolers,
  showLiveClassesHint,
  dismissLiveClassesHint,
  preschoolId,
  parentInsights,
  parentAlerts,
  insightsLoading,
  insightsError,
  hasUrgentInsights,
  unreadCount,
  missedCalls,
  homeworkCount,
  attendanceRate,
  pendingHomework,
  organizationId,
}: ParentDashboardContentSectionsProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const supabase = useMemo(() => createClient(), []);
  const [upcomingReminders, setUpcomingReminders] = useState<ReminderItem[]>([]);
  const [reminderLoading, setReminderLoading] = useState(false);
  const addChildCta = t('dashboard.parent.empty.add_child.cta', { defaultValue: 'Add Child' });
  const goAddChild = () => router.push('/dashboard/parent/register-child');
  const homeworkTitle = allChildrenArePreschoolers
    ? t('dashboard.parent.section.take_home_activities', { defaultValue: 'Take-home Activities' })
    : COPY.sections.homework;
  const homeworkDescription = allChildrenArePreschoolers
    ? t('dashboard.parent.section_desc.take_home_activities', { defaultValue: 'Worksheets and guided at-home activities from class.' })
    : COPY.sectionDescriptions.homework;

  useEffect(() => {
    let active = true;
    const loadReminders = async () => {
      if (!organizationId) {
        if (active) setUpcomingReminders([]);
        return;
      }

      setReminderLoading(true);
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const end = new Date(today);
        end.setDate(end.getDate() + 21);

        const { data: eventsData, error: eventsError } = await supabase
          .from('school_events')
          .select('id, title, start_date')
          .eq('preschool_id', organizationId)
          .gte('start_date', today.toISOString().slice(0, 10))
          .lte('start_date', end.toISOString().slice(0, 10))
          .order('start_date', { ascending: true })
          .limit(8);

        if (eventsError) throw eventsError;

        const eventIds = (eventsData || []).map((event: any) => event.id);
        let sentByEvent = new Map<string, Set<number>>();

        if (eventIds.length > 0) {
          const { data: logsData } = await supabase
            .from('school_event_reminder_logs')
            .select('event_id, reminder_offset_days')
            .in('event_id', eventIds)
            .eq('target_role', 'parent');

          sentByEvent = new Map<string, Set<number>>();
          (logsData || []).forEach((log: any) => {
            const key = String(log.event_id || '');
            if (!key) return;
            if (!sentByEvent.has(key)) sentByEvent.set(key, new Set());
            sentByEvent.get(key)?.add(Number(log.reminder_offset_days) || 0);
          });
        }

        const thresholds: Array<7 | 3 | 1> = [7, 3, 1];
        const rows: ReminderItem[] = (eventsData || []).map((event: any) => {
          const eventDate = String(event.start_date || '');
          const date = new Date(`${eventDate}T00:00:00`);
          date.setHours(0, 0, 0, 0);
          const daysUntil = Math.max(0, Math.ceil((date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)));
          const sent = sentByEvent.get(String(event.id)) || new Set<number>();
          const nextThreshold = thresholds.find((threshold) => threshold <= daysUntil && !sent.has(threshold)) || null;
          return {
            id: String(event.id),
            title: String(event.title || 'Upcoming Event'),
            eventDate,
            daysUntil,
            nextReminderLabel: nextThreshold ? `${nextThreshold} day${nextThreshold === 1 ? '' : 's'}` : null,
            sentLabels: thresholds.filter((threshold) => sent.has(threshold)).map((threshold) => `${threshold}d`),
          };
        });

        if (active) setUpcomingReminders(rows);
      } catch {
        if (active) setUpcomingReminders([]);
      } finally {
        if (active) setReminderLoading(false);
      }
    };

    void loadReminders();
    return () => {
      active = false;
    };
  }, [organizationId, supabase]);

  return (
    <>
      {/* Homework / Take-home Activities */}
      {userId && (
        <CollapsibleSection
          title={homeworkTitle}
          description={homeworkDescription}
          icon={BookOpen}
          isOpen={openSection === 'homework'}
          onToggle={() => toggleSection('homework')}
        >
          {hasOrganization ? (
            <HomeworkCard userId={userId} />
          ) : (
            <SectionEmptyState
              title={t('dashboard.parent.empty.homework.title', { defaultValue: 'Homework preview' })}
              description={t('dashboard.parent.empty.homework.description', { defaultValue: 'Link a child to a school to view and submit homework.' })}
              actionLabel={addChildCta}
              onAction={goAddChild}
            />
          )}
        </CollapsibleSection>
      )}

      {/* Live Lessons */}
      <CollapsibleSection
        title={COPY.sections.liveClasses}
        description={COPY.sectionDescriptions.liveClasses}
        icon={Video}
        isOpen={openSection === 'live-classes'}
        onToggle={() => toggleSection('live-classes')}
      >
        {showLiveClassesHint && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <OnboardingHint
              title={COPY.hints.liveClassesTitle}
              message={COPY.hints.liveClassesMessage}
              onDismiss={dismissLiveClassesHint}
            />
          </div>
        )}
        {hasOrganization && activeChild && preschoolId ? (
          <JoinLiveLessonWithToggle preschoolId={preschoolId} classId={activeChild.classId} />
        ) : (
          <SectionEmptyState
            title={t('dashboard.parent.empty.live_classes.title', { defaultValue: 'Live classes preview' })}
            description={t('dashboard.parent.empty.live_classes.description', { defaultValue: 'Live class links appear here once your child is linked to a school.' })}
            actionLabel={addChildCta}
            onAction={goAddChild}
          />
        )}
      </CollapsibleSection>

      {/* Teacher Notes */}
      <CollapsibleSection
        title={COPY.sections.teacherNotes}
        description={COPY.sectionDescriptions.teacherNotes}
        icon={MessageCircle}
        isOpen={openSection === 'teacher-notes'}
        onToggle={() => toggleSection('teacher-notes')}
      >
        {hasOrganization && activeChildId ? (
          <TeacherQuickNotesCard studentId={activeChildId} />
        ) : (
          <SectionEmptyState
            title={t('dashboard.parent.empty.teacher_notes.title', { defaultValue: 'Teacher notes preview' })}
            description={t('dashboard.parent.empty.teacher_notes.description', { defaultValue: 'Notes from educators will appear here when a child is linked.' })}
            actionLabel={addChildCta}
            onAction={goAddChild}
          />
        )}
      </CollapsibleSection>

      {/* Progress & Achievements - Hide for preschool-only */}
      {!allChildrenArePreschoolers && (
        <CollapsibleSection
          title={COPY.sections.progress}
          description={COPY.sectionDescriptions.progress}
          icon={BarChart3}
          isOpen={openSection === 'progress'}
          onToggle={() => toggleSection('progress')}
        >
          {activeChildId ? (
            <ChildProgressBadgesCard studentId={activeChildId} />
          ) : (
            <SectionEmptyState
              title={t('dashboard.parent.empty.progress.title', { defaultValue: 'Progress badges preview' })}
              description={t('dashboard.parent.empty.progress.description', { defaultValue: 'Track milestones and achievements once a child is linked.' })}
              actionLabel={addChildCta}
              onAction={goAddChild}
            />
          )}
        </CollapsibleSection>
      )}

      {/* AI Insights */}
      <CollapsibleSection
        title={t('dashboard.parent.section.insights', { defaultValue: 'AI Insights' })}
        description={t('dashboard.parent.section_desc.insights', { defaultValue: "AI-powered observations about your child's progress." })}
        icon={Sparkles}
        isOpen={openSection === 'insights'}
        onToggle={() => toggleSection('insights')}
      >
        <ParentInsightsSection
          insights={parentInsights}
          alerts={parentAlerts}
          loading={insightsLoading}
          error={insightsError}
        />
      </CollapsibleSection>

      {/* Upcoming Birthdays */}
      <CollapsibleSection
        title={t('dashboard.parent.section.upcoming_reminders', { defaultValue: 'Upcoming Reminders' })}
        description={t('dashboard.parent.section_desc.upcoming_reminders', {
          defaultValue: '7/3/1 reminder timeline for upcoming school events.',
        })}
        icon={CalendarDays}
        isOpen={openSection === 'upcoming-reminders'}
        onToggle={() => toggleSection('upcoming-reminders')}
      >
        {reminderLoading ? (
          <div className="card" style={{ padding: 14, color: 'var(--textLight)' }}>
            Loading reminder timeline...
          </div>
        ) : upcomingReminders.length === 0 ? (
          <SectionEmptyState
            title={t('dashboard.parent.empty.reminders.title', { defaultValue: 'No reminders queued yet' })}
            description={t('dashboard.parent.empty.reminders.description', {
              defaultValue: 'When school events are scheduled, 7/3/1 reminder markers will appear here.',
            })}
          />
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {upcomingReminders.map((reminder) => (
              <div key={reminder.id} className="card" style={{ padding: 12, background: 'var(--surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontWeight: 700 }}>{reminder.title}</div>
                  <span className="chip">{reminder.daysUntil} day{reminder.daysUntil === 1 ? '' : 's'}</span>
                </div>
                <div style={{ marginTop: 6, color: 'var(--textLight)', fontSize: 13 }}>
                  Event date: {new Date(`${reminder.eventDate}T00:00:00`).toLocaleDateString('en-ZA')}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <span className="chip" style={{ background: 'color-mix(in srgb, var(--primary) 16%, transparent)', borderColor: 'var(--primary)' }}>
                    Next: {reminder.nextReminderLabel || 'complete'}
                  </span>
                  {reminder.sentLabels.length > 0 ? (
                    <span className="chip">Sent: {reminder.sentLabels.join(', ')}</span>
                  ) : (
                    <span className="chip">Sent: none</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title={COPY.sections.birthdays}
        description={COPY.sectionDescriptions.birthdays}
        icon={Sparkles}
        isOpen={openSection === 'birthdays'}
        onToggle={() => toggleSection('birthdays')}
      >
        {hasOrganization && activeChild?.classId ? (
          <UpcomingBirthdaysCard classId={activeChild.classId} onViewAll={() => router.push('/dashboard/parent/birthday-chart')} />
        ) : (
          <SectionEmptyState
            title={t('dashboard.parent.empty.birthdays.title', { defaultValue: 'Upcoming birthdays preview' })}
            description={t('dashboard.parent.empty.birthdays.description', { defaultValue: "Birthdays for your child's group will appear here after linking." })}
            actionLabel={addChildCta}
            onAction={goAddChild}
          />
        )}
      </CollapsibleSection>

      {/* Birthday Chart */}
      <CollapsibleSection
        title={COPY.sections.birthdayChart}
        description={COPY.sectionDescriptions.birthdayChart}
        icon={Cake}
        isOpen={openSection === 'birthday-chart'}
        onToggle={() => toggleSection('birthday-chart')}
      >
        {hasOrganization ? (
          <BirthdayChartPreviewCard organizationId={organizationId} />
        ) : (
          <SectionEmptyState
            title={t('dashboard.parent.empty.birthdays.title', { defaultValue: 'Upcoming birthdays preview' })}
            description={t('dashboard.parent.empty.birthdays.description', { defaultValue: "Birthdays for your child's group will appear here after linking." })}
            actionLabel={addChildCta}
            onAction={goAddChild}
          />
        )}
      </CollapsibleSection>

      {/* Daily Activity Feed */}
      <CollapsibleSection
        title={COPY.sections.dailyActivity}
        description={COPY.sectionDescriptions.dailyActivity}
        icon={BookOpen}
        isOpen={openSection === 'daily-activity'}
        onToggle={() => toggleSection('daily-activity')}
      >
        {hasOrganization && activeChild?.classId ? (
          <DailyActivityFeedCard classId={activeChild.classId} studentId={activeChild.id} />
        ) : (
          <SectionEmptyState
            title={t('dashboard.parent.empty.daily_activity.title', { defaultValue: 'Daily activity preview' })}
            description={t('dashboard.parent.empty.daily_activity.description', { defaultValue: 'Daily activity updates will show here once a child is linked.' })}
            actionLabel={addChildCta}
            onAction={goAddChild}
          />
        )}
      </CollapsibleSection>

      {/* Overview (org-linked only) */}
      <CollapsibleSection
        title={COPY.sections.overview}
        description={COPY.sectionDescriptions.overview}
        icon={BarChart3}
        isOpen={openSection === 'overview'}
        onToggle={() => toggleSection('overview')}
      >
        {hasOrganization ? (
          <div className="grid2">
            <MetricCard title={COPY.overviewCards.unreadMessages} value={unreadCount} icon={MessageCircle} color="#8b5cf6" onPress={() => router.push('/dashboard/parent/messages')} />
            <MetricCard title={COPY.overviewCards.missedCalls} value={missedCalls} icon={PhoneOff} color="#10b981" onPress={() => router.push('/dashboard/parent/messages')} />
            <MetricCard title={COPY.overviewCards.homeworkPending} value={activeChild ? pendingHomework : homeworkCount} icon={BookOpen} color="#f59e0b" onPress={() => router.push('/dashboard/parent/homework')} />
            <MetricCard title={COPY.overviewCards.attendanceRate} value={`${attendanceRate}%`} icon={CalendarCheck} color="#22c55e" onPress={() => router.push('/dashboard/parent/progress')} />
          </div>
        ) : (
          <SectionEmptyState
            title={t('dashboard.parent.empty.overview.title', { defaultValue: 'Overview preview' })}
            description={t('dashboard.parent.empty.overview.description', { defaultValue: 'Link a child to a school to see attendance, homework, and messages.' })}
            actionLabel={addChildCta}
            onAction={goAddChild}
          />
        )}
      </CollapsibleSection>
    </>
  );
}
