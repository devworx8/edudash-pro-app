/**
 * Hook for Uniform Sizes data & actions
 * Manages entry state, DB loading, pricing, save, and payment routing
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationTerminology } from '@/lib/hooks/useOrganizationTerminology';
import { useTranslation } from 'react-i18next';
import { assertSupabase } from '@/lib/supabase';
import { getUniformItemType, isUniformFee } from '@/lib/utils/feeUtils';
import { logger } from '@/lib/logger';
import { useAlertModal } from '@/components/ui/AlertModal';
import {
  type ChildRow, type UniformEntry, type UniformPricing,
  type UniformRequestRow, type SchoolUniformFeeRow, type UniformFeeRow,
  getAgeYears, getErrorMessage,
} from '@/components/dashboard/parent/UniformSizesSection.styles';

const normalizeBackNumber = (value: unknown): string => String(value ?? '').trim();
const hasAssignedBackNumber = (value: unknown): boolean => {
  const normalized = normalizeBackNumber(value);
  if (!/^\d{1,2}$/.test(normalized)) return false;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 99;
};
const isUniformAssignmentsTableMissing = (error: any): boolean => {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01'
    || (message.includes('uniform_number_assignments') && message.includes('does not exist'));
};

export function useUniformSizes(children: ChildRow[]) {
  const { profile } = useAuth();
  const { terminology } = useOrganizationTerminology();
  const { t } = useTranslation();
  const router = useRouter();
  const { showAlert, alertProps } = useAlertModal();
  const memberLabelLower = terminology.member.toLowerCase();
  const institutionLabel = terminology.institution;
  const schoolName = profile?.organization_name || (profile as any)?.school_name || (profile as any)?.preschool_name || '';
  const [entries, setEntries] = useState<Record<string, UniformEntry>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uniformPricing, setUniformPricing] = useState<Record<string, UniformPricing>>({});
  // Init defaults from children prop
  useEffect(() => {
    if (!children.length) { setEntries({}); return; }
    const defaults: Record<string, UniformEntry> = {};
    children.forEach((child) => {
      defaults[child.id] = {
        childName: `${child.firstName} ${child.lastName}`.trim(),
        ageYears: getAgeYears(child.dateOfBirth),
        tshirtSize: '', tshirtQuantity: '1', shortsQuantity: '1',
        isReturning: false, pastNumberChoice: '', tshirtNumber: '', sampleSupplied: false,
        status: 'idle', message: null, updatedAt: null, isEditing: true,
      };
    });
    setEntries((prev) => {
      const merged = { ...defaults };
      Object.entries(prev).forEach(([id, entry]) => { merged[id] = { ...merged[id], ...entry }; });
      return merged;
    });
  }, [children]);
  // Load existing submissions
  useEffect(() => {
    if (!children.length) return;
    const load = async () => {
      setLoading(true); setLoadError(null);
      try {
        const supabase = assertSupabase();
        const { data, error } = await supabase.from('uniform_requests')
          .select('student_id,child_name,age_years,tshirt_size,tshirt_quantity,shorts_quantity,is_returning,tshirt_number,sample_supplied,updated_at')
          .in('student_id', children.map((c) => c.id));
        if (error) throw error;
        let assignedRows: Array<{ student_id: string; tshirt_number?: string | null }> = [];
        const assignmentRes = await supabase
          .from('uniform_number_assignments')
          .select('student_id,tshirt_number')
          .in('student_id', children.map((c) => c.id));
        if (assignmentRes.error) {
          if (!isUniformAssignmentsTableMissing(assignmentRes.error)) {
            logger.warn('UniformSizes', 'Failed to load pre-assigned uniform numbers', assignmentRes.error);
          }
        } else {
          assignedRows = assignmentRes.data || [];
        }
        const assignedBackNumberByStudent = new Map<string, string>();
        assignedRows.forEach((row) => {
          if (!row?.student_id || !hasAssignedBackNumber(row.tshirt_number)) return;
          assignedBackNumberByStudent.set(row.student_id, normalizeBackNumber(row.tshirt_number));
        });
        const rows: UniformRequestRow[] = Array.isArray(data) ? data : [];
        setEntries((prev) => {
          const next = { ...prev };
          children.forEach((child) => {
            const assignedBackNumber = assignedBackNumberByStudent.get(child.id);
            if (!assignedBackNumber || !hasAssignedBackNumber(assignedBackNumber)) return;
            const existing = next[child.id] || {} as UniformEntry;
            if (existing.pastNumberChoice === 'yes' && hasAssignedBackNumber(existing.tshirtNumber)) return;
            next[child.id] = {
              ...existing,
              pastNumberChoice: 'yes',
              isReturning: true,
              tshirtNumber: assignedBackNumber,
            };
          });
          rows.forEach((row) => {
            const assignedBackNumber = assignedBackNumberByStudent.get(row.student_id);
            const rowBackNumber = normalizeBackNumber(row.tshirt_number);
            const resolvedBackNumber = hasAssignedBackNumber(rowBackNumber)
              ? rowBackNumber
              : hasAssignedBackNumber(assignedBackNumber)
                ? normalizeBackNumber(assignedBackNumber)
                : '';
            const isRet = Boolean(row.is_returning) || hasAssignedBackNumber(resolvedBackNumber);
            next[row.student_id] = {
              ...(next[row.student_id] || {}),
              childName: row.child_name || next[row.student_id]?.childName || '',
              ageYears: row.age_years ? String(row.age_years) : next[row.student_id]?.ageYears || '',
              tshirtSize: row.tshirt_size || '',
              tshirtQuantity: row.tshirt_quantity ? String(row.tshirt_quantity) : '1',
              shortsQuantity: row.shorts_quantity ? String(row.shorts_quantity) : '1',
              pastNumberChoice: isRet ? 'yes' : 'no',
              isReturning: isRet,
              tshirtNumber: isRet ? resolvedBackNumber : '',
              sampleSupplied: row.sample_supplied ?? false,
              status: 'saved',
              message: t('dashboard.parent.uniform.status.saved', { defaultValue: 'Saved' }),
              updatedAt: row.updated_at || null,
              isEditing: false,
            };
          });
          return next;
        });
      } catch (e: unknown) {
        setLoadError(getErrorMessage(e, t('dashboard.parent.uniform.errors.load_existing', { defaultValue: 'Unable to load uniform sizes.' })));
      } finally { setLoading(false); }
    };
    load();
  }, [children]);
  // Load uniform pricing
  useEffect(() => {
    const ids = [...new Set(children.map((c) => c.preschoolId).filter(Boolean))] as string[];
    if (!ids.length) return;
    const load = async () => {
      try {
        const supabase = assertSupabase();
        const map: Record<string, UniformPricing> = {};
        for (const pid of ids) {
          const p: UniformPricing = {};
          const apply = (amt: number, ft?: string | null, n?: string | null, d?: string | null) => {
            if (!Number.isFinite(amt)) return;
            const it = getUniformItemType(ft, n, d);
            if (it === 'set' && p.setAmount == null) { p.setAmount = amt; return; }
            if (it === 'tshirt' && p.tshirtAmount == null) { p.tshirtAmount = amt; return; }
            if (it === 'shorts' && p.shortsAmount == null) { p.shortsAmount = amt; return; }
            if (p.fallbackAmount == null) p.fallbackAmount = amt;
          };
          const { data: sf } = await supabase.from('school_fee_structures')
            .select('amount_cents,fee_category,name,description,created_at').eq('preschool_id', pid).eq('is_active', true);
          const uf = (sf || []).filter((f: SchoolUniformFeeRow) => isUniformFee(f.fee_category, f.name, f.description));
          if (uf.length > 0) { uf.forEach((f) => apply(f.amount_cents / 100, f.fee_category, f.name, f.description)); }
          else {
            const { data: fs } = await supabase.from('fee_structures')
              .select('amount,fee_type,name,description,effective_from,created_at').eq('preschool_id', pid).eq('is_active', true)
              .order('effective_from', { ascending: false }).order('created_at', { ascending: false });
            (fs || []).filter((f: UniformFeeRow) => isUniformFee(f.fee_type, f.name, f.description))
              .forEach((f) => apply(f.amount, f.fee_type, f.name, f.description));
          }
          if (p.setAmount || p.tshirtAmount || p.shortsAmount || p.fallbackAmount) map[pid] = p;
        }
        if (Object.keys(map).length) setUniformPricing((prev) => ({ ...prev, ...map }));
      } catch (e) { logger.warn('UniformSizes', 'Failed to load pricing', e); }
    };
    load();
  }, [children]);
  const updateEntry = (id: string, patch: Partial<UniformEntry>) =>
    setEntries((prev) => ({ ...prev, [id]: { ...prev[id], ...patch, status: 'idle', message: null } }));
  const canPayNow = (entry: UniformEntry, hasPricing: boolean) => {
    const tq = parseInt(entry.tshirtQuantity, 10);
    const sq = parseInt(entry.shortsQuantity, 10);
    return Boolean(entry.tshirtSize) && ((Number.isFinite(tq) ? tq : 0) + (Number.isFinite(sq) ? sq : 0)) > 0 && hasPricing;
  };
  const setFullSetQty = (id: string, val: string) => {
    if (!val.trim()) { updateEntry(id, { tshirtQuantity: '', shortsQuantity: '' }); return; }
    const n = Math.min(Math.max(parseInt(val, 10) || 0, 0), 20);
    updateEntry(id, { tshirtQuantity: String(n), shortsQuantity: String(n) });
  };
  const setEditing = (id: string, v: boolean) =>
    setEntries((prev) => ({ ...prev, [id]: { ...prev[id], isEditing: v } }));
  const saveEntry = async (id: string) => {
    const e = entries[id]; if (!e) return;
    const name = e.childName.trim(), age = parseInt(e.ageYears, 10), num = e.tshirtNumber.trim();
    const tq = parseInt(e.tshirtQuantity, 10), sq = parseInt(e.shortsQuantity, 10);
    const hasPastNumber = e.pastNumberChoice === 'yes';
    const val = (msg: string) => updateEntry(id, { status: 'error' as any, message: msg });
    if (!name) return val(t('dashboard.parent.uniform.validation.child_name', { defaultValue: 'Please enter the child name.' }));
    if (!e.tshirtSize) return val(t('dashboard.parent.uniform.validation.tshirt_size', { defaultValue: 'Select a T-shirt size.' }));
    if (!Number.isFinite(age) || age < 1 || age > 18) return val(t('dashboard.parent.uniform.validation.age', { defaultValue: 'Enter a valid age (1-18).' }));
    if (!['yes', 'no'].includes(e.pastNumberChoice)) return val(t('dashboard.parent.uniform.validation.past_number_choice', { defaultValue: 'Select whether your child has a previous back number.' }));
    if (hasPastNumber && !num) return val(t('dashboard.parent.uniform.validation.tshirt_number', { defaultValue: 'Enter the returning T-shirt number.' }));
    if (hasPastNumber && num && !/^\d{1,2}$/.test(num)) return val(t('dashboard.parent.uniform.validation.tshirt_number_format', { defaultValue: 'T-shirt number must be 1-2 digits.' }));
    if (!Number.isFinite(tq) || tq < 1 || tq > 20) return val(t('dashboard.parent.uniform.validation.tshirt_qty', { defaultValue: 'Enter a valid number of T-shirts (1-20).' }));
    if (!Number.isFinite(sq) || sq < 0 || sq > 20) return val(t('dashboard.parent.uniform.validation.shorts_qty', { defaultValue: 'Enter a valid number of shorts (0-20).' }));
    setEntries((p) => ({ ...p, [id]: { ...p[id], status: 'saving', message: null } }));
    try {
      const supabase = assertSupabase();
      const { data, error } = await supabase.from('uniform_requests').upsert({
        student_id: id, child_name: name, age_years: age, tshirt_size: e.tshirtSize,
        tshirt_quantity: tq, shorts_quantity: sq, is_returning: hasPastNumber,
        tshirt_number: hasPastNumber ? num || null : null, sample_supplied: e.sampleSupplied,
      }, { onConflict: 'student_id' }).select('updated_at').single();
      if (error) throw error;
      if (hasPastNumber && num) {
        const { error: assignmentError } = await supabase
          .from('uniform_number_assignments')
          .upsert({
            student_id: id,
            tshirt_number: num,
          }, { onConflict: 'student_id' });
        if (assignmentError && !isUniformAssignmentsTableMissing(assignmentError)) {
          logger.warn('UniformSizes', 'Unable to sync assigned uniform number', assignmentError);
        }
      }
      setEntries((p) => ({ ...p, [id]: { ...p[id], status: 'saved', message: t('dashboard.parent.uniform.status.saved', { defaultValue: 'Saved' }), updatedAt: data?.updated_at || new Date().toISOString(), isEditing: false } }));
    } catch (err: unknown) {
      setEntries((p) => ({ ...p, [id]: { ...p[id], status: 'error', message: getErrorMessage(err, t('dashboard.parent.uniform.errors.save_failed', { defaultValue: 'Save failed' })) } }));
    }
  };
  /** Consolidated pay / upload-POP handler */
  const handlePayAction = (child: ChildRow, entry: UniformEntry, mode: 'pay' | 'upload') => {
    const pid = child.preschoolId;
    if (!pid) { showAlert({ title: `${institutionLabel} not found`, message: `We could not find the ${institutionLabel.toLowerCase()} for this ${memberLabelLower}.`, type: 'error' }); return; }
    if (!entry.tshirtSize) { showAlert({ title: 'Missing size', message: `Please select a T-shirt size before ${mode === 'pay' ? 'paying' : 'uploading'}.`, type: 'warning' }); return; }
    const tq = parseInt(entry.tshirtQuantity, 10), sq = parseInt(entry.shortsQuantity, 10);
    const rtq = Number.isFinite(tq) ? tq : 0, rsq = Number.isFinite(sq) ? sq : 0;
    if (rtq + rsq <= 0) { showAlert({ title: 'Missing quantities', message: `Enter the number of T-shirts and shorts before ${mode === 'pay' ? 'paying' : 'uploading'}.`, type: 'warning' }); return; }
    const pricing = uniformPricing[pid];
    const sp = pricing?.setAmount ?? pricing?.fallbackAmount ?? 0, tp = pricing?.tshirtAmount ?? 0, shp = pricing?.shortsAmount ?? 0;
    const setQ = sp > 0 ? Math.min(rtq, rsq) : 0;
    const total = (sp * setQ) + (tp * Math.max(rtq - setQ, 0)) + (shp * Math.max(rsq - setQ, 0));
    const has = Boolean(pricing && (sp > 0 || tp > 0 || shp > 0));
    if (!has) { showAlert({ title: 'Uniform pricing not set', message: 'Uniform pricing is not configured yet. We will still generate a reference for you.', type: 'warning' }); return; }
    const ref = child.studentCode || `UNIFORM-${child.id.slice(0, 6).toUpperCase()}`;
    const desc = `Uniform order • Size ${entry.tshirtSize || '-'} • T-shirts ${rtq} • Shorts ${rsq}`;
    router.push({ pathname: '/screens/payment-flow', params: {
      feeId: `uniform:${child.id}`, feeDescription: desc, feeAmount: total.toFixed(2),
      childId: child.id, childName: `${child.firstName} ${child.lastName}`.trim(),
      studentCode: ref, preschoolId: pid, preschoolName: schoolName || '',
      ...(mode === 'upload' ? { openUpload: '1' } : {}),
    } });
  };
  return {
    entries, loading, loadError, uniformPricing, alertProps,
    updateEntry, canPayNow, setFullSetQty, setEditing, saveEntry, handlePayAction,
    terminology, t, schoolName,
  };
}
