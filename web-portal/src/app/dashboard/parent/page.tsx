'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { useParentDashboardData } from '@/lib/hooks/useParentDashboardData';
import { useTierUpdates } from '@/hooks/useTierUpdates';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { DashboardHeader } from '@/components/dashboard/parent/DashboardHeader';
import { TrialBanner } from '@/components/dashboard/parent/TrialBanner';
import { PendingRequestsWidget } from '@/components/dashboard/parent/PendingRequestsWidget';
import { EmptyChildrenState } from '@/components/dashboard/parent/EmptyChildrenState';
import { QuickActionsGrid } from '@/components/dashboard/parent/QuickActionsGrid';
import { CAPSActivitiesWidget } from '@/components/dashboard/parent/CAPSActivitiesWidget';
import { CollapsibleSection } from '@/components/dashboard/parent/CollapsibleSection';
import { HomeworkCard } from '@/components/dashboard/parent/HomeworkCard';
import { usePendingHomework } from '@/lib/hooks/parent/usePendingHomework';
import { JoinLiveLessonWithToggle } from '@/components/calls';
import { useParentOverviewMetrics } from '@/lib/hooks/parent/useParentOverviewMetrics';
import { useOnboardingHint } from '@/lib/hooks/useOnboardingHint';
import { getGradeNumber, isExamEligibleChild } from '@/lib/utils/gradeUtils';
import { TeacherQuickNotesCard } from '@/components/dashboard/parent/TeacherQuickNotesCard';
import { ChildProgressBadgesCard } from '@/components/dashboard/parent/ChildProgressBadgesCard';
import { DailyActivityFeedCard } from '@/components/dashboard/parent/DailyActivityFeedCard';
import { UpcomingBirthdaysCard } from '@/components/dashboard/parent/UpcomingBirthdaysCard';
import { BirthdayChartPreviewCard } from '@/components/dashboard/parent/BirthdayChartPreviewCard';
import { MetricCard } from '@/components/dashboard/parent/MetricCard';
import { OnboardingHint } from '@/components/dashboard/parent/OnboardingHint';
import { UpgradeBanner } from '@/components/dashboard/parent/UpgradeBanner';
import { AdBannerPlaceholder } from '@/components/dashboard/parent/AdBannerPlaceholder';
import { DashOrbButton } from '@/components/dashboard/parent/DashOrbButton';
import { Users, BarChart3, BookOpen, Lightbulb, Search, Activity, Brain, Cpu, Laptop, Sparkles, Shirt, MessageCircle, PhoneOff, CalendarCheck, Video, Cake } from 'lucide-react';
import { ActivityFeed } from '@/components/dashboard/parent/ActivityFeed';
import { UniformSizesWidget } from '@/components/dashboard/parent/UniformSizesWidget';
import { StationeryChecklistWidget } from '@/components/dashboard/parent/StationeryChecklistWidget';
import { ParentInsightsSection } from '@/components/dashboard/parent/ParentInsightsSection';
import { PracticeAtHomeSection } from '@/components/dashboard/parent/PracticeAtHomeSection';
import { ParentDashboardContentSections } from '@/components/dashboard/parent/ParentDashboardContentSections';
import { useParentInsights } from '@/lib/hooks/parent/useParentInsights';
import { createClient } from '@/lib/supabase/client';
import { getParentDashboardCopy } from './parentDashboardCopy';

type ChildSchoolAware = {
  preschoolId?: string | null;
  organizationId?: string | null;
  preschool_id?: string | null;
  organization_id?: string | null;
};

