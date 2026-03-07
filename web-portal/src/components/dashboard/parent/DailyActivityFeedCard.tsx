"use client";

/**
 * DailyActivityFeedCard — Web dashboard widget
 *
 * Compact card showing today's activities from `student_activity_feed`.
 * Fixed: now reads from the correct table (matches teacher-post-activity).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createClient } from "@/lib/supabase/client";
import { Activity, BookOpen, GamepadIcon, Music, Palette, Sun, Star, Trophy, Utensils, Moon, Users, Sparkles } from "lucide-react";

interface ActivityRow {
  id: string;
  activity_type: string;
  title: string;
  description: string | null;
  media_urls: string[] | null;
  activity_at: string;
  duration_minutes: number | null;
  teacher?: { first_name: string | null; last_name: string | null } | null;
}

interface DailyActivityFeedCardProps {
  classId?: string | null;
  studentId?: string | null;
  date?: Date;
  maxItems?: number;
  showHeader?: boolean;
}

const ACTIVITY_ICONS: Record<string, typeof Activity> = {
  learning: BookOpen,
  play: GamepadIcon,
  meal: Utensils,
  rest: Moon,
  art: Palette,
  music: Music,
  story: BookOpen,
  outdoor: Sun,
  special: Star,
  milestone: Trophy,
  social: Users,
};

const ACTIVITY_COLORS: Record<string, string> = {
  learning: "#3B82F6",
  play: "#10B981",
  meal: "#EF4444",
  rest: "#6366F1",
  art: "#EC4899",
  music: "#8B5CF6",
  story: "#0EA5E9",
  outdoor: "#F59E0B",
  special: "#F97316",
  milestone: "#EAB308",
  social: "#06B6D4",
};

function formatTime(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(locale || "en-ZA", { hour: "2-digit", minute: "2-digit" });
}

export function DailyActivityFeedCard({
  classId,
  studentId,
  date = new Date(),
  maxItems = 8,
  showHeader = true,
}: DailyActivityFeedCardProps) {
  const { t, i18n } = useTranslation();
  const supabase = useMemo(() => createClient(), []);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const dateString = useMemo(() => date.toISOString().split("T")[0], [date]);

  const loadActivities = useCallback(async () => {
    if (!studentId) {
      setActivities([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const dayStart = `${dateString}T00:00:00.000Z`;
    const dayEnd = `${dateString}T23:59:59.999Z`;

    let query = supabase
      .from("student_activity_feed")
      .select("id, activity_type, title, description, media_urls, activity_at, duration_minutes, teacher:profiles!student_activity_feed_teacher_id_fkey(first_name, last_name)")
      .eq("student_id", studentId)
      .eq("is_published", true)
      .gte("activity_at", dayStart)
      .lte("activity_at", dayEnd)
      .order("activity_at", { ascending: true })
      .limit(maxItems);

    if (classId) {
      query = query.eq("class_id", classId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[DailyActivityFeedCard] Error:", error);
      setActivities([]);
    } else {
      setActivities((data || []) as ActivityRow[]);
    }
    setLoading(false);
  }, [studentId, classId, dateString, maxItems, supabase]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  // Real-time
  useEffect(() => {
    if (!studentId) return;
    const channel = supabase
      .channel(`web_daily_activities_${studentId}_${dateString}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "student_activity_feed", filter: `student_id=eq.${studentId}` },
        () => { void loadActivities(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [studentId, dateString, loadActivities, supabase]);

  if (loading) {
    return (
      <div className="card">
        <div className="sectionTitle">{t("dashboard.parent.daily_activity.title", { defaultValue: "Today's Activities" })}</div>
        <div className="muted">{t("dashboard.parent.daily_activity.loading", { defaultValue: "Loading activities..." })}</div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="card">
        {showHeader && (
          <div className="sectionTitle">
            {t("dashboard.parent.daily_activity.title", { defaultValue: "Today's Activities" })}
          </div>
        )}
        <div className="muted" style={{ fontWeight: 600 }}>
          {t("dashboard.parent.daily_activity.empty.title", { defaultValue: "No activities logged yet today" })}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          {t("dashboard.parent.daily_activity.empty.description", { defaultValue: "Check back later for updates from your child's teacher" })}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      {showHeader && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="sectionTitle" style={{ margin: 0 }}>{t("dashboard.parent.daily_activity.title", { defaultValue: "Today's Activities" })}</div>
          <a
            href="/dashboard/parent/activities"
            style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)", textDecoration: "none" }}
          >
            See all →
          </a>
        </div>
      )}
      <div style={{ display: "grid", gap: 12 }}>
        {activities.map((activity) => {
          const Icon = ACTIVITY_ICONS[activity.activity_type] || Activity;
          const color = ACTIVITY_COLORS[activity.activity_type] || "#F59E0B";
          const isExpanded = expandedId === activity.id;
          const teacherName = activity.teacher
            ? `${activity.teacher.first_name || ""} ${activity.teacher.last_name || ""}`.trim() || "Teacher"
            : "Teacher";
          const mediaUrls = (activity.media_urls || []) as string[];

          return (
            <div key={activity.id} className="card" style={{ padding: 12, border: "1px solid var(--border)" }}>
              <button
                onClick={() => setExpandedId(isExpanded ? null : activity.id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <div style={{
                    width: 34,
                    height: 34,
                    borderRadius: 12,
                    background: color + "18",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    <Icon size={16} style={{ color }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{activity.title}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      {formatTime(activity.activity_at, i18n.language)}
                    </div>
                  </div>
                </div>
                {activity.description && (
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>
                    {isExpanded ? activity.description : `${activity.description.slice(0, 120)}${activity.description.length > 120 ? "…" : ""}`}
                  </div>
                )}
              </button>

              {isExpanded && (
                <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 12, color: "var(--muted)" }}>
                  <div>Teacher: {teacherName}</div>
                  {activity.duration_minutes && <div>Duration: {activity.duration_minutes} min</div>}
                  {mediaUrls.length > 0 && (
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      {mediaUrls.slice(0, 3).map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }} />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
