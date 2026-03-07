'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { Download, RefreshCw, Search, Shirt } from 'lucide-react';
import { hasAssignedBackNumber, needsGeneratedBackNumber } from '@/hooks/principal-uniforms/numbering';

interface UniformRow {
  id: string;
  child_name: string;
  age_years: number;
  tshirt_size: string;
  tshirt_quantity?: number | null;
  shorts_quantity?: number | null;
  sample_supplied?: boolean | null;
  tshirt_number?: string | null;
  created_at: string;
  updated_at?: string | null;
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

interface DisplayRow {
  id: string;
  studentId: string;
  childName: string;
  ageYears: number;
  tshirtSize: string;
  tshirtQuantity: number | null;
  shortsQuantity: number | null;
  sampleSupplied: boolean;
  tshirtNumber: string;
  studentCode: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  submittedAt: string;
  paymentStatus: 'paid' | 'pending' | 'unpaid';
}

const SIZE_OPTIONS = [
  '2-3',
  '3-4',
  '4-5',
  '5-6',
  '6-7',
  '7-8',
  '8-9',
  '9-10',
  '10-11',
  '11-12',
  '12-13',
  'XS',
  'S',
  'M',
  'L',
  'XL',
];

const csvEscape = (value: string | number | null | undefined) => {
  const stringValue = value === null || value === undefined ? '' : String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/\"/g, '""')}"`;
  }
  return stringValue;
};

const htmlEscape = (value: string | number | null | undefined) => {
  const stringValue = value === null || value === undefined ? '' : String(value);
  return stringValue
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

export default function UniformsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [rows, setRows] = useState<UniformRow[]>([]);
  const [paymentStatusByStudent, setPaymentStatusByStudent] = useState<Map<string, 'paid' | 'pending' | 'unpaid'>>(
    () => new Map()
  );
  const [loading, setLoading] = useState(true);
  const [generatingNumbers, setGeneratingNumbers] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);

  const { profile } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const preschoolName = profile?.preschoolName || profile?.organizationName;
  const schoolId = profile?.preschoolId || profile?.organizationId;

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setUserId(session.user.id);
    };
    initAuth();
  }, [router, supabase]);

  const loadUniforms = async () => {
    if (!schoolId) {
      setRows([]);
      setLoading(false);
      setError('No school linked to your profile.');
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('uniform_requests')
      .select('id, child_name, age_years, tshirt_size, tshirt_quantity, shorts_quantity, sample_supplied, tshirt_number, created_at, updated_at, student_id, student:students!uniform_requests_student_id_fkey(first_name,last_name,student_id), parent:profiles!uniform_requests_parent_id_fkey(first_name,last_name,email,phone)')
      .eq('preschool_id', schoolId)
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError('Unable to load uniform submissions.');
      setLoading(false);
      return;
    }

    setRows((data as any) || []);

    const studentIds = ((data as any[]) || []).map((row) => row.student_id).filter(Boolean);
    if (studentIds.length > 0) {
      const [{ data: popData }, { data: paymentsData }] = await Promise.all([
        supabase
          .from('pop_uploads')
          .select('student_id, status, description, title')
          .eq('preschool_id', schoolId)
          .eq('upload_type', 'proof_of_payment')
          .in('student_id', studentIds),
        supabase
          .from('payments')
          .select('student_id, status, description, metadata')
          .eq('preschool_id', schoolId)
          .in('student_id', studentIds),
      ]);

      const nextMap = new Map<string, 'paid' | 'pending' | 'unpaid'>();
      studentIds.forEach((id: string) => nextMap.set(id, 'unpaid'));

      const isUniformPaymentRecord = (payment: any): boolean => {
        const text = (payment?.description || '').toLowerCase();
        const purpose = (payment?.metadata?.payment_purpose || '').toLowerCase();
        const context = (payment?.metadata?.payment_context || '').toLowerCase();
        const feeType = (payment?.metadata?.fee_type || '').toLowerCase();
        return text.includes('uniform') || purpose.includes('uniform') || context === 'uniform' || feeType === 'uniform';
      };

      (popData || [])
        .filter((pop: any) => String(pop?.description || '').toLowerCase().includes('uniform') || String(pop?.title || '').toLowerCase().includes('uniform'))
        .forEach((pop: any) => {
          const current = nextMap.get(pop.student_id) || 'unpaid';
          if (pop.status === 'approved') {
            nextMap.set(pop.student_id, 'paid');
            return;
          }
          if (current !== 'paid' && ['pending', 'submitted'].includes(String(pop.status))) {
            nextMap.set(pop.student_id, 'pending');
          }
        });

      (paymentsData || []).filter(isUniformPaymentRecord).forEach((payment: any) => {
        if (!payment.student_id) return;
        if (['completed', 'approved'].includes(String(payment.status))) {
          nextMap.set(payment.student_id, 'paid');
        }
      });

      setPaymentStatusByStudent(nextMap);
    } else {
      setPaymentStatusByStudent(new Map());
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      return;
    }
    loadUniforms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const displayRows = useMemo<DisplayRow[]>(() => {
    return rows.map((row) => {
      const childName = row.child_name || `${row.student?.first_name || ''} ${row.student?.last_name || ''}`.trim();
      const parentName = `${row.parent?.first_name || ''} ${row.parent?.last_name || ''}`.trim();
      return {
        id: row.id,
        studentId: row.student_id,
        childName: childName || 'Unnamed Child',
        ageYears: row.age_years,
        tshirtSize: row.tshirt_size,
        tshirtQuantity: row.tshirt_quantity ?? null,
        shortsQuantity: row.shorts_quantity ?? null,
        sampleSupplied: Boolean(row.sample_supplied),
        tshirtNumber: row.tshirt_number || '',
        studentCode: row.student?.student_id || '',
        parentName: parentName || row.parent?.email || '',
        parentEmail: row.parent?.email || '',
        parentPhone: row.parent?.phone || '',
        submittedAt: row.created_at,
        paymentStatus: paymentStatusByStudent.get(row.student_id) || 'unpaid',
      };
    });
  }, [rows, paymentStatusByStudent]);

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return displayRows.filter((row) => {
      const matchesSearch = !term || [
        row.childName,
        row.studentCode,
        row.parentName,
        row.parentEmail,
      ].some((field) => field.toLowerCase().includes(term));
      const matchesSize = sizeFilter === 'all' || row.tshirtSize === sizeFilter;
      return matchesSearch && matchesSize;
    });
  }, [displayRows, searchTerm, sizeFilter]);

  const missingNumberCount = useMemo(
    () => rows.filter((row) => needsGeneratedBackNumber(row.tshirt_number)).length,
    [rows]
  );

  const markUniformPaid = async (row: DisplayRow) => {
    if (!schoolId || !row.studentId || markingPaidId) return;
    const confirm = window.confirm(
      `Mark ${row.childName}'s uniform as paid? This will add a uniform payment record and update dashboards.`
    );
    if (!confirm) return;

