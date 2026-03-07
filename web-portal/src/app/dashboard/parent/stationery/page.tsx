'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { StationeryChecklistWidget } from '@/components/dashboard/parent/StationeryChecklistWidget';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useChildrenData } from '@/lib/hooks/parent/useChildrenData';
import { ClipboardCheck, RefreshCw } from 'lucide-react';

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

export default function ParentStationeryPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const academicYear = useMemo(() => getCurrentAcademicYear(), []);

  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [featureLoading, setFeatureLoading] = useState(false);
  const [stationeryEnabled, setStationeryEnabled] = useState(false);
  const [enabledSchoolIds, setEnabledSchoolIds] = useState<string[]>([]);

  const { profile, loading: profileLoading } = useUserProfile(userId);
  const { childrenCards, loading: childrenLoading, refetch } = useChildrenData(userId);

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/sign-in');
        return;
      }
      setUserId(user.id);
    };
    void init();
  }, [router, supabase]);

  useEffect(() => {
    let cancelled = false;
    const loadFeature = async () => {
      const schoolIds = Array.from(new Set(childrenCards.flatMap((child) => getChildSchoolIds(child)))) as string[];
      if (!schoolIds.length) {
        if (!cancelled) {
          setStationeryEnabled(false);
          setEnabledSchoolIds([]);
        }
        return;
      }

      setFeatureLoading(true);
      try {
        const [{ data: preschools }, { data: orgs }, { data: publishedLists }] = await Promise.all([
          supabase.from('preschools').select('id, settings').in('id', schoolIds),
          supabase.from('organizations').select('id, settings').in('id', schoolIds),
          supabase
            .from('stationery_lists')
            .select('school_id')
            .in('school_id', schoolIds)
            .eq('academic_year', academicYear)
            .eq('is_visible', true)
            .eq('is_published', true),
        ]);

        const preschoolsById = new Map<string, any>(
          (preschools || []).map((row: any) => [String(row.id), row])
        );
        const organizationsById = new Map<string, any>(
          (orgs || []).map((row: any) => [String(row.id), row])
        );
        const publishedBySchoolId = new Set<string>(
          (publishedLists || [])
            .map((row: any) => String(row?.school_id || '').trim())
            .filter(Boolean)
        );

        const ids = new Set<string>();
        schoolIds.forEach((schoolId) => {
          const preschoolValue = preschoolsById.get(schoolId)?.settings?.features?.stationery?.enabled;
          const organizationValue = organizationsById.get(schoolId)?.settings?.features?.stationery?.enabled;
          const resolvedValue =
            typeof preschoolValue === 'boolean'
              ? preschoolValue
              : (typeof organizationValue === 'boolean' ? organizationValue : undefined);

          if (resolvedValue === true) {
            ids.add(schoolId);
            return;
          }
          if (resolvedValue === false) {
            return;
          }
          if (publishedBySchoolId.has(schoolId)) {
            ids.add(schoolId);
          }
        });

        if (!cancelled) {
          const list = Array.from(ids);
          setEnabledSchoolIds(list);
          setStationeryEnabled(list.length > 0);
        }
      } finally {
        if (!cancelled) setFeatureLoading(false);
      }
    };

    void loadFeature();
    return () => {
      cancelled = true;
    };
  }, [academicYear, childrenCards, supabase]);

  const visibleChildren = useMemo(
    () =>
      childrenCards.filter((child) =>
        getChildSchoolIds(child).some((schoolId) => enabledSchoolIds.includes(schoolId))
      ),
    [childrenCards, enabledSchoolIds]
  );

  const loading = !userId || profileLoading || childrenLoading;

  return (
    <ParentShell
      tenantSlug={profile?.preschoolSlug}
      userEmail={profile?.email}
      userName={profile?.firstName}
      preschoolName={profile?.preschoolName || profile?.organizationName}
      hasOrganization={Boolean(profile?.organizationId || profile?.preschoolId)}
      hideHeader
    >
      <div className="section" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 className="h1" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ClipboardCheck className="icon24" style={{ color: 'var(--primary)' }} />
              Stationery Checklist
            </h1>
            <p style={{ margin: '8px 0 0', color: 'var(--textLight)' }}>
              Track bought items, what is still needed, and expected delivery dates for each child.
            </p>
          </div>
          <button
            className="btn btnSecondary"
            onClick={() => {
              void refetch();
            }}
            disabled={loading || featureLoading}
          >
            <RefreshCw className="icon14" />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: 24 }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : childrenCards.length === 0 ? (
          <div className="card" style={{ color: 'var(--textLight)' }}>
            No linked children found yet. Add a child to start stationery tracking.
          </div>
        ) : !stationeryEnabled ? (
          <div className="card" style={{ color: 'var(--textLight)' }}>
            Stationery tracking is currently disabled by your school. Ask the principal/admin to enable it in school settings.
          </div>
        ) : (
          <StationeryChecklistWidget childrenCards={visibleChildren} />
        )}
      </div>
    </ParentShell>
  );
}
