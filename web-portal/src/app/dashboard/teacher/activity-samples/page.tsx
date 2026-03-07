'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { BookOpen, Printer, FileDown } from 'lucide-react';
import jsPDF from 'jspdf';

interface ActivitySample {
  id: string;
  strand: string;
  title: string;
  description: string | null;
  age_group: string | null;
  duration_minutes: number | null;
  objectives: string[];
  materials: string[];
  instructions: string | null;
  caps_alignment: string | null;
}

const STRAND_LABELS: Record<string, string> = {
  literacy: 'Literacy',
  numeracy: 'Numeracy',
  life_skills: 'Life Skills',
  creative: 'Creative',
  physical: 'Physical',
  other: 'Other',
};

export default function ActivitySamplesPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [samples, setSamples] = useState<ActivitySample[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStrand, setSelectedStrand] = useState<string | null>(null);
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
    const load = async () => {
      let query = supabase
        .from('activity_sample_library')
        .select('*')
        .eq('is_system_template', true)
        .order('strand')
        .order('title');
      if (preschoolId) {
        query = query.or(`preschool_id.is.null,preschool_id.eq.${preschoolId}`);
      } else {
        query = query.is('preschool_id', null);
      }
      const { data } = await query;
      const rows = (data || []).map((r: any) => ({
        ...r,
        objectives: Array.isArray(r.objectives) ? r.objectives : [],
        materials: Array.isArray(r.materials) ? r.materials : [],
      }));
      setSamples(rows);
      setLoading(false);
    };
    void load();
  }, [preschoolId, supabase]);

  const filteredSamples = selectedStrand ? samples.filter((s) => s.strand === selectedStrand) : samples;
  const strands = Array.from(new Set(samples.map((s) => s.strand)));

  const handleSavePDF = useCallback((sample: ActivitySample) => {
    setExporting(true);
    try {
      const doc = new jsPDF();
      let y = 20;
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(sample.title, 20, y);
      y += 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`${STRAND_LABELS[sample.strand] || sample.strand}${sample.age_group ? ` • ${sample.age_group}` : ''}${sample.duration_minutes ? ` • ${sample.duration_minutes} min` : ''}`, 20, y);
      y += 10;
      if (sample.description) {
        doc.setFontSize(11);
        const descLines = doc.splitTextToSize(sample.description, 170);
        doc.text(descLines, 20, y);
        y += descLines.length * 5 + 8;
      }
      doc.setFont('helvetica', 'bold');
      doc.text('Objectives', 20, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      (sample.objectives || []).forEach((o) => {
        doc.text(`• ${o}`, 25, y);
        y += 5;
      });
      y += 4;
      doc.setFont('helvetica', 'bold');
      doc.text('Materials', 20, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      (sample.materials || []).forEach((m) => {
        doc.text(`• ${m}`, 25, y);
        y += 5;
      });
      if (sample.instructions) {
        y += 6;
        doc.setFont('helvetica', 'bold');
        doc.text('Instructions', 20, y);
        y += 6;
        doc.setFont('helvetica', 'normal');
        const instLines = doc.splitTextToSize(sample.instructions, 170);
        doc.text(instLines, 20, y);
        y += instLines.length * 5;
      }
      if (sample.caps_alignment) {
        y += 8;
        doc.setFontSize(9);
        doc.setTextColor(128, 128, 128);
        doc.text(sample.caps_alignment, 20, y);
      }
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);
      doc.text(`EduDash Pro • ${new Date().toLocaleDateString()}`, 105, doc.internal.pageSize.height - 10, { align: 'center' });
      doc.save(`activity-${sample.title.replace(/\s+/g, '-').toLowerCase().slice(0, 30)}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setExporting(false);
    }
  }, []);

  return (
    <TeacherShell title="Activity Samples">
      <div style={{ padding: 24, maxWidth: 800 }}>
        <h1 className="h1" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BookOpen className="icon24" style={{ color: 'var(--primary)' }} />
          Literacy, Numeracy & Life Skills
        </h1>
        <p style={{ marginTop: 6, color: 'var(--muted)' }}>CAPS-aligned activity samples for planning</p>

        {strands.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 20, marginBottom: 20, flexWrap: 'wrap' }}>
            <button
              className="qa"
              onClick={() => setSelectedStrand(null)}
              style={{ background: !selectedStrand ? 'var(--primary)' : undefined, color: !selectedStrand ? 'white' : undefined }}
            >
              All
            </button>
            {strands.map((strand) => (
              <button
                key={strand}
                className="qa"
                onClick={() => setSelectedStrand(strand)}
                style={{ background: selectedStrand === strand ? 'var(--primary)' : undefined, color: selectedStrand === strand ? 'white' : undefined }}
              >
                {STRAND_LABELS[strand] || strand}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <p style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading...</p>
        ) : filteredSamples.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <BookOpen size={40} color="var(--muted)" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontWeight: 600 }}>No activity samples found</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredSamples.map((sample) => (
              <div key={sample.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)', textTransform: 'uppercase' }}>
                      {STRAND_LABELS[sample.strand] || sample.strand}
                    </span>
                    <h3 style={{ margin: '4px 0 0 0', fontSize: 16 }}>{sample.title}</h3>
                    {sample.description && <p style={{ margin: '8px 0 0 0', color: 'var(--muted)', fontSize: 14 }}>{sample.description}</p>}
                    <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--muted)' }}>
                      {[sample.age_group, sample.duration_minutes ? `${sample.duration_minutes} min` : null].filter(Boolean).join(' • ')}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="iconBtn" onClick={() => window.print()} title="Print">
                      <Printer size={16} />
                    </button>
                    <button
                      className="iconBtn"
                      onClick={() => handleSavePDF(sample)}
                      disabled={exporting}
                      title="Save PDF"
                      style={{ background: 'var(--primary)', color: 'white', border: 'none' }}
                    >
                      <FileDown size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </TeacherShell>
  );
}