    try {
      setMarkingPaidId(row.id);
      const { error: insertError } = await supabase
        .from('payments')
        .insert({
          student_id: row.studentId,
          preschool_id: schoolId,
          amount: 0,
          amount_cents: 0,
          currency: 'ZAR',
          status: 'completed',
          description: `Uniform payment marked paid by school for ${row.childName}`,
          metadata: {
            payment_context: 'uniform',
            fee_type: 'uniform',
          },
        })
        .select('id')
        .single();

      if (insertError) {
        throw insertError;
      }

      await loadUniforms();
    } catch (e: any) {
      setError(e?.message || 'Failed to mark uniform as paid.');
    } finally {
      setMarkingPaidId(null);
    }
  };

  const generateMissingNumbers = async () => {
    if (!schoolId || generatingNumbers) return;

    const missingRows = rows.filter((row) => needsGeneratedBackNumber(row.tshirt_number));
    if (missingRows.length === 0) {
      window.alert('All uniform orders already have T-shirt numbers.');
      return;
    }

    const shouldProceed = window.confirm(
      `Generate unique 1–2 digit numbers (1-99) for ${missingRows.length} order(s) without numbers?`
    );
    if (!shouldProceed) return;

    const usedNumbers = new Set<number>();
    rows.forEach((row) => {
      const parsed = Number.parseInt(String(row.tshirt_number || '').trim(), 10);
      if (!hasAssignedBackNumber(row.tshirt_number) || !Number.isFinite(parsed)) return;
      usedNumbers.add(parsed);
    });

    const availableNumbers: number[] = [];
    for (let i = 1; i <= 99; i += 1) {
      if (!usedNumbers.has(i)) availableNumbers.push(i);
    }

    if (availableNumbers.length === 0) {
      window.alert('All 1–2 digit numbers (1-99) are already assigned.');
      return;
    }

    const orderedMissing = [...missingRows].sort((a, b) => {
      const aTs = new Date(a.created_at || 0).getTime();
      const bTs = new Date(b.created_at || 0).getTime();
      return aTs - bTs;
    });

    const assignments = orderedMissing.slice(0, availableNumbers.length).map((row, index) => ({
      id: row.id,
      number: String(availableNumbers[index]),
    }));
    const skippedCount = Math.max(orderedMissing.length - assignments.length, 0);

    setGeneratingNumbers(true);
    setError(null);
    try {
      const assignmentMap = new Map(assignments.map((assignment) => [assignment.id, assignment.number]));
      const nowIso = new Date().toISOString();
      const results = await Promise.allSettled(
        assignments.map(async (assignment) => {
          const { data: updateData, error: updateError } = await supabase
            .from('uniform_requests')
            .update({
              tshirt_number: assignment.number,
              updated_at: nowIso,
            })
            .eq('id', assignment.id)
            .eq('preschool_id', schoolId)
            .select('id')
            .maybeSingle();
          if (updateError) throw updateError;
          if (!updateData?.id) {
            throw new Error('Update was rejected by access policy or no matching order was found.');
          }
        })
      );

      const failedCount = results.filter((result) => result.status === 'rejected').length;
      const successCount = assignments.length - failedCount;
      const firstFailure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      const firstFailureMessage = firstFailure?.reason instanceof Error
        ? firstFailure.reason.message
        : firstFailure?.reason
          ? String(firstFailure.reason)
          : null;
      if (successCount <= 0) {
        throw new Error(firstFailureMessage || 'No numbers were assigned. Please retry.');
      }

      setRows((prev) => prev.map((row) => (
        assignmentMap.has(row.id)
          ? {
            ...row,
            tshirt_number: assignmentMap.get(row.id) || row.tshirt_number,
            updated_at: nowIso,
          }
          : row
      )));

      await loadUniforms();

      const notes: string[] = [`Assigned ${successCount} number(s).`];
      if (skippedCount > 0) notes.push(`${skippedCount} order(s) skipped: no unique 1–2 digit numbers left.`);
      if (failedCount > 0) notes.push(`${failedCount} update(s) failed.${firstFailureMessage ? ' Example: ' + firstFailureMessage : ''}`);
      window.alert(notes.join(' '));
    } catch (e: any) {
      setError(e?.message || 'Failed to generate numbers.');
    } finally {
      setGeneratingNumbers(false);
    }
  };

  const exportCsv = (data: DisplayRow[]) => {
    if (!data.length) return;
    const headers = ['Child Name', 'Age', 'T-shirt Size', 'T-shirt Number', 'Student Code', 'Parent Name', 'Parent Email', 'Parent Phone', 'Submitted'];
    const csvRows = data.map((row) => [
      csvEscape(row.childName),
      csvEscape(row.ageYears),
      csvEscape(row.tshirtSize),
      csvEscape(row.tshirtNumber),
      csvEscape(row.studentCode),
      csvEscape(row.parentName),
      csvEscape(row.parentEmail),
      csvEscape(row.parentPhone),
      csvEscape(new Date(row.submittedAt).toLocaleDateString('en-ZA')),
    ]);

    const csv = [headers, ...csvRows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `uniform-sizes-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = (data: DisplayRow[]) => {
    if (!data.length) return;

    const schoolName = preschoolName || 'School';
    const generatedAt = new Date().toLocaleString('en-ZA');
    const rowsHtml = data
      .map((row) => {
        return `<tr>
          <td>${htmlEscape(row.childName)}</td>
          <td>${htmlEscape(row.ageYears ?? '-')}</td>
          <td>${htmlEscape(row.tshirtSize || '-')}</td>
          <td>${htmlEscape(row.tshirtQuantity ?? '-')}</td>
          <td>${htmlEscape(row.shortsQuantity ?? '-')}</td>
          <td>${htmlEscape(hasAssignedBackNumber(row.tshirtNumber) ? String(row.tshirtNumber).trim() : '-')}</td>
          <td>${row.sampleSupplied ? 'YES' : 'NO'}</td>
          <td><span class="payment-chip ${row.paymentStatus === 'paid' ? 'payment-paid' : 'payment-unpaid'}">${row.paymentStatus === 'paid' ? 'PAID' : 'UNPAID'}</span></td>
        </tr>`;
      })
      .join('');

    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900');
    if (!printWindow) {
      setError('Popup blocked. Please allow popups to export PDF.');
      return;
    }

    const html = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Uniform Orders - ${htmlEscape(schoolName)}</title>
        <style>
          @page { size: A4; margin: 14mm; }
          body { font-family: Arial, sans-serif; color: #111827; }
          h1 { margin: 0 0 6px; font-size: 22px; }
          p { margin: 0 0 4px; font-size: 12px; color: #6b7280; }
          table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 11px; }
          th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; vertical-align: top; }
          th { background: #f3f4f6; font-weight: 700; }
          .payment-chip { display: inline-block; padding: 3px 8px; border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: 0.2px; }
          .payment-paid { color: #166534; background: #dcfce7; border: 1px solid #86efac; }
          .payment-unpaid { color: #991b1b; background: #fee2e2; border: 1px solid #fca5a5; }
          .footer { margin-top: 12px; font-size: 11px; color: #6b7280; }
        </style>
      </head>
      <body>
        <h1>Uniform Orders - ${htmlEscape(schoolName)}</h1>
        <p>Generated: ${htmlEscape(generatedAt)}</p>
        <p>Total orders: ${htmlEscape(data.length)}</p>
        <table>
          <thead>
            <tr>
              <th>CHILD</th>
              <th>AGE</th>
              <th>SIZE</th>
              <th># T-SHIRT(S)</th>
              <th># SHORT(S)</th>
              <th>BACK #</th>
              <th>SAMPLE-SUPPLIED</th>
              <th>PAYMENT</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="footer">EduDash Pro - Uniform Orders</div>
      </body>
      </html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onafterprint = () => printWindow.close();
    printWindow.print();
  };

  if (loading) {
    return (
      <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={schoolId} hideRightSidebar={true}>
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-slate-400">Loading uniform submissions...</p>
        </div>
      </PrincipalShell>
    );
  }

  return (
    <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={schoolId} hideRightSidebar={true}>
      <div className="section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 className="h1" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Shirt size={22} /> Uniform Sizes
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>
              Collect T-shirt sizes for uniform printing. Shorts use the same size.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btnSecondary" onClick={loadUniforms}>
              <RefreshCw size={16} /> Refresh
            </button>
            <button
              className="btn btnSecondary"
              onClick={generateMissingNumbers}
              disabled={!missingNumberCount || generatingNumbers}
            >
              <Shirt size={16} /> {generatingNumbers ? 'Generating...' : `Generate Numbers (${missingNumberCount})`}
            </button>
            <button className="btn btnSecondary" onClick={() => exportPdf(filteredRows)} disabled={!filteredRows.length}>
              <Download size={16} /> Share PDF
            </button>
            <button className="btn btnPrimary" onClick={() => exportCsv(filteredRows)} disabled={!filteredRows.length}>
              <Download size={16} /> Export CSV
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                type="text"
                className="input"
                placeholder="Search child, parent, or student code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ paddingLeft: 40 }}
              />
            </div>
            <div>
              <select
                className="input"
                value={sizeFilter}
                onChange={(e) => setSizeFilter(e.target.value)}
              >
                <option value="all">All sizes</option>
                {SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="card" style={{ marginBottom: 16, color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        {filteredRows.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <Shirt size={48} style={{ margin: '0 auto 16px', color: 'var(--muted)' }} />
            <h3 style={{ marginBottom: 8 }}>No uniform submissions yet</h3>
            <p style={{ color: 'var(--muted)' }}>
              Parents will appear here once they submit sizes.
            </p>
          </div>
        ) : (
          <div className="card">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Child</th>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Age</th>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Size</th>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Number</th>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Student Code</th>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Parent</th>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Parent Phone</th>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontWeight: 600 }}>{row.childName}</span>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <span
                              className={`payment-chip ${row.paymentStatus === 'paid' ? 'payment-paid' : 'payment-unpaid'}`}
                              style={{
                                fontSize: 10,
                                padding: '3px 8px',
                                borderRadius: 999,
                                border: '1px solid transparent',
                                backgroundColor:
                                  row.paymentStatus === 'paid' ? '#dcfce7' : '#fee2e2',
                                color: row.paymentStatus === 'paid' ? '#166534' : '#991b1b',
                                borderColor:
                                  row.paymentStatus === 'paid' ? '#86efac' : '#fca5a5',
                              }}
                            >
                              {row.paymentStatus === 'paid' ? 'PAID' : 'UNPAID'}
                            </span>
                            {row.paymentStatus !== 'paid' && (
                              <button
                                type="button"
                                className="btn btnSecondary"
                                style={{ paddingInline: 8, fontSize: 11 }}
                                disabled={markingPaidId === row.id}
                                onClick={() => markUniformPaid(row)}
                              >
                                {markingPaidId === row.id ? 'Marking…' : 'Mark Paid'}
                              </button>
                            )}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: 12 }}>{row.ageYears}</td>
                      <td style={{ padding: 12 }}>{row.tshirtSize}</td>
                      <td style={{ padding: 12 }}>{hasAssignedBackNumber(row.tshirtNumber) ? String(row.tshirtNumber).trim() : '-'}</td>
                      <td style={{ padding: 12 }}>{row.studentCode || '-'}</td>
                      <td style={{ padding: 12 }}>
                        <div style={{ fontWeight: 500 }}>{row.parentName || '-'}</div>
                        {row.parentEmail && (
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{row.parentEmail}</div>
                        )}
                      </td>
                      <td style={{ padding: 12 }}>{row.parentPhone || '-'}</td>
                      <td style={{ padding: 12, color: 'var(--muted)', fontSize: 13 }}>
                        {new Date(row.submittedAt).toLocaleDateString('en-ZA')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </PrincipalShell>
  );
}
