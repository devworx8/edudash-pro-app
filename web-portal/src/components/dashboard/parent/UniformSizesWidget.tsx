'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { createClient } from '@/lib/supabase/client';
import type { ChildCard } from '@/lib/hooks/parent/types';
import { getUniformItemType, isUniformFee } from '@/lib/utils/feeUtils';
import { CheckCircle2, Shirt, AlertCircle } from 'lucide-react';

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

type EntryStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UniformEntry {
  childName: string;
  ageYears: string;
  tshirtSize: string;
  tshirtQuantity: string;
  shortsQuantity: string;
  isReturning: boolean;
  pastNumberChoice: '' | 'yes' | 'no';
  tshirtNumber: string;
  sampleSupplied: boolean;
  status: EntryStatus;
  message?: string | null;
  updatedAt?: string | null;
  isEditing?: boolean;
}

interface UniformSizesWidgetProps {
  childrenCards: ChildCard[];
}

interface UniformPricing {
  setAmount?: number;
  tshirtAmount?: number;
  shortsAmount?: number;
  fallbackAmount?: number;
}

interface UniformRequestRow {
  student_id: string;
  child_name?: string | null;
  age_years?: number | null;
  tshirt_size?: string | null;
  tshirt_quantity?: number | null;
  shorts_quantity?: number | null;
  is_returning?: boolean | null;
  tshirt_number?: string | null;
  sample_supplied?: boolean | null;
  updated_at?: string | null;
}

interface UniformFeeRow {
  amount: number;
  fee_type?: string | null;
  name?: string | null;
  description?: string | null;
  effective_from?: string | null;
  created_at?: string | null;
}

interface SchoolUniformFeeRow {
  amount_cents: number;
  fee_category?: string | null;
  name?: string | null;
  description?: string | null;
  created_at?: string | null;
}

