'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { Calendar, Printer, FileDown } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface TimetableSlot {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  subject: string | null;
  activity_type: string;
  room: string | null;
  notes?: string | null;
}

const DAYS: Record<number, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};
const WEEKDAYS = [1, 2, 3, 4, 5];

export default function TeacherTimetablePage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(new Date().getDay() || 1);
  const [exporting, setExporting] = useState(false);

  const { profile } = useUserProfile(userId);
  const preschoolId = profile?.preschoolId || profile?.organizationId;

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setUserId(session.user.id);
    };
    void init();
  }, [router, supabase]);

  useEffect(() => {
    if (!preschoolId || !userId) return;
    const load = async () => {
      const { data } = await supabase
        .from('timetable_slots')
        .select('*')
        .eq('school_id', preschoolId)
        .eq('teacher_id', userId)
        .order('start_time');
      setSlots((data as TimetableSlot[]) || []);
      setLoading(false);
    };
    void load();
  }, [preschoolId, userId, supabase]);

  const daySlots = slots.filter((s) => s.day_of_week === selectedDay);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleSavePDF = useCallback(() => {
    setExporting(true);
    try {
      const doc = new jsPDF();
      let yPos = 20;

      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('My Weekly Timetable', 105, yPos, { align: 'center' });
      yPos += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`${DAYS[selectedDay] ?? 'Day ' + selectedDay} • ${new Date().toLocaleDateString()}`, 105, yPos, {
        align: 'center',
      });
      yPos += 12;

      const headers = ['Time', 'Subject / Activity', 'Room'];
      const rows = daySlots.map((s) => [
        `${s.start_time?.slice(0, 5) || ''} – ${s.end_time?.slice(0, 5) || ''}`,
        s.subject || s.activity_type || '',
        s.room || '-',
      ]);

      if (rows.length === 0) {
        doc.text('No classes scheduled', 20, yPos);
      } else {
        autoTable(doc, {
          head: [headers],
          body: rows,
          startY: yPos,
          theme: 'grid',
          headStyles: { fillColor: [124, 58, 237] },
        });
      }

      doc.setFontSize(9);
      doc.setTextColor(128, 128, 128);
      doc.text('EduDash Pro', 105, doc.internal.pageSize.height - 10, { align: 'center' });

      doc.save(`timetable-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [slots, selectedDay, daySlots]);

  return (
    <TeacherShell title="My Timetable">
      <div style={{ padding: 24, maxWidth: 720 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 16,
            marginBottom: 20,
          }}
        >
          <div>
            <h1 className="h1">My Weekly Timetable</h1>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>Your class schedule</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="qa"
              onClick={handlePrint}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <Printer size={16} /> Print
            </button>
            <button
              className="qa"
              onClick={handleSavePDF}
              disabled={exporting}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--primary)', color: 'white', border: 'none' }}
            >
              <FileDown size={16} /> {exporting ? 'Saving...' : 'Save PDF'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {WEEKDAYS.map((day) => (
            <button
              key={day}
              className="qa"
              onClick={() => setSelectedDay(day)}
              style={{
                background: selectedDay === day ? 'var(--primary)' : undefined,
                color: selectedDay === day ? 'white' : undefined,
                border: selectedDay === day ? 'none' : undefined,
              }}
            >
              <Calendar size={14} /> {DAYS[day]}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading...</p>
        ) : daySlots.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <Calendar size={40} color="var(--muted)" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontWeight: 600 }}>No classes scheduled for {DAYS[selectedDay] ?? 'Day ' + selectedDay}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {daySlots.map((slot) => (
              <div
                key={slot.id}
                className="card"
                style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 14 }}
              >
                <div style={{ minWidth: 80, textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 14 }}>
                    {slot.start_time?.slice(0, 5)}
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>–</div>
                  <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 14 }}>
                    {slot.end_time?.slice(0, 5)}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{slot.subject || slot.activity_type}</div>
                  {slot.room && <div style={{ fontSize: 13, color: 'var(--muted)' }}>📍 {slot.room}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </TeacherShell>
  );
}
