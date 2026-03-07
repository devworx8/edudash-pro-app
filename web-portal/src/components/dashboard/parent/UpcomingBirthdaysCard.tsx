"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createClient } from "@/lib/supabase/client";
import { calculateAgeOnDate, getDaysUntilDate, getNextBirthdayDate } from "@/lib/utils/dateUtils";
import type { PostgrestError } from "@supabase/supabase-js";
import { Cake, PartyPopper } from "lucide-react";

interface StudentRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  class_id: string | null;
  avatar_url: string | null;
}

interface UpcomingBirthday {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  daysUntil: number;
  ageTurning: number;
  avatarUrl?: string | null;
}

interface UpcomingBirthdaysCardProps {
  classId?: string | null;
  maxItems?: number;
  showHeader?: boolean;
  onViewAll?: () => void;
}

const isMissingSchema = (error?: PostgrestError | null) => {
  if (!error) return false;
  return error.code === "42P01" || error.code === "42703";
};

const calculateUpcomingBirthday = (dob: string, today: Date) => {
  const nextBirthday = getNextBirthdayDate(dob, today);
  if (!nextBirthday || Number.isNaN(nextBirthday.getTime())) return null;

  const daysUntil = getDaysUntilDate(nextBirthday, today);
  const ageTurning = calculateAgeOnDate(dob, nextBirthday);

  return { daysUntil, ageTurning };
};

export function UpcomingBirthdaysCard({
  classId,
  maxItems = 4,
  showHeader = true,
  onViewAll,
}: UpcomingBirthdaysCardProps) {
  const { t } = useTranslation();
  const supabase = useMemo(() => createClient(), []);
  const [birthdays, setBirthdays] = useState<UpcomingBirthday[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBirthdays = useCallback(async () => {
    if (!classId) {
      setBirthdays([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("students")
      .select("id, first_name, last_name, date_of_birth, class_id, avatar_url")
      .eq("class_id", classId)
      .eq("is_active", true);

    if (error) {
      if (!isMissingSchema(error)) {
        setBirthdays([]);
      }
      setLoading(false);
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rows = (data || []) as StudentRow[];
    const upcoming = rows
      .reduce<UpcomingBirthday[]>((acc, row) => {
        if (!row.date_of_birth) return acc;
        const calc = calculateUpcomingBirthday(row.date_of_birth, today);
        if (!calc) return acc;
        acc.push({
          id: row.id,
          studentId: row.id,
          firstName: row.first_name || t("common.student", { defaultValue: "Student" }),
          lastName: row.last_name || "",
          daysUntil: calc.daysUntil,
          ageTurning: calc.ageTurning,
          avatarUrl: row.avatar_url,
        });
        return acc;
      }, [])
      .filter((row) => row.daysUntil <= 30)
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, maxItems);

    setBirthdays(upcoming);
    setLoading(false);
  }, [classId, maxItems, supabase, t]);

  useEffect(() => {
    void loadBirthdays();
  }, [loadBirthdays]);

  if (loading) {
    return (
      <div className="card">
        <div className="sectionTitle">{t("dashboard.parent.birthdays.title", { defaultValue: "Upcoming Birthdays" })}</div>
        <div className="muted">{t("dashboard.parent.birthdays.loading", { defaultValue: "Loading birthdays..." })}</div>
      </div>
    );
  }

  const header = showHeader ? (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <PartyPopper size={18} style={{ color: "var(--primary)" }} />
        <div className="sectionTitle" style={{ margin: 0 }}>
          {t("dashboard.parent.birthdays.title", { defaultValue: "Upcoming Birthdays" })}
        </div>
      </div>
      {onViewAll && (
        <button
          onClick={onViewAll}
          style={{
            border: "1px solid var(--border)",
            padding: "6px 10px",
            borderRadius: 10,
            background: "transparent",
            color: "var(--text)",
            fontSize: 12,
            cursor: "pointer"
          }}
        >
          {t("dashboard.parent.birthdays.view_chart", { defaultValue: "View chart" })}
        </button>
      )}
    </div>
  ) : null;

  if (birthdays.length === 0) {
    return (
      <div className="card">
        {header}
        <div className="muted">
          {t("dashboard.parent.birthdays.none", { defaultValue: "No upcoming birthdays yet." })}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      {header}
      <div style={{ display: "grid", gap: 10 }}>
        {birthdays.map((birthday) => (
          <div
            key={birthday.id}
            className="card"
            style={{ padding: 12, border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "var(--surface-2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600,
              }}
            >
              {birthday.firstName.charAt(0)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>
                {birthday.firstName} {birthday.lastName}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {t("dashboard.parent.birthdays.turning_age", { defaultValue: "Turning {{age}}", age: birthday.ageTurning })}
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--primary)", display: "flex", alignItems: "center", gap: 4 }}>
              <Cake size={14} />
              {birthday.daysUntil === 0
                ? t("dashboard.parent.birthdays.today", { defaultValue: "Today" })
                : t("dashboard.parent.birthdays.in_days", { defaultValue: "In {{count}} days", count: birthday.daysUntil })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