const getAgeYears = (dateOfBirth?: string): string => {
  if (!dateOfBirth) return '';
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return '';
  const age = Math.floor((Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
  return age > 0 ? String(age) : '';
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
};

const formatCurrency = (value: number) => `R ${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;

export function UniformSizesWidget({ childrenCards }: UniformSizesWidgetProps) {
  const supabase = createClient();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState<Record<string, UniformEntry>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uniformPricing, setUniformPricing] = useState<Record<string, UniformPricing>>({});

  const childIds = useMemo(() => childrenCards.map((c) => c.id), [childrenCards]);
  const preschoolIds = useMemo(
    () => Array.from(new Set(childrenCards.map((child) => child.preschoolId).filter(Boolean))) as string[],
    [childrenCards]
  );

  useEffect(() => {
    if (!childrenCards.length) {
      setEntries({});
      setLoading(false);
      return;
    }

    const defaults: Record<string, UniformEntry> = {};
    childrenCards.forEach((child) => {
      const name = `${child.firstName} ${child.lastName}`.trim();
      defaults[child.id] = {
        childName: name,
        ageYears: getAgeYears(child.dateOfBirth),
        tshirtSize: '',
        tshirtQuantity: '1',
        shortsQuantity: '1',
        isReturning: false,
        pastNumberChoice: '',
        tshirtNumber: '',
        sampleSupplied: false,
        status: 'idle',
        message: null,
        updatedAt: null,
        isEditing: true,
      };
    });

    setEntries((prev) => {
      const merged: Record<string, UniformEntry> = { ...defaults };
      Object.entries(prev).forEach(([id, entry]) => {
        merged[id] = { ...merged[id], ...entry };
      });
      return merged;
    });
  }, [childrenCards]);

  useEffect(() => {
    const loadExisting = async () => {
      if (!childIds.length) return;
      setLoading(true);
      setLoadError(null);

      const { data, error } = await supabase
        .from('uniform_requests')
        .select('student_id, child_name, age_years, tshirt_size, tshirt_quantity, shorts_quantity, is_returning, tshirt_number, sample_supplied, updated_at')
        .in('student_id', childIds);

      if (error) {
        setLoadError(t('dashboard.parent.uniform.errors.load_existing', { defaultValue: 'Unable to load existing uniform sizes.' }));
        setLoading(false);
        return;
      }

      const uniformRows: UniformRequestRow[] = Array.isArray(data) ? data : [];
      if (uniformRows.length) {
        setEntries((prev) => {
          const next = { ...prev };
          uniformRows.forEach((row) => {
            const isReturning = Boolean(row.is_returning);
            next[row.student_id] = {
              ...(next[row.student_id] || {}),
              childName: row.child_name || next[row.student_id]?.childName || '',
              ageYears: row.age_years ? String(row.age_years) : next[row.student_id]?.ageYears || '',
              tshirtSize: row.tshirt_size || next[row.student_id]?.tshirtSize || '',
              tshirtQuantity: row.tshirt_quantity ? String(row.tshirt_quantity) : next[row.student_id]?.tshirtQuantity || '1',
              shortsQuantity: row.shorts_quantity ? String(row.shorts_quantity) : next[row.student_id]?.shortsQuantity || '1',
              isReturning,
              pastNumberChoice: isReturning ? 'yes' : 'no',
              tshirtNumber: isReturning ? row.tshirt_number || '' : '',
              sampleSupplied: row.sample_supplied ?? false,
              status: 'saved',
              message: t('dashboard.parent.uniform.status.saved', { defaultValue: 'Saved' }),
              updatedAt: row.updated_at || null,
              isEditing: false,
            };
          });
          return next;
        });
      }

      setLoading(false);
    };

    loadExisting();
  }, [childIds, supabase, t]);

  useEffect(() => {
    const loadUniformPricing = async () => {
      if (!preschoolIds.length) return;
      try {
        const pricingMap: Record<string, UniformPricing> = {};
        for (const preschoolId of preschoolIds) {
          const pricing: UniformPricing = {};
          const applyFee = (
            amount: number,
            feeType?: string | null,
            name?: string | null,
            description?: string | null
          ) => {
            if (!Number.isFinite(amount)) return;
            const itemType = getUniformItemType(feeType, name, description);
            if (itemType === 'set' && pricing.setAmount == null) {
              pricing.setAmount = amount;
              return;
            }
            if (itemType === 'tshirt' && pricing.tshirtAmount == null) {
              pricing.tshirtAmount = amount;
              return;
            }
            if (itemType === 'shorts' && pricing.shortsAmount == null) {
              pricing.shortsAmount = amount;
              return;
            }
            if (pricing.fallbackAmount == null) {
              pricing.fallbackAmount = amount;
            }
          };

          const { data: schoolFees } = await supabase
            .from('school_fee_structures')
            .select('amount_cents, fee_category, name, description, created_at')
            .eq('preschool_id', preschoolId)
            .eq('is_active', true);

          const uniformSchoolFees = (schoolFees || [])
            .filter((fee: SchoolUniformFeeRow) => isUniformFee(fee.fee_category, fee.name, fee.description))
            .map((fee: SchoolUniformFeeRow) => ({
              amount: fee.amount_cents / 100,
              feeType: fee.fee_category,
              name: fee.name,
              description: fee.description,
            }));

          if (uniformSchoolFees.length > 0) {
            uniformSchoolFees.forEach((fee: {
              amount: number;
              feeType?: string | null;
              name?: string | null;
              description?: string | null;
            }) => applyFee(fee.amount, fee.feeType, fee.name, fee.description));
          } else {
            const { data: feeStructures } = await supabase
              .from('fee_structures')
              .select('amount, fee_type, name, description, effective_from, created_at')
              .eq('preschool_id', preschoolId)
              .eq('is_active', true)
              .order('effective_from', { ascending: false })
              .order('created_at', { ascending: false });

            (feeStructures || [])
              .filter((fee: UniformFeeRow) => isUniformFee(fee.fee_type, fee.name, fee.description))
              .forEach((fee: UniformFeeRow) => applyFee(fee.amount, fee.fee_type, fee.name, fee.description));
          }

          if (pricing.setAmount || pricing.tshirtAmount || pricing.shortsAmount || pricing.fallbackAmount) {
            pricingMap[preschoolId] = pricing;
          }
        }

        if (Object.keys(pricingMap).length > 0) {
          setUniformPricing((prev) => ({ ...prev, ...pricingMap }));
        }
      } catch (error: unknown) {
        setLoadError(getErrorMessage(error, t('dashboard.parent.uniform.errors.load_pricing', { defaultValue: 'Unable to load uniform pricing.' })));
      }
    };

    loadUniformPricing();
  }, [preschoolIds, supabase, t]);

  const updateEntry = (childId: string, patch: Partial<UniformEntry>) => {
    setEntries((prev) => ({
      ...prev,
      [childId]: { ...prev[childId], ...patch, status: 'idle', message: null },
    }));
  };

  const setEditing = (childId: string, isEditing: boolean) => {
    setEntries((prev) => ({
      ...prev,
      [childId]: { ...prev[childId], isEditing },
    }));
  };

  const setFullSetQuantity = (childId: string, value: string) => {
    if (value.trim() === '') {
      updateEntry(childId, { tshirtQuantity: '', shortsQuantity: '' });
      return;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(Math.max(parsed, 0), 20);
    updateEntry(childId, { tshirtQuantity: String(clamped), shortsQuantity: String(clamped) });
  };

  const saveEntry = async (childId: string) => {
    const entry = entries[childId];
    if (!entry) return;

    const childName = entry.childName.trim();
    const ageValue = parseInt(entry.ageYears, 10);
    const tshirtQty = parseInt(entry.tshirtQuantity, 10);
    const shortsQty = parseInt(entry.shortsQuantity, 10);
    const backNumber = entry.tshirtNumber.trim();
    const hasPastNumber = entry.pastNumberChoice === 'yes';

    if (!childName) {
      updateEntry(childId, { status: 'error', message: t('dashboard.parent.uniform.validation.child_name', { defaultValue: 'Please enter the child name.' }) });
      return;
    }
    if (!entry.tshirtSize) {
      updateEntry(childId, { status: 'error', message: t('dashboard.parent.uniform.validation.tshirt_size', { defaultValue: 'Select a T-shirt size.' }) });
      return;
    }
    if (!Number.isFinite(ageValue) || ageValue < 1 || ageValue > 18) {
      updateEntry(childId, { status: 'error', message: t('dashboard.parent.uniform.validation.age', { defaultValue: 'Enter a valid age (1-18).' }) });
      return;
    }
    if (!['yes', 'no'].includes(entry.pastNumberChoice)) {
      updateEntry(childId, {
        status: 'error',
        message: t('dashboard.parent.uniform.validation.past_number_choice', {
          defaultValue: 'Select whether your child has a previous back number.',
        }),
      });
      return;
    }
    if (hasPastNumber && !backNumber) {
      updateEntry(childId, {
        status: 'error',
        message: t('dashboard.parent.uniform.validation.tshirt_number', {
          defaultValue: 'Enter the returning T-shirt number.',
        }),
      });
      return;
    }
    if (hasPastNumber && !/^\d{1,6}$/.test(backNumber)) {
      updateEntry(childId, {
        status: 'error',
        message: t('dashboard.parent.uniform.validation.tshirt_number_format', {
          defaultValue: 'T-shirt number must be 1-6 digits.',
        }),
      });
      return;
    }
    if (!Number.isFinite(tshirtQty) || tshirtQty < 1 || tshirtQty > 20) {
      updateEntry(childId, { status: 'error', message: t('dashboard.parent.uniform.validation.tshirt_qty', { defaultValue: 'Enter a valid number of T-shirts (1-20).' }) });
      return;
    }
    if (!Number.isFinite(shortsQty) || shortsQty < 0 || shortsQty > 20) {
      updateEntry(childId, { status: 'error', message: t('dashboard.parent.uniform.validation.shorts_qty', { defaultValue: 'Enter a valid number of shorts (0-20).' }) });
      return;
    }

    setEntries((prev) => ({
      ...prev,
      [childId]: { ...prev[childId], status: 'saving', message: null },
    }));

    const { data, error } = await supabase
      .from('uniform_requests')
      .upsert(
        {
          student_id: childId,
          child_name: childName,
          age_years: ageValue,
          tshirt_size: entry.tshirtSize,
          tshirt_quantity: tshirtQty,
          shorts_quantity: shortsQty,
          is_returning: hasPastNumber,
          tshirt_number: hasPastNumber ? backNumber : null,
          sample_supplied: entry.sampleSupplied,
        },
        { onConflict: 'student_id' }
      )
      .select('updated_at')
      .single();

    if (error) {
      setEntries((prev) => ({
        ...prev,
        [childId]: { ...prev[childId], status: 'error', message: error.message || t('dashboard.parent.uniform.errors.save_failed', { defaultValue: 'Save failed' }) },
      }));
      return;
    }

    setEntries((prev) => ({
      ...prev,
      [childId]: {
        ...prev[childId],
        status: 'saved',
        message: t('dashboard.parent.uniform.status.saved', { defaultValue: 'Saved' }),
        updatedAt: data?.updated_at || new Date().toISOString(),
        isEditing: false,
      },
    }));
  };

  const handlePayNow = useCallback((child: ChildCard, entry: UniformEntry) => {
    const preschoolId = child.preschoolId || '';
    const childName = `${child.firstName} ${child.lastName}`.trim();
    const tshirtQty = Number.isFinite(Number(entry.tshirtQuantity)) ? Number(entry.tshirtQuantity) : 0;
    const shortsQty = Number.isFinite(Number(entry.shortsQuantity)) ? Number(entry.shortsQuantity) : 0;
    const totalItems = tshirtQty + shortsQty;

    if (!preschoolId || totalItems <= 0) return;

    const pricing = uniformPricing[preschoolId];
    const setPrice = pricing?.setAmount ?? pricing?.fallbackAmount ?? 0;
    const tshirtPrice = pricing?.tshirtAmount ?? 0;
    const shortsPrice = pricing?.shortsAmount ?? 0;
    const setQty = setPrice > 0 ? Math.min(tshirtQty, shortsQty) : 0;
    const remainingTshirts = Math.max(tshirtQty - setQty, 0);
    const remainingShorts = Math.max(shortsQty - setQty, 0);
    const totalAmount = (setPrice * setQty) + (tshirtPrice * remainingTshirts) + (shortsPrice * remainingShorts);

    const params = new URLSearchParams();
    params.set('childId', child.id);
    params.set('childName', childName);
    if (child.studentCode) params.set('studentCode', child.studentCode);
    params.set('feeAmount', totalAmount.toFixed(2));
    params.set('feeDescription', t('dashboard.parent.uniform.payment.description', {
      defaultValue: 'Uniform order • Size {{size}} • T-shirts {{tshirts}} • Shorts {{shorts}}',
      size: entry.tshirtSize,
      tshirts: tshirtQty,
      shorts: shortsQty,
    }));
    params.set('preschoolId', preschoolId);
    if (child.preschoolName) params.set('preschoolName', child.preschoolName);

    router.push(`/dashboard/parent/payments/flow?${params.toString()}`);
  }, [router, uniformPricing]);

  const handleUploadPOP = useCallback((child: ChildCard, entry: UniformEntry, totalAmount: number) => {
    const childName = `${child.firstName} ${child.lastName}`.trim();
    const tshirtQty = Number.isFinite(Number(entry.tshirtQuantity)) ? Number(entry.tshirtQuantity) : 0;
    const shortsQty = Number.isFinite(Number(entry.shortsQuantity)) ? Number(entry.shortsQuantity) : 0;

    const params = new URLSearchParams();
    params.set('child', child.id);
    if (totalAmount > 0) params.set('feeAmount', totalAmount.toFixed(2));
    params.set('feeDescription', t('dashboard.parent.uniform.payment.description', {
      defaultValue: 'Uniform order • Size {{size}} • T-shirts {{tshirts}} • Shorts {{shorts}}',
      size: entry.tshirtSize,
      tshirts: tshirtQty,
      shorts: shortsQty,
    }));
    params.set('feeId', `uniform:${child.id}`);
    params.set('childName', childName);

    router.push(`/dashboard/parent/payments/pop-upload?${params.toString()}`);
  }, [router, t]);

  if (!childrenCards.length) {
    return (
      <div className="card">
        <div className="sectionTitle">{t('dashboard.parent.uniform.title', { defaultValue: 'Uniform Sizes' })}</div>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          {t('dashboard.parent.uniform.empty', { defaultValue: 'Add a child first to submit uniform sizes.' })}
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Shirt size={18} style={{ color: 'var(--primary)' }} />
        <div className="sectionTitle" style={{ margin: 0 }}>{t('dashboard.parent.uniform.title', { defaultValue: 'Uniform Sizes' })}</div>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
        {t('dashboard.parent.uniform.subtitle', { defaultValue: "Please confirm each child's uniform sizes and quantities. A full set is 1 T-shirt + 1 shorts." })}
      </p>

      {loading && (
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>{t('dashboard.parent.uniform.loading', { defaultValue: 'Loading existing submissions...' })}</p>
      )}
      {loadError && (
        <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>
          {loadError}
        </div>
      )}

      <div className="grid gap-4">
        {childrenCards.map((child) => {
          const entry = entries[child.id];
          if (!entry) return null;
          const preschoolId = child.preschoolId || '';
          const pricing = preschoolId ? uniformPricing[preschoolId] : null;
          const tshirtQty = Number.isFinite(Number(entry.tshirtQuantity)) ? Number(entry.tshirtQuantity) : 0;
          const shortsQty = Number.isFinite(Number(entry.shortsQuantity)) ? Number(entry.shortsQuantity) : 0;
          const setPrice = pricing?.setAmount ?? pricing?.fallbackAmount ?? 0;
          const tshirtPrice = pricing?.tshirtAmount ?? 0;
          const shortsPrice = pricing?.shortsAmount ?? 0;
          const impliedSetQty = Math.min(tshirtQty, shortsQty);
          const billableSetQty = setPrice > 0 ? impliedSetQty : 0;
          const remainingTshirts = Math.max(tshirtQty - billableSetQty, 0);
          const remainingShorts = Math.max(shortsQty - billableSetQty, 0);
          const orderExtraTshirts = Math.max(tshirtQty - impliedSetQty, 0);
          const orderExtraShorts = Math.max(shortsQty - impliedSetQty, 0);
          const totalAmount = (setPrice * billableSetQty) + (tshirtPrice * remainingTshirts) + (shortsPrice * remainingShorts);
          const hasPricing = Boolean(pricing && (setPrice > 0 || tshirtPrice > 0 || shortsPrice > 0));
          const totalItems = tshirtQty + shortsQty;

          if (entry.status === 'saved' && !entry.isEditing) {
            return (
              <div key={child.id} className="card" style={{ padding: 16, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--primary)',
                      color: 'white',
                      fontWeight: 700,
                    }}>
                      {child.firstName.charAt(0)}{child.lastName.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {child.firstName} {child.lastName}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {t('dashboard.parent.uniform.summary.subtitle', { defaultValue: 'Uniform order saved.' })}
                      </div>
                    </div>
                  </div>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: 'rgba(34, 197, 94, 0.15)',
                    color: 'var(--success)',
                    fontSize: 12,
                    fontWeight: 600,
                  }}>
                    <CheckCircle2 size={14} /> {t('dashboard.parent.uniform.status.saved', { defaultValue: 'Saved' })}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                  {t('dashboard.parent.uniform.summary.details', { defaultValue: 'Size:' })} {entry.tshirtSize || '—'} · {t('dashboard.parent.uniform.labels.tshirts', { defaultValue: 'T-shirts' })} {entry.tshirtQuantity} · {t('dashboard.parent.uniform.labels.shorts', { defaultValue: 'Shorts' })} {entry.shortsQuantity}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                  {t('dashboard.parent.uniform.labels.past_number_choice', { defaultValue: 'Previous back number?' })}{' '}
                  {entry.pastNumberChoice === 'yes'
                    ? t('dashboard.parent.uniform.labels.past_number_yes', { defaultValue: 'Yes, has number' })
                    : t('dashboard.parent.uniform.labels.past_number_no', { defaultValue: 'No number' })}
                  {entry.pastNumberChoice === 'yes' && entry.tshirtNumber ? ` • #${entry.tshirtNumber}` : ''}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                    {t('dashboard.parent.uniform.total.label', { defaultValue: 'Total:' })}{' '}
                    {hasPricing
                      ? formatCurrency(totalAmount)
                      : t('dashboard.parent.uniform.total.unavailable', { defaultValue: 'Pricing not configured' })}
                  </span>
                  <button
                    className="btn btnSecondary"
                    type="button"
                    onClick={() => handlePayNow(child, entry)}
                    disabled={!entry.tshirtSize || totalItems <= 0 || !hasPricing}
                  >
                    {t('dashboard.parent.uniform.actions.pay_now', { defaultValue: 'Pay now' })}
                  </button>
                  <button
                    className="btn btnSecondary"
                    type="button"
                    onClick={() => handleUploadPOP(child, entry, totalAmount)}
                    disabled={!entry.tshirtSize || totalItems <= 0 || !hasPricing}
                  >
                    {t('dashboard.parent.uniform.actions.upload_pop', { defaultValue: 'Upload POP' })}
                  </button>
                  <button
                    className="btn btnSecondary"
                    type="button"
                    onClick={() => setEditing(child.id, true)}
                  >
                    {t('dashboard.parent.uniform.actions.edit', { defaultValue: 'Edit order' })}
                  </button>
                </div>
                {entry.updatedAt && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
                    {t('dashboard.parent.uniform.last_updated', { defaultValue: 'Last updated:' })}{' '}
                    {new Date(entry.updatedAt).toLocaleString(i18n.language || 'en-ZA')}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div key={child.id} className="card" style={{ padding: 16, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--primary)',
                    color: 'white',
                    fontWeight: 700,
                  }}>
                    {child.firstName.charAt(0)}{child.lastName.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {child.firstName} {child.lastName}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {t('dashboard.parent.uniform.subtitle', { defaultValue: 'Complete the uniform form below.' })}
                    </div>
                  </div>
                </div>
                {entry.status === 'saved' && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: 'rgba(34, 197, 94, 0.15)',
                    color: 'var(--success)',
                    fontSize: 12,
                    fontWeight: 600,
                  }}>
                    <CheckCircle2 size={14} /> {t('dashboard.parent.uniform.status.saved', { defaultValue: 'Saved' })}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                {t('dashboard.parent.uniform.sections.details', { defaultValue: 'Details & Sizes' })}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                <div>
                  <label className="text-xs" style={{ color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                    {t('dashboard.parent.uniform.labels.child_name', { defaultValue: 'Child Name' })}
                  </label>
                  <input
                    className="input"
                    value={entry.childName}
                    onChange={(e) => updateEntry(child.id, { childName: e.target.value })}
                    placeholder={t('dashboard.parent.uniform.placeholders.child_name', { defaultValue: 'Child name' })}
                  />
                </div>
                <div>
                  <label className="text-xs" style={{ color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                    {t('dashboard.parent.uniform.labels.age', { defaultValue: 'Age (years)' })}
                  </label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={18}
                    value={entry.ageYears}
                    onChange={(e) => updateEntry(child.id, { ageYears: e.target.value })}
                    placeholder={t('dashboard.parent.uniform.placeholders.age', { defaultValue: 'Age' })}
                  />
                </div>
                <div>
                  <label className="text-xs" style={{ color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                    {t('dashboard.parent.uniform.labels.tshirt_size', { defaultValue: 'T-shirt Size' })}
                  </label>
                  <select
                    className="input"
                    value={entry.tshirtSize}
                    onChange={(e) => updateEntry(child.id, { tshirtSize: e.target.value })}
                  >
                    <option value="">{t('dashboard.parent.uniform.placeholders.select_size', { defaultValue: 'Select size' })}</option>
                    {SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs" style={{ color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                    {t('dashboard.parent.uniform.labels.tshirts', { defaultValue: 'T-shirts' })}
                  </label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={20}
                    value={entry.tshirtQuantity}
                    onChange={(e) => updateEntry(child.id, { tshirtQuantity: e.target.value })}
                    placeholder={t('dashboard.parent.uniform.placeholders.default_one', { defaultValue: '1' })}
                  />
                </div>
                <div>
                  <label className="text-xs" style={{ color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                    {t('dashboard.parent.uniform.labels.shorts', { defaultValue: 'Shorts' })}
                  </label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={20}
                    value={entry.shortsQuantity}
                    onChange={(e) => updateEntry(child.id, { shortsQuantity: e.target.value })}
                    placeholder={t('dashboard.parent.uniform.placeholders.default_one', { defaultValue: '1' })}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    className="btn btnPrimary"
                    onClick={() => saveEntry(child.id)}
                    disabled={entry.status === 'saving'}
                    type="button"
                  >
                    {entry.status === 'saving'
                      ? t('dashboard.parent.uniform.status.saving', { defaultValue: 'Saving…' })
                      : t('dashboard.parent.uniform.actions.save', { defaultValue: 'Save' })}
                  </button>
                  {entry.status === 'saved' && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--success)', fontSize: 12 }}>
                      <CheckCircle2 size={14} /> {t('dashboard.parent.uniform.status.saved', { defaultValue: 'Saved' })}
                    </span>
                  )}
                  {entry.status === 'error' && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--danger)', fontSize: 12 }}>
                      <AlertCircle size={14} /> {entry.message}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <label className="text-xs" style={{ color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                  {t('dashboard.parent.uniform.labels.past_number_choice', { defaultValue: 'Previous back number? (Required)' })}
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <button
                    type="button"
                    className="btn btnSecondary"
                    style={{
                      borderColor: entry.pastNumberChoice === 'yes' ? 'var(--primary)' : 'var(--border)',
                      background: entry.pastNumberChoice === 'yes' ? 'rgba(99, 102, 241, 0.16)' : undefined,
                    }}
                    onClick={() => updateEntry(child.id, { pastNumberChoice: 'yes', isReturning: true })}
                  >
                    {t('dashboard.parent.uniform.labels.past_number_yes', { defaultValue: 'Yes, has number' })}
                  </button>
                  <button
                    type="button"
                    className="btn btnSecondary"
                    style={{
                      borderColor: entry.pastNumberChoice === 'no' ? 'var(--primary)' : 'var(--border)',
                      background: entry.pastNumberChoice === 'no' ? 'rgba(99, 102, 241, 0.16)' : undefined,
                    }}
                    onClick={() => updateEntry(child.id, { pastNumberChoice: 'no', isReturning: false, tshirtNumber: '' })}
                  >
                    {t('dashboard.parent.uniform.labels.past_number_no', { defaultValue: 'No number' })}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {t('dashboard.parent.uniform.helper.past_number_choice', { defaultValue: 'Select one option before saving. If no number exists, choose "No number".' })}
                </div>
                {entry.pastNumberChoice === 'yes' && (
                  <div style={{ marginTop: 10, maxWidth: 240 }}>
                    <label className="text-xs" style={{ color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                      {t('dashboard.parent.uniform.labels.tshirt_number', { defaultValue: 'T-shirt Number' })}
                    </label>
                    <input
                      className="input"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={entry.tshirtNumber}
                      onChange={(e) => updateEntry(child.id, { tshirtNumber: e.target.value })}
                      placeholder={t('dashboard.parent.uniform.placeholders.tshirt_number', { defaultValue: 'e.g. 08' })}
                    />
                  </div>
                )}
              </div>
              <div style={{ marginTop: 10 }}>
                <label className="text-xs" style={{ color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                  {t('dashboard.parent.uniform.labels.full_sets', { defaultValue: 'Full sets (1 set = 1 T-shirt + 1 shorts)' })}
                </label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={20}
                    value={impliedSetQty ? String(impliedSetQty) : ''}
                    onChange={(e) => setFullSetQuantity(child.id, e.target.value)}
                    placeholder={t('dashboard.parent.uniform.placeholders.default_one', { defaultValue: '1' })}
                    style={{ maxWidth: 120 }}
                  />
                  <button
                    className="btn btnSecondary"
                    type="button"
                    onClick={() => setFullSetQuantity(child.id, entry.tshirtQuantity)}
                  >
                    {t('dashboard.parent.uniform.actions.match_tshirt', { defaultValue: 'Match to T-shirt qty' })}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                  {t('dashboard.parent.uniform.helper.full_sets', { defaultValue: 'This sets both quantities to the same value. You can still edit them separately above.' })}
                </div>
              </div>
              <div style={{
                marginTop: 12,
                display: 'grid',
                gap: 8,
                fontSize: 12,
                color: 'var(--muted)',
                padding: 12,
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--surface-1)',
              }}>
                <div>
                  <strong style={{ color: 'var(--text)' }}>{t('dashboard.parent.uniform.pricing.title', { defaultValue: 'Pricing:' })}</strong>{' '}
                  {setPrice > 0
                    ? t('dashboard.parent.uniform.pricing.full_set', { defaultValue: 'Full set {{amount}}', amount: formatCurrency(setPrice) })
                    : t('dashboard.parent.uniform.pricing.full_set_unset', { defaultValue: 'Full set —' })}{' '}
                  · {tshirtPrice > 0
                    ? t('dashboard.parent.uniform.pricing.tshirt', { defaultValue: 'T-shirt {{amount}}', amount: formatCurrency(tshirtPrice) })
                    : t('dashboard.parent.uniform.pricing.tshirt_unset', { defaultValue: 'T-shirt —' })}{' '}
                  · {shortsPrice > 0
                    ? t('dashboard.parent.uniform.pricing.shorts', { defaultValue: 'Shorts {{amount}}', amount: formatCurrency(shortsPrice) })
                    : t('dashboard.parent.uniform.pricing.shorts_unset', { defaultValue: 'Shorts —' })}
                </div>
                <div>
                  <strong style={{ color: 'var(--text)' }}>{t('dashboard.parent.uniform.order.title', { defaultValue: 'Order:' })}</strong>{' '}
                  {impliedSetQty > 0
                    ? t('dashboard.parent.uniform.order.sets', { defaultValue: '{{count}} set(s)', count: impliedSetQty })
                    : t('dashboard.parent.uniform.order.sets_zero', { defaultValue: '0 sets' })}{' '}
                  · {t('dashboard.parent.uniform.order.extra_tshirts', { defaultValue: '{{count}} extra T-shirts', count: orderExtraTshirts })}{' '}
                  · {t('dashboard.parent.uniform.order.extra_shorts', { defaultValue: '{{count}} extra shorts', count: orderExtraShorts })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                    {t('dashboard.parent.uniform.total.label', { defaultValue: 'Total:' })}{' '}
                    {hasPricing
                      ? formatCurrency(totalAmount)
                      : t('dashboard.parent.uniform.total.unavailable', { defaultValue: 'Pricing not configured' })}
                  </span>
                  <button
                    className="btn btnSecondary"
                    type="button"
                    onClick={() => handlePayNow(child, entry)}
                    disabled={!entry.tshirtSize || totalItems <= 0 || !hasPricing}
                  >
                    {t('dashboard.parent.uniform.actions.pay_now', { defaultValue: 'Pay now' })}
                  </button>
                  <button
                    className="btn btnSecondary"
                    type="button"
                    onClick={() => handleUploadPOP(child, entry, totalAmount)}
                    disabled={!entry.tshirtSize || totalItems <= 0 || !hasPricing}
                  >
                    {t('dashboard.parent.uniform.actions.upload_pop', { defaultValue: 'Upload POP' })}
                  </button>
                </div>
                {!hasPricing && (
                  <div style={{
                    fontSize: 11,
                    color: 'var(--muted)',
                    background: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                    padding: '6px 8px',
                    borderRadius: 8,
                  }}>
                    {t('dashboard.parent.uniform.total.note', { defaultValue: 'Pricing is not configured yet. We will still generate a payment reference.' })}
                  </div>
                )}
              </div>
              {entry.updatedAt && entry.status !== 'saving' && (
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
                  {t('dashboard.parent.uniform.last_updated', { defaultValue: 'Last updated:' })}{' '}
                  {new Date(entry.updatedAt).toLocaleString(i18n.language || 'en-ZA')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
