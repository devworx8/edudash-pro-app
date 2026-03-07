'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Download, RefreshCw, Shirt, AlertCircle } from 'lucide-react';

interface UniformRow {
  id: string;
  child_name: string;
  age_years: number;
  tshirt_size: string;
  created_at: string;
  student_id: string;
  student?: {
    first_name?: string | null;
    last_name?: string | null;
    student_id?: string | null;
  } | null;
  parent?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
}

interface UniformOrdersWidgetProps {
  schoolId?: string;
}

const csvEscape = (value: string | number | null | undefined) => {
  const stringValue = value === null || value === undefined ? '' : String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/\"/g, '""')}"`;
  }
  return stringValue;
};

export function UniformOrdersWidget({ schoolId }: UniformOrdersWidgetProps) {
  const supabase = createClient();
  const [rows, setRows] = useState<UniformRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRows = async () => {
    if (!schoolId) return;
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('uniform_requests')
      .select('id, child_name, age_years, tshirt_size, created_at, student_id, student:students!uniform_requests_student_id_fkey(first_name,last_name,student_id), parent:profiles!uniform_requests_parent_id_fkey(first_name,last_name,email,phone)')
      .eq('preschool_id', schoolId)
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError('Unable to load uniform submissions.');
      setLoading(false);
      return;
    }

    setRows((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!schoolId) return;
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const exportCsv = () => {
    if (!rows.length) return;
    const headers = ['Child Name', 'Age', 'T-shirt Size', 'Student Code', 'Parent Name', 'Parent Email', 'Submitted'];
    const csvRows = rows.map((row) => {
      const studentName = row.child_name || `${row.student?.first_name || ''} ${row.student?.last_name || ''}`.trim();
      const parentName = `${row.parent?.first_name || ''} ${row.parent?.last_name || ''}`.trim();
      return [
        csvEscape(studentName),
        csvEscape(row.age_years),
        csvEscape(row.tshirt_size),
        csvEscape(row.student?.student_id || ''),
        csvEscape(parentName || row.parent?.email || ''),
        csvEscape(row.parent?.email || ''),
        csvEscape(new Date(row.created_at).toLocaleDateString('en-ZA')),
      ];
    });

    const csv = [headers, ...csvRows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `uniform-sizes-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const previewRows = useMemo(() => rows.slice(0, 5), [rows]);

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shirt size={18} style={{ color: 'var(--primary)' }} />
          <div>
            <div style={{ fontWeight: 600 }}>Uniform Sizes</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {rows.length} submissions
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/dashboard/principal/uniforms" className="btn btnSecondary">
            View all
          </Link>
          <button className="btn btnSecondary" onClick={loadRows} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn btnPrimary" onClick={exportCsv} disabled={!rows.length}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {loading && (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading submissions...</p>
      )}
      {error && (
        <p style={{ fontSize: 13, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertCircle size={14} /> {error}
        </p>
      )}

      {!loading && !rows.length && (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          No uniform sizes submitted yet.
        </p>
      )}

      {!loading && rows.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          {previewRows.map((row) => {
            const studentName = row.child_name || `${row.student?.first_name || ''} ${row.student?.last_name || ''}`.trim();
            return (
              <div key={row.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{studentName || 'Unnamed Child'}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Age {row.age_years} - Size {row.tshirt_size}
                </div>
              </div>
            );
          })}
          {rows.length > previewRows.length && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Showing {previewRows.length} of {rows.length} submissions. Export CSV for full list.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