function getChildSchoolIds(child: ChildSchoolAware): string[] {
  const ids = [
    child.organizationId,
    child.preschoolId,
    child.organization_id,
    child.preschool_id,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
}

function childBelongsToEnabledSchool(child: ChildSchoolAware, enabledSchoolIds: string[]): boolean {
  if (!enabledSchoolIds.length) return false;
  return getChildSchoolIds(child).some((schoolId) => enabledSchoolIds.includes(schoolId));
}

function getCurrentAcademicYear(): number {
  try {
    return Number(
      new Intl.DateTimeFormat('en-ZA', {
        timeZone: 'Africa/Johannesburg',
        year: 'numeric',
      }).format(new Date())
    );
  } catch {
    return new Date().getFullYear();
  }
}

export default function ParentDashboard() {
  const router = useRouter();
  const { t } = useTranslation();
  const supabase = useMemo(() => createClient(), []);
  const academicYear = useMemo(() => getCurrentAcademicYear(), []);
  const COPY = useMemo(() => getParentDashboardCopy(t), [t]);
  
  // Get all data from custom hook
  const {
    userId,
    profile,
    userName,
    preschoolName,
    usageType,
    resolvedSchoolType,
    hasOrganization,
    tenantSlug,
    childrenCards,
    activeChildId,
    setActiveChildId,
    childrenLoading,
    metrics,
    unreadCount,
    trialStatus,
    loading,
  } = useParentDashboardData();
  
  // Listen for tier updates
  useTierUpdates(userId, () => {
    // Reload the page to refresh quota data
    window.location.reload();
  });
  
  // Local state
  const [greeting, setGreeting] = useState('');
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [uniformEnabled, setUniformEnabled] = useState(false);
  const [uniformSchoolIds, setUniformSchoolIds] = useState<string[]>([]);
  const [stationeryEnabled, setStationeryEnabled] = useState(false);
  const [stationerySchoolIds, setStationerySchoolIds] = useState<string[]>([]);
  const toggleSection = (sectionId: string) => {
    setOpenSection((prev) => (prev === sectionId ? null : sectionId));
  };

  // Get pending homework count for badge
  const { count: homeworkCount } = usePendingHomework(userId || undefined);

  // Set greeting based on time of day
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting(COPY.greetings.morning);
    else if (hour < 18) setGreeting(COPY.greetings.afternoon);
    else setGreeting(COPY.greetings.evening);
  }, [COPY.greetings.morning, COPY.greetings.afternoon, COPY.greetings.evening]);

  useEffect(() => {
    let cancelled = false;
    const loadUniformEnabled = async () => {
      const schoolIds = Array.from(
        new Set(childrenCards.flatMap((child) => getChildSchoolIds(child)))
      ) as string[];

      if (!schoolIds.length) {
        if (!cancelled) {
          setUniformEnabled(false);
          setUniformSchoolIds([]);
        }
        return;
      }

      try {
        const { data: preschoolSettings, error: preschoolError } = await supabase
          .from('preschools')
          .select('id, settings')
          .in('id', schoolIds);
        if (preschoolError) throw preschoolError;

        const { data: organizationSettings, error: organizationError } = await supabase
          .from('organizations')
          .select('id, settings')
          .in('id', schoolIds);
        if (organizationError) throw organizationError;

        const { data: publishedStationeryLists } = await supabase
          .from('stationery_lists')
          .select('school_id')
          .in('school_id', schoolIds)
          .eq('academic_year', academicYear)
          .eq('is_visible', true)
          .eq('is_published', true);

        const preschoolsById = new Map<string, any>(
          (preschoolSettings || []).map((row: any) => [String(row.id), row])
        );
        const organizationsById = new Map<string, any>(
          (organizationSettings || []).map((row: any) => [String(row.id), row])
        );
        const publishedBySchoolId = new Set<string>(
          (publishedStationeryLists || [])
            .map((row: any) => String(row?.school_id || '').trim())
            .filter(Boolean)
        );

        const enabledIds = new Set<string>();
        const stationeryIds = new Set<string>();

        schoolIds.forEach((schoolId) => {
          const preschoolUniform = preschoolsById.get(schoolId)?.settings?.features?.uniforms?.enabled;
          const orgUniform = organizationsById.get(schoolId)?.settings?.features?.uniforms?.enabled;
          const resolvedUniform =
            typeof preschoolUniform === 'boolean'
              ? preschoolUniform
              : (typeof orgUniform === 'boolean' ? orgUniform : undefined);
          if (resolvedUniform === true) {
            enabledIds.add(schoolId);
          }

          const preschoolStationery = preschoolsById.get(schoolId)?.settings?.features?.stationery?.enabled;
          const orgStationery = organizationsById.get(schoolId)?.settings?.features?.stationery?.enabled;
          const resolvedStationery =
            typeof preschoolStationery === 'boolean'
              ? preschoolStationery
              : (typeof orgStationery === 'boolean' ? orgStationery : undefined);
          if (resolvedStationery === true) {
            stationeryIds.add(schoolId);
            return;
          }
          if (resolvedStationery === false) {
            return;
          }
          if (publishedBySchoolId.has(schoolId)) {
            stationeryIds.add(schoolId);
          }
        });

        if (!cancelled) {
          setUniformSchoolIds(Array.from(enabledIds));
          setUniformEnabled(enabledIds.size > 0);
          setStationerySchoolIds(Array.from(stationeryIds));
          setStationeryEnabled(stationeryIds.size > 0);
        }
      } catch {
        if (!cancelled) {
          setUniformEnabled(false);
          setUniformSchoolIds([]);
          setStationeryEnabled(false);
          setStationerySchoolIds([]);
        }
      }
    };

    loadUniformEnabled();
    return () => {
      cancelled = true;
    };
  }, [academicYear, childrenCards, supabase]);

  // Auth guard
  useEffect(() => {
    if (!loading && !userId) {
      router.push('/sign-in');
    }
  }, [loading, userId, router]);

  const childIds = useMemo(() => childrenCards.map((child) => child.id), [childrenCards]);
  const { metrics: overviewMetrics } = useParentOverviewMetrics({
    userId,
    childIds,
    organizationId: profile?.organizationId || profile?.preschoolId || null,
  });

  const [showQuickActionsHint, dismissQuickActionsHint] = useOnboardingHint('parent_quick_actions');
  const [showLiveClassesHint, dismissLiveClassesHint] = useOnboardingHint('parent_live_classes');
  const resolvedOrganizationId = profile?.organizationId || profile?.preschoolId;

  // Proactive AI Insights for active child
  const {
    insights: parentInsights,
    alerts: parentAlerts,
    loading: insightsLoading,
    error: insightsError,
    hasUrgent: hasUrgentInsights,
  } = useParentInsights({
    studentId: activeChildId,
    organizationId: resolvedOrganizationId || null,
  });

  // Handle AI interactions
  const handleAskFromActivity = async (
    prompt: string, 
    display: string, 
    language?: string, 
    enableInteractive?: boolean
  ) => {
    const params = new URLSearchParams();
    params.set('prompt', prompt);
    if (display) params.set('display', display);
    if (language) params.set('language', language);
    if (enableInteractive) params.set('interactive', 'true');
    router.push(`/dashboard/parent/dash-chat?${params.toString()}`);
  };

  // Loading state
  if (loading) {
    return (
      <div className="app" role="status" aria-label="Loading dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="spinner" aria-hidden="true"></div>
        <span className="sr-only">Loading parent dashboard…</span>
      </div>
    );
  }

  // Active child and age calculations
  const activeChild = childrenCards.find((c) => c.id === activeChildId) || null;
  const featuredChild = activeChild || childrenCards[0] || null;
  
  // Calculate age of active child (for age-appropriate content)
  const getChildAge = (dateOfBirth?: string): number => {
    if (!dateOfBirth) return 0;
    const [yearStr, monthStr, dayStr] = dateOfBirth.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (!year || !month || !day) return 0;
    const today = new Date();
    let age = today.getFullYear() - year;
    const monthDiff = (today.getMonth() + 1) - month;
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) {
      age -= 1;
    }
    return Math.max(age, 0);
  };

  const activeChildAge = activeChild ? getChildAge(activeChild.dateOfBirth) : 0;
  const activeChildGrade = activeChild ? getGradeNumber(activeChild.grade) : 0;
  const isPreschoolChild = (child: typeof activeChild) => {
    if (!child) return false;
    const age = getChildAge(child.dateOfBirth);
    const gradeNumber = getGradeNumber(child.grade);
    return (age > 0 && age < 6) || gradeNumber === 0;
  };
  const activeChildIsPreschool = activeChild ? isPreschoolChild(activeChild) : false;

  // Check if ALL children are preschoolers (under 6 years)
  const allChildrenArePreschoolers =
    resolvedSchoolType === 'preschool' ||
    (childrenCards.length > 0 && childrenCards.every(child => isPreschoolChild(child)));
  // Grade 4+ and school-age learners only
  const hasExamEligibleChild =
    resolvedSchoolType === 'k12_school' && activeChild
      ? isExamEligibleChild(activeChild.grade, activeChild.dateOfBirth)
      : false;
  
  // All children get access to general features (Dash Chat, Robotics, etc) with quotas
  const hasAnyChild = childrenCards.length > 0 && childrenCards.some(c => c.dateOfBirth);
  const hasChildren = childrenCards.length > 0;

  const feesDue = metrics?.feesDue ?? null;
  const attendanceRate = overviewMetrics.attendanceRate;
  const missedCalls = overviewMetrics.missedCalls;

  const subscriptionTier = (profile?.subscription_tier || '').toLowerCase();
  const isFreeTier = !subscriptionTier || subscriptionTier === 'free';
  const showUpgradeBanner = isFreeTier && !trialStatus?.is_trial;

  interface SectionEmptyStateProps {
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
  }

  const SectionEmptyState = ({ title, description, actionLabel, onAction }: SectionEmptyStateProps) => (
    <div className="card" role="status" style={{ display: 'grid', gap: 12 }}>
      <div>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <p style={{ margin: '6px 0 0', color: 'var(--muted)' }}>{description}</p>
      </div>
      {actionLabel && onAction && (
        <button className="btn btn-primary" aria-label={actionLabel} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );

  return (
    <ParentShell
      tenantSlug={tenantSlug}
      userEmail={profile?.email}
      userName={userName}
      preschoolName={preschoolName}
      unreadCount={unreadCount}
      hasOrganization={hasOrganization}
    >
      <div className="container parent-dashboard-main">
        {/* Search Bar */}
        <div style={{ marginTop: 0, marginBottom: '20px' }}>
          <div style={{ position: 'relative' }}>
            <Search className="searchIcon icon16" aria-hidden="true" />
            <input
              className="searchInput"
              aria-label="Search dashboard"
              placeholder={COPY.searchPlaceholder}
              onKeyDown={(e) => {
                const t = e.target as HTMLInputElement;
                if (e.key === 'Enter' && t.value.trim()) {
                  router.push(`/dashboard/parent/search?q=${encodeURIComponent(t.value.trim())}`);
                }
              }}
            />
          </div>
        </div>

        {/* Header */}
        <DashboardHeader userName={userName} greeting={greeting} />

        {/* Trial Banner */}
        <TrialBanner trialStatus={trialStatus} />

        {showUpgradeBanner && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <UpgradeBanner
              title={COPY.upgradeBanner.title}
              description={COPY.upgradeBanner.description}
              onUpgrade={() => router.push('/pricing')}
            />
          </div>
        )}

        {/* Child summary card (replaces AI usage card slot) */}
        {featuredChild && (
          <div className="card" style={{ marginBottom: 'var(--space-3)', padding: '16px' }}>
            <div className="flex items-center justify-between gap-3" style={{ flexWrap: 'wrap' }}>
              <div className="flex items-center gap-3">
                {featuredChild.avatarUrl ? (
                  <img
                    src={featuredChild.avatarUrl}
                    alt={`${featuredChild.firstName} ${featuredChild.lastName}`}
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 999,
                      objectFit: 'cover',
                      border: '2px solid var(--border)',
                    }}
                  />
                ) : (
                  <div className="avatar" style={{ width: 56, height: 56, fontSize: 20 }}>
                    {featuredChild.firstName[0]}{featuredChild.lastName[0]}
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>
                    Active Child
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>
                    {featuredChild.firstName} {featuredChild.lastName}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {featuredChild.grade}{featuredChild.className ? ` • ${featuredChild.className}` : ''}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                <button
                  className="btn btnSecondary"
                  aria-label={`Manage ${featuredChild.firstName}'s profile`}
                  onClick={() => router.push('/dashboard/parent/children')}
                >
                  Manage Child
                </button>
                <button
                  className="btn btnSecondary"
                  aria-label={`View ${featuredChild.firstName}'s homework`}
                  onClick={() => router.push('/dashboard/parent/homework')}
                >
                  View Homework
                </button>
                {hasOrganization && (
                  <button
                    className="btn btnSecondary"
                    onClick={() => router.push(`/dashboard/parent/daily-program?childId=${featuredChild.id}`)}
                  >
                    View Daily Program
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2" style={{ marginTop: 12 }}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{featuredChild.homeworkPending}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{COPY.childCard.homework}</div>
              </div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{featuredChild.upcomingEvents}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{COPY.childCard.events}</div>
              </div>
            </div>

            {childrenCards.length > 1 && (
              <div className="flex gap-2" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                {childrenCards.map((child) => (
                  <button
                    key={child.id}
                    className="btn btnSecondary"
                    aria-label={`Switch to ${child.firstName}`}
                    aria-pressed={child.id === activeChildId}
                    style={{
                      borderColor: child.id === activeChildId ? 'var(--primary)' : undefined,
                      color: child.id === activeChildId ? 'var(--primary)' : undefined,
                    }}
                    onClick={() => setActiveChildId(child.id)}
                  >
                    {child.firstName}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pending Requests (ONLY for organization-linked parents) */}
        {hasOrganization && <PendingRequestsWidget userId={userId} />}

        {/* Children Section */}
        {childrenCards.length === 0 && !childrenLoading && (
          <EmptyChildrenState
            usageType={usageType}
            onAddChild={() => {
              // Community School parents always use register-child (auto-approved)
              // Organization-linked parents use claim-child (needs approval)
              router.push('/dashboard/parent/register-child');
            }}
          />
        )}

        <CollapsibleSection 
          title={COPY.sections.myChildren}
          description={COPY.sectionDescriptions.myChildren}
          icon={Users} 
          isOpen={openSection === 'children'}
          onToggle={() => toggleSection('children')}
        >
          {hasChildren ? (
            <div className="flex gap-3 overflow-x-auto" style={{ paddingBottom: 'var(--space-2)' }}>
              {childrenCards.map((child) => (
                <div
                  key={child.id}
                  className="card card-interactive"
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${child.firstName} ${child.lastName}`}
                  aria-pressed={activeChildId === child.id}
                  style={{
                    border: activeChildId === child.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                    minWidth: '280px',
                    flexShrink: 0,
                    padding: '16px'
                  }}
                  onClick={() => setActiveChildId(child.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveChildId(child.id); } }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="avatar" style={{ width: 48, height: 48, fontSize: 20 }}>
                      {child.firstName[0]}{child.lastName[0]}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold" style={{ fontSize: 16 }}>
                        {child.firstName} {child.lastName}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>
                        {child.grade}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>
                      <div className="font-semibold" style={{ fontSize: 16 }}>{child.homeworkPending}</div>
                      {COPY.childCard.homework}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>
                      <div className="font-semibold" style={{ fontSize: 16 }}>{child.upcomingEvents}</div>
                      {COPY.childCard.events}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <SectionEmptyState
              title={t('dashboard.parent.empty.add_child.title', { defaultValue: 'Add your child' })}
              description={t('dashboard.parent.empty.add_child.description', { defaultValue: 'Link a child to unlock homework, progress insights, and personalized updates.' })}
              actionLabel={t('dashboard.parent.empty.add_child.cta', { defaultValue: 'Add Child' })}
              onAction={() => router.push('/dashboard/parent/register-child')}
            />
          )}
        </CollapsibleSection>

        {/* Uniform Sizes (enabled by school) */}
        {uniformEnabled && (
          <CollapsibleSection
            title={COPY.sections.uniformSizes}
            description={COPY.sectionDescriptions.uniformSizes}
            icon={Shirt}
            isOpen={openSection === 'uniforms'}
            onToggle={() => toggleSection('uniforms')}
          >
            {hasOrganization && hasChildren ? (
              <UniformSizesWidget
                childrenCards={childrenCards.filter((child) => childBelongsToEnabledSchool(child, uniformSchoolIds))}
              />
            ) : (
              <SectionEmptyState
                title={t('dashboard.parent.empty.uniform_sizes.title', { defaultValue: 'Uniform sizes preview' })}
                description={t('dashboard.parent.empty.uniform_sizes.description', { defaultValue: 'Link a child to a school to see uniform sizes and sizing updates.' })}
                actionLabel={t('dashboard.parent.empty.add_child.cta', { defaultValue: 'Add Child' })}
                onAction={() => router.push('/dashboard/parent/register-child')}
              />
            )}
          </CollapsibleSection>
        )}

        {/* Stationery Checklist (enabled by school) */}
        {stationeryEnabled && (
          <CollapsibleSection
            title={t('dashboard.parent.stationery.title', { defaultValue: 'Stationery Checklist' })}
            description={t('dashboard.parent.stationery.hint', { defaultValue: 'Track what is bought, what is still needed, and expected delivery dates.' })}
            icon={BookOpen}
            isOpen={openSection === 'stationery'}
            onToggle={() => toggleSection('stationery')}
          >
            {hasOrganization && hasChildren ? (
              <StationeryChecklistWidget
                childrenCards={childrenCards.filter((child) => childBelongsToEnabledSchool(child, stationerySchoolIds))}
              />
            ) : (
              <SectionEmptyState
                title={t('dashboard.parent.empty.stationery.title', { defaultValue: 'Stationery checklist preview' })}
                description={t('dashboard.parent.empty.stationery.description', { defaultValue: 'Link a child to a school to track stationery items.' })}
                actionLabel={t('dashboard.parent.empty.add_child.cta', { defaultValue: 'Add Child' })}
                onAction={() => router.push('/dashboard/parent/register-child')}
              />
            )}
          </CollapsibleSection>
        )}

        {/* Quick Actions Grid - Show if children exist with age */}
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          {showQuickActionsHint && (
            <OnboardingHint
              title={COPY.hints.quickActionsTitle}
              message={COPY.hints.quickActionsMessage}
              onDismiss={dismissQuickActionsHint}
            />
          )}
          <QuickActionsGrid 
            usageType={usageType} 
            resolvedSchoolType={resolvedSchoolType}
            hasOrganization={hasOrganization}
            activeChildGrade={activeChildGrade}
            isExamEligible={hasExamEligibleChild}
            isPreschool={activeChildIsPreschool}
            childAgeYears={activeChildAge}
            unreadCount={unreadCount}
            homeworkCount={homeworkCount}
            userId={userId}
            preschoolId={resolvedOrganizationId}
            feesDue={feesDue}
          />
        </div>

        {/* Recent Activity Feed */}
        {userId && (
          <CollapsibleSection 
            title={COPY.sections.recentActivity}
            description={COPY.sectionDescriptions.recentActivity}
            icon={Activity} 
            isOpen={openSection === 'activity'}
            onToggle={() => toggleSection('activity')}
          >
            {hasChildren ? (
              <ActivityFeed 
                userId={userId} 
                activeChildId={activeChildId || undefined}
                limit={8}
              />
            ) : (
              <SectionEmptyState
                title={t('dashboard.parent.empty.recent_activity.title', { defaultValue: 'Recent activity preview' })}
                description={t('dashboard.parent.empty.recent_activity.description', { defaultValue: "Once a child is linked, you'll see homework, messages, and announcements here." })}
                actionLabel={t('dashboard.parent.empty.add_child.cta', { defaultValue: 'Add Child' })}
                onAction={() => router.push('/dashboard/parent/register-child')}
              />
            )}
          </CollapsibleSection>
        )}

        {/* Content Sections (extracted) */}
        <ParentDashboardContentSections
          COPY={COPY}
          openSection={openSection}
          toggleSection={toggleSection}
          userId={userId}
          hasOrganization={hasOrganization}
          hasChildren={hasChildren}
          activeChild={activeChild}
          activeChildId={activeChildId}
          allChildrenArePreschoolers={allChildrenArePreschoolers}
          showLiveClassesHint={showLiveClassesHint}
          dismissLiveClassesHint={dismissLiveClassesHint}
          preschoolId={resolvedOrganizationId}
          parentInsights={parentInsights}
          parentAlerts={parentAlerts}
          insightsLoading={insightsLoading}
          insightsError={insightsError}
          hasUrgentInsights={hasUrgentInsights}
          unreadCount={unreadCount}
          missedCalls={missedCalls}
          homeworkCount={homeworkCount}
          attendanceRate={attendanceRate}
          pendingHomework={metrics.pendingHomework}
          organizationId={resolvedOrganizationId}
        />

        {/* Ad placeholders for free tier */}
        {showUpgradeBanner && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <AdBannerPlaceholder onUpgrade={() => router.push('/pricing')} variant="bottom" />
          </div>
        )}

        {/* Practice at Home + Early Learning (extracted) */}
        <PracticeAtHomeSection
          COPY={COPY}
          openSection={openSection}
          toggleSection={toggleSection}
          hasAnyChild={hasAnyChild}
          hasChildren={hasChildren}
          activeChild={activeChild}
          activeChildIsPreschool={activeChildIsPreschool}
          activeChildAge={activeChildAge}
          allChildrenArePreschoolers={allChildrenArePreschoolers}
          childrenCount={childrenCards.length}
          handleAskFromActivity={handleAskFromActivity}
        />
      </div>

      <DashOrbButton
        onClick={() => {
          const params = new URLSearchParams();
          params.set('prompt', t('dashboard.parent.dash_orb.prompt', { defaultValue: 'How can I support my child today?' }));
          params.set('display', t('dashboard.parent.dash_orb.display', { defaultValue: 'Dash AI Helper' }));
          router.push(`/dashboard/parent/dash-chat?${params.toString()}`);
        }}
      />
    </ParentShell>
  );
}
