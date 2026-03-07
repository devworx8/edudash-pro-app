'use client';

/**
 * Teacher Weekly Menu Page (Web)
 *
 * Read-only view of the school weekly menu for teachers.
 * Teachers can view but cannot upload or edit menus.
 *
 * @module web/src/app/dashboard/teacher/menu/page
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, ChefHat, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { SchoolMenuService } from '@/lib/services/schoolMenuService';
import type { WeeklyMenuDraft } from '@/lib/services/schoolMenu.types';
import { isWeeklyMenuBridgeEnabled, isWeeklyMenuDedicatedEnabled } from '@/lib/services/schoolMenuFeatureFlags';

export default function TeacherMenuPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [preschoolId, setPreschoolId] = useState<string | null>(null);
  const [preschoolName, setPreschoolName] = useState<string | null>(null);

  const [selectedWeek, setSelectedWeek] = useState<string>(() =>
    SchoolMenuService.startOfWeekMonday(new Date()),
  );
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([]);
  const [weekDraft, setWeekDraft] = useState<WeeklyMenuDraft | null>(null);
  const weeklyMenuVisible = isWeeklyMenuBridgeEnabled() || isWeeklyMenuDedicatedEnabled();

  // Auth + org lookup
  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/sign-in');
        return;
      }

      // Get teacher org membership
      const { data: member } = await supabase
        .from('org_members')
        .select('organization_id, organizations:organization_id(name)')
        .eq('user_id', user.id)
        .maybeSingle();

      if (member) {
        setPreschoolId((member as any).organization_id);
        const org = (member as any).organizations;
        setPreschoolName(
          Array.isArray(org) ? org[0]?.name : org?.name || null,
        );
      }
    };

    void init();
  }, [router, supabase]);

  const loadMenu = async () => {
    if (!preschoolId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [weeks, draft] = await Promise.all([
        SchoolMenuService.getAvailableWeeks(preschoolId),
        SchoolMenuService.getWeekMenuWithFallback(preschoolId, selectedWeek),
      ]);

      const mergedWeeks = weeks.includes(selectedWeek)
        ? weeks
        : [selectedWeek, ...weeks];
      setAvailableWeeks(
        Array.from(new Set(mergedWeeks)).sort((a, b) => b.localeCompare(a)),
      );
      setWeekDraft(draft);
    } catch {
      setWeekDraft(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!preschoolId) return;
    void loadMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preschoolId, selectedWeek]);

  return (
    <TeacherShell hideHeader>
      <div className="section" style={{ display: 'grid', gap: 16 }}>
        {!weeklyMenuVisible && (
          <div className="card" style={{ color: 'var(--textLight)' }}>
            Weekly menu is currently disabled by feature flag.
          </div>
        )}

        <div>
          <h1
            className="h1"
            style={{ display: 'flex', alignItems: 'center', gap: 10 }}
          >
            <ChefHat
              className="icon24"
              style={{ color: 'var(--primary)' }}
            />
            Weekly Menu
          </h1>
          <p style={{ margin: '8px 0 0 0', color: 'var(--textLight)' }}>
            {preschoolName
              ? `View the weekly menu for ${preschoolName}.`
              : 'View the school weekly menu.'}
          </p>
        </div>

        <div
          className="card"
          style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <CalendarDays
            className="icon16"
            style={{ color: 'var(--textLight)' }}
          />
          <label style={{ fontSize: 14, color: 'var(--textLight)' }}>
            Week:
          </label>
          <select
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface-1)',
              fontSize: 14,
              minWidth: 220,
            }}
          >
            {availableWeeks.map((week) => (
              <option key={week} value={week}>
                {new Date(`${week}T00:00:00.000Z`).toLocaleDateString(
                  'en-ZA',
                  { year: 'numeric', month: 'short', day: 'numeric' },
                )}
              </option>
            ))}
          </select>
          <button
            className="btn btnSecondary"
            onClick={() => void loadMenu()}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <RefreshCw className="icon16" />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: 30 }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : !weeklyMenuVisible ? (
          <div
            className="card"
            style={{ textAlign: 'center', padding: 30, color: 'var(--textLight)' }}
          >
            Weekly menu is temporarily unavailable.
          </div>
        ) : !preschoolId ? (
          <div
            className="card"
            style={{ textAlign: 'center', padding: 30, color: 'var(--textLight)' }}
          >
            No school found for your account.
          </div>
        ) : !weekDraft ? (
          <div
            className="card"
            style={{ textAlign: 'center', padding: 30, color: 'var(--textLight)' }}
          >
            No menu has been published for this week yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {weekDraft.days.map((day) => {
              const date = new Date(`${day.date}T00:00:00.000Z`);
              return (
                <div
                  key={day.date}
                  className="card"
                  style={{ border: '1px solid var(--border)' }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>
                    {date.toLocaleDateString('en-ZA', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--textLight)' }}>
                        Breakfast
                      </div>
                      <div style={{ fontSize: 14 }}>
                        {day.breakfast.length
                          ? day.breakfast.join(', ')
                          : 'Not provided'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--textLight)' }}>
                        Lunch
                      </div>
                      <div style={{ fontSize: 14 }}>
                        {day.lunch.length
                          ? day.lunch.join(', ')
                          : 'Not provided'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--textLight)' }}>
                        Snack
                      </div>
                      <div style={{ fontSize: 14 }}>
                        {day.snack.length
                          ? day.snack.join(', ')
                          : 'Not provided'}
                      </div>
                    </div>
                  </div>
                  {day.notes && (
                    <div
                      style={{
                        marginTop: 10,
                        fontSize: 13,
                        color: 'var(--textLight)',
                      }}
                    >
                      Notes: {day.notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </TeacherShell>
  );
}
