"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TeacherShell } from "@/components/dashboard/teacher/TeacherShell";
import { Calendar, Users, Bus, RefreshCw } from "lucide-react";

type Item = { type: string; id: string; title: string; date: string; time?: string; destination?: string };

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

export default function TeacherSchoolCalendarPage() {
  const router = useRouter();
  const supabase = createClient();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) { router.push("/sign-in"); return; }
    const { data, error: e } = await supabase.rpc("get_school_calendar_for_teacher");
    if (e) { setError(e.message); setItems([]); setLoading(false); return; }
    const p = data || {};
    const list: Item[] = [];
    (p.events || []).forEach((x: any) => list.push({ type: "event", id: x.id, title: x.title, date: x.start_date }));
    (p.meetings || []).forEach((x: any) => list.push({ type: "meeting", id: x.id, title: x.title, date: x.meeting_date, time: x.start_time }));
    (p.excursions || []).forEach((x: any) => list.push({ type: "excursion", id: x.id, title: x.title, date: x.excursion_date, destination: x.destination }));
    list.sort((a, b) => a.date.localeCompare(b.date));
    setItems(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const icon = (t: string) => t === "event" ? Calendar : t === "meeting" ? Users : Bus;
  const color = (t: string) => t === "event" ? "#10B981" : t === "meeting" ? "#8B5CF6" : "#F59E0B";

  return (
    <TeacherShell>
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-2">School Calendar</h1>
        <p className="text-muted-foreground mb-6">Events, meetings and excursions</p>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <RefreshCw className="h-12 w-12 animate-spin text-primary mb-4" />
            <p>Loading...</p>
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-destructive">{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <Calendar className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <p className="font-medium">No upcoming events</p>
            <p className="text-muted-foreground text-sm mt-1">Events, meetings and excursions will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const Icon = icon(item.type);
              return (
                <div key={`${item.type}-${item.id}`} className="border rounded-lg p-4 flex gap-3" style={{ borderLeftWidth: 4, borderLeftColor: color(item.type) }}>
                  <Icon className="h-5 w-5 shrink-0" style={{ color: color(item.type) }} />
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{formatDate(item.date)}{item.time ? ` • ${item.time}` : ""}{item.destination ? ` • ${item.destination}` : ""}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </TeacherShell>
  );
}
