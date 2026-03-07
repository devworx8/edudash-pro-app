"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { createClient } from "@/lib/supabase/client";
import { Award, BookOpen, CalendarCheck, Sparkles } from "lucide-react";

interface ProgressStat {
  label: string;
  value: number;
  max: number;
  color: string;
  icon: ComponentType<{ size?: number; style?: React.CSSProperties }>;
}

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: ComponentType<{ size?: number; style?: React.CSSProperties }>;
  color: string;
  earnedAt?: string | null;
  progress?: number;
}

interface AchievementRow {
  id: string;
  achievement_type: string | null;
  achievement_name: string | null;
  description: string | null;
  achievement_icon: string | null;
  achievement_color: string | null;
  earned_at: string | null;
  created_at: string | null;
}

interface AttendanceRow {
  attendance_date: string;
  status: string | null;
}

interface HomeworkAssignmentRow {
  id: string;
}

interface HomeworkSubmissionRow {
  assignment_id: string;
  status: string | null;
}

interface StudentRow {
  class_id: string | null;
}

interface ChildProgressBadgesCardProps {
  studentId: string;
  showHeader?: boolean;
}

export function ChildProgressBadgesCard({ studentId, showHeader = true }: ChildProgressBadgesCardProps) {
  const { t } = useTranslation();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ProgressStat[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);

  const badgeDefinitions = useMemo<Badge[]>(
    () => [
      {
        id: "attendance_star",
        name: t("dashboard.parent.progress.badges.attendance_star.name", { defaultValue: "Attendance Star" }),
        description: t("dashboard.parent.progress.badges.attendance_star.description", { defaultValue: "5-day attendance streak" }),
        icon: Award,
        color: "#f59e0b",
      },
      {
        id: "homework_hero",
        name: t("dashboard.parent.progress.badges.homework_hero.name", { defaultValue: "Homework Hero" }),
        description: t("dashboard.parent.progress.badges.homework_hero.description", { defaultValue: "Completed all homework this week" }),
        icon: BookOpen,
        color: "#3b82f6",
      },
      {
        id: "helping_hand",
        name: t("dashboard.parent.progress.badges.helping_hand.name", { defaultValue: "Helping Hand" }),
        description: t("dashboard.parent.progress.badges.helping_hand.description", { defaultValue: "Helped a friend today" }),
        icon: Sparkles,
        color: "#ec4899",
      },
    ],
    [t]
  );

  const loadProgress = useCallback(async () => {
    if (!studentId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const today = new Date();
      const windowStart = new Date(today);
      windowStart.setDate(today.getDate() - 6);
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay() + 1);

      // Attendance (last 5 recorded days)
      const { data: attendanceData } = await supabase
        .from("attendance")
        .select("attendance_date, status")
        .eq("student_id", studentId)
        .gte("attendance_date", windowStart.toISOString().split("T")[0])
        .order("attendance_date", { ascending: false });

      const attendanceRows = (attendanceData || []) as AttendanceRow[];
      const seenDates = new Set<string>();
      const recentAttendance = attendanceRows.filter((row) => {
        if (!row.attendance_date || seenDates.has(row.attendance_date)) return false;
        seenDates.add(row.attendance_date);
        return true;
      }).slice(0, 5);

      const presentDays = recentAttendance.filter((row) => String(row.status || "").toLowerCase() === "present").length;

      // Homework completion
      const { data: studentData } = await supabase
        .from("students")
        .select("class_id")
        .eq("id", studentId)
        .single();

      let completedHomework = 0;
      let totalHomework = 4;

      const classId = (studentData as StudentRow | null)?.class_id ?? null;
      if (classId) {
        const { data: assignments } = await supabase
          .from("homework_assignments")
          .select("id")
          .eq("class_id", classId)
          .eq("is_published", true)
          .gte("created_at", weekStart.toISOString())
          .lte("due_date", new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString());

        const assignmentRows = (assignments || []) as HomeworkAssignmentRow[];
        const assignmentIds = assignmentRows.map((row) => row.id);
        if (assignmentIds.length > 0) {
          const { data: submissions } = await supabase
            .from("homework_submissions")
            .select("assignment_id, status")
            .eq("student_id", studentId)
            .in("assignment_id", assignmentIds);

          const submissionRows = (submissions || []) as HomeworkSubmissionRow[];
          completedHomework = submissionRows.filter((row) => {
            const status = String(row.status || "").toLowerCase();
            return status === "submitted" || status === "graded";
          }).length;
          totalHomework = Math.max(assignmentIds.length, 4);
        }
      }

      setStats([
        {
          label: t("dashboard.parent.progress.stats.attendance", { defaultValue: "Attendance" }),
          value: presentDays,
          max: 5,
          color: "#10b981",
          icon: CalendarCheck,
        },
        {
          label: t("dashboard.parent.progress.stats.homework", { defaultValue: "Homework" }),
          value: completedHomework,
          max: totalHomework,
          color: "#3b82f6",
          icon: BookOpen,
        },
      ]);

      // Achievements
      const { data: achievements } = await supabase
        .from("student_achievements")
        .select("id, achievement_type, achievement_name, description, achievement_icon, achievement_color, earned_at, created_at")
        .eq("student_id", studentId)
        .order("earned_at", { ascending: false });

      const achievementRows = (achievements || []) as AchievementRow[];
      const mappedBadges: Badge[] = [];

      achievementRows.forEach((row) => {
        const definition = badgeDefinitions.find((badge) => badge.id === row.achievement_type);
        const color = row.achievement_color || definition?.color || "#f59e0b";
        const name =
          row.achievement_name ||
          definition?.name ||
          t("dashboard.parent.progress.badges.default_name", { defaultValue: "Achievement" });
        const description = row.description || definition?.description || "";
        mappedBadges.push({
          id: row.id,
          name,
          description,
          icon: definition?.icon || Award,
          color,
          earnedAt: row.earned_at || row.created_at,
        });
      });

      // Add progress-based badges if not earned
      if (!mappedBadges.some((badge) => badge.id === "attendance_star")) {
        mappedBadges.push({
          ...badgeDefinitions.find((badge) => badge.id === "attendance_star")!,
          progress: Math.min((presentDays / 5) * 100, 100),
        });
      }
      if (!mappedBadges.some((badge) => badge.id === "homework_hero")) {
        mappedBadges.push({
          ...badgeDefinitions.find((badge) => badge.id === "homework_hero")!,
          progress: Math.min((completedHomework / totalHomework) * 100, 100),
        });
      }

      setBadges(mappedBadges.slice(0, 4));
    } finally {
      setLoading(false);
    }
  }, [studentId, supabase]);

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  if (loading) {
    return (
      <div className="card">
        <div className="sectionTitle">{t("dashboard.parent.progress.title", { defaultValue: "Progress & Achievements" })}</div>
        <div className="muted">{t("dashboard.parent.progress.loading", { defaultValue: "Loading progress..." })}</div>
      </div>
    );
  }

  if (stats.length === 0 && badges.length === 0) {
    return (
      <div className="card">
        {showHeader && (
          <div className="sectionTitle" style={{ marginBottom: 8 }}>
            {t("dashboard.parent.progress.title", { defaultValue: "Progress & Achievements" })}
          </div>
        )}
        <div className="muted">
          {t("dashboard.parent.progress.empty", { defaultValue: "No progress data yet." })}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      {showHeader && (
        <div className="sectionTitle" style={{ marginBottom: 16 }}>
          {t("dashboard.parent.progress.title", { defaultValue: "Progress & Achievements" })}
        </div>
      )}

      <div className="grid2" style={{ marginBottom: 16 }}>
        {stats.map((stat) => {
          const Icon = stat.icon;
          const percentage = stat.max > 0 ? Math.round((stat.value / stat.max) * 100) : 0;
          return (
            <div key={stat.label} className="card" style={{ padding: 12, border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Icon size={16} style={{ color: stat.color }} />
                <strong>{stat.label}</strong>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: stat.color }}>
                {stat.value}/{stat.max}
              </div>
              <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 999, marginTop: 8 }}>
                <div style={{ width: `${percentage}%`, height: "100%", background: stat.color, borderRadius: 999 }} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {badges.map((badge) => {
          const Icon = badge.icon;
          const progress = badge.progress ?? 100;
          const earned = Boolean(badge.earnedAt) || progress >= 100;
          return (
            <div key={badge.id} className="card" style={{ padding: 12, border: `1px solid ${badge.color}55` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  background: `${badge.color}22`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <Icon size={18} style={{ color: badge.color }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{badge.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{badge.description}</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: badge.color }}>
                  {earned ? t("dashboard.parent.progress.badges.earned", { defaultValue: "Earned" }) : `${Math.round(progress)}%`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
