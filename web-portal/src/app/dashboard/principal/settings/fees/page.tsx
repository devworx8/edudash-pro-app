'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { DollarSign, Plus, Edit2, Trash2, ArrowLeft, Save } from 'lucide-react';
import { getUniformItemType, isUniformFee } from '@/lib/utils/feeUtils';

interface FeeItem {
  id?: string;
  name: string;
  amount: number;
  frequency: 'once' | 'monthly' | 'quarterly' | 'annually';
  required: boolean;
  description?: string;
}

interface UniformFeeRow {
  id: string;
  name?: string | null;
  description?: string | null;
  fee_category?: string | null;
  amount_cents: number;
  is_active?: boolean | null;
}

interface UniformPricingState {
  enabled: boolean;
  setPrice: string;
  tshirtPrice: string;
  shortsPrice: string;
  ids: {
    set?: string;
    tshirt?: string;
    shorts?: string;
  };
}

interface FinanceAdminControlsState {
  canManageFees: boolean;
  canManageStudentProfile: boolean;
  canDeleteFees: boolean;
}

interface FinancePrivacySettingsState {
  feesPrivateModeEnabled: boolean;
  financeAdminControls: FinanceAdminControlsState;
}

const DEFAULT_FINANCE_ADMIN_CONTROLS: FinanceAdminControlsState = {
  canManageFees: true,
  canManageStudentProfile: true,
  canDeleteFees: true,
};

const DEFAULT_FINANCE_PRIVACY_SETTINGS: FinancePrivacySettingsState = {
  feesPrivateModeEnabled: false,
  financeAdminControls: DEFAULT_FINANCE_ADMIN_CONTROLS,
};

function deepMerge<T>(base: T, overrides: Partial<T>): T {
  const result: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const key of Object.keys(overrides || {})) {
    const value: any = (overrides as any)[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      (result as any)[key] = deepMerge((result as any)[key] ?? {}, value);
    } else {
      (result as any)[key] = value;
    }
  }
  return result as T;
}

function resolveFinancePrivacyFromSettings(settings: Record<string, any> | null | undefined): FinancePrivacySettingsState {
  const root = settings || {};
  const financialReports = (root.features?.financialReports || {}) as Record<string, any>;
  const permissions = (root.permissions || {}) as Record<string, any>;
  const financeAdminControls = (permissions.financeAdminControls || {}) as Record<string, any>;
  const financePermissions = (root.finance_permissions || {}) as Record<string, any>;

  const feesPrivateModeEnabled =
    financialReports.privateModeEnabled === true ||
    financialReports.hideOnDashboards === true ||
    financialReports.requirePasswordForAccess === true;

  return {
    feesPrivateModeEnabled,
    financeAdminControls: {
      canManageFees:
        financeAdminControls.canManageFees !== undefined
          ? financeAdminControls.canManageFees === true
          : financePermissions.admin_can_manage_fees !== undefined
            ? financePermissions.admin_can_manage_fees === true
            : true,
      canManageStudentProfile:
        financeAdminControls.canManageStudentProfile !== undefined
          ? financeAdminControls.canManageStudentProfile === true
          : financePermissions.admin_can_manage_student_profile !== undefined
            ? financePermissions.admin_can_manage_student_profile === true
            : true,
      canDeleteFees:
        financeAdminControls.canDeleteFees !== undefined
          ? financeAdminControls.canDeleteFees === true
          : financePermissions.admin_can_delete_fees !== undefined
            ? financePermissions.admin_can_delete_fees === true
            : true,
    },
  };
}

async function fetchSchoolSettings(
  supabase: ReturnType<typeof createClient>,
  schoolId: string
): Promise<Record<string, any>> {
  const { data: preschoolRow } = await supabase
    .from('preschools')
    .select('settings')
    .eq('id', schoolId)
    .maybeSingle();
  if (preschoolRow?.settings) {
    return preschoolRow.settings as Record<string, any>;
  }

  const { data: organizationRow } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', schoolId)
    .maybeSingle();

  return (organizationRow?.settings || {}) as Record<string, any>;
}

async function updateSchoolSettings(
  supabase: ReturnType<typeof createClient>,
  schoolId: string,
  patch: Record<string, any>
): Promise<void> {
  const [{ data: preschoolRow }, { data: organizationRow }] = await Promise.all([
    supabase.from('preschools').select('settings').eq('id', schoolId).maybeSingle(),
    supabase.from('organizations').select('settings').eq('id', schoolId).maybeSingle(),
  ]);

  const currentSettings =
    (preschoolRow?.settings || organizationRow?.settings || {}) as Record<string, any>;
  const mergedSettings = deepMerge(currentSettings, patch);

  const { data: rpcData, error: rpcError } = await (supabase as any).rpc('update_school_settings', {
    p_preschool_id: schoolId,
    p_patch: mergedSettings,
  });

  if (rpcError) {
    if (!preschoolRow && organizationRow) {
      const { error: orgUpdateError } = await supabase
        .from('organizations')
        .update({ settings: mergedSettings })
        .eq('id', schoolId);
      if (orgUpdateError) throw orgUpdateError;
      return;
    }
    throw rpcError;
  }

  if (organizationRow) {
    const syncedSettings = (rpcData || mergedSettings) as Record<string, any>;
    try {
      await supabase.from('organizations').update({ settings: syncedSettings }).eq('id', schoolId);
    } catch {
      // Best-effort sync only; preschools/settings RPC remains source of truth.
    }
  }
}

export default function FeesPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [fees, setFees] = useState<FeeItem[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingFee, setEditingFee] = useState<FeeItem | null>(null);
  const [feesPrivateModeEnabled, setFeesPrivateModeEnabled] = useState(
    DEFAULT_FINANCE_PRIVACY_SETTINGS.feesPrivateModeEnabled
  );
  const [financeAdminControls, setFinanceAdminControls] = useState<FinanceAdminControlsState>(
    DEFAULT_FINANCE_ADMIN_CONTROLS
  );
  const [uniformPricing, setUniformPricing] = useState<UniformPricingState>({
    enabled: false,
    setPrice: '',
    tshirtPrice: '',
    shortsPrice: '',
    ids: {},
  });

  const { profile } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const preschoolName = profile?.preschoolName;
  const schoolId = profile?.preschoolId || profile?.organizationId;
  const preschoolId = schoolId;

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setUserId(session.user.id);
      setLoading(false);
    };
    initAuth();
  }, [router, supabase]);

  useEffect(() => {
    if (!schoolId) return;
    fetchFees();
    fetchUniformPricing();
    fetchFinancePrivacySettings();
  }, [schoolId]);

  const fetchFees = async () => {
    if (!schoolId) return;
    const { data } = await supabase
      .from('school_settings')
      .select('setting_value')
      .eq('preschool_id', schoolId)
      .eq('setting_key', 'fees')
      .single();

    if (data?.setting_value) {
      setFees(JSON.parse(data.setting_value as string));
    } else {
      // Default fees
      setFees([
        { name: 'Registration Fee', amount: 500, frequency: 'once', required: true },
        { name: 'Monthly Tuition', amount: 2500, frequency: 'monthly', required: true },
      ]);
    }
  };

  const fetchUniformPricing = async () => {
    if (!schoolId) return;

    const { data, error } = await supabase
      .from('school_fee_structures')
      .select('id, name, description, fee_category, amount_cents, is_active')
      .eq('preschool_id', schoolId)
      .eq('fee_category', 'uniform');

    if (error) {
      return;
    }

    const uniformRows: UniformFeeRow[] = Array.isArray(data) ? data : [];
    const enabled = uniformRows.some((row) => row.is_active);
    const ids: UniformPricingState['ids'] = {};
    let setPrice = '';
    let tshirtPrice = '';
    let shortsPrice = '';

    uniformRows.forEach((row) => {
      if (!isUniformFee(row.fee_category, row.name, row.description)) return;
      const itemType = getUniformItemType(row.fee_category, row.name, row.description);
      const amount = row.amount_cents ? (row.amount_cents / 100).toFixed(2) : '';

      if (itemType === 'set') {
        ids.set = row.id;
        if (!setPrice) setPrice = amount;
      }
      if (itemType === 'tshirt') {
        ids.tshirt = row.id;
        if (!tshirtPrice) tshirtPrice = amount;
      }
      if (itemType === 'shorts') {
        ids.shorts = row.id;
        if (!shortsPrice) shortsPrice = amount;
      }
    });

    setUniformPricing({
      enabled,
      setPrice,
      tshirtPrice,
      shortsPrice,
      ids,
    });
  };

  const fetchFinancePrivacySettings = async () => {
    if (!schoolId) return;
    try {
      const settings = await fetchSchoolSettings(supabase, schoolId);
      const resolved = resolveFinancePrivacyFromSettings(settings);
      setFeesPrivateModeEnabled(resolved.feesPrivateModeEnabled);
      setFinanceAdminControls(resolved.financeAdminControls);
    } catch {
      setFeesPrivateModeEnabled(DEFAULT_FINANCE_PRIVACY_SETTINGS.feesPrivateModeEnabled);
      setFinanceAdminControls(DEFAULT_FINANCE_PRIVACY_SETTINGS.financeAdminControls);
    }
  };

  const handleSaveFees = async () => {
    if (!schoolId) return;
    setSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from('school_settings')
      .upsert({
        preschool_id: schoolId,
        setting_key: 'fees',
        setting_value: JSON.stringify(fees),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'preschool_id,setting_key',
      });

    if (error) {
      setSaving(false);
      setMessage({ type: 'error', text: 'Failed to save fees. Please try again.' });
      return;
    }

    const uniformSaveResult = await saveUniformPricing();
    const uniformFlagResult = await updateUniformFeatureFlag(uniformPricing.enabled);
    const financeSettingsResult = await saveFinancePrivacySettings();
    setSaving(false);

    if (!uniformSaveResult) {
      setMessage({ type: 'error', text: 'Fees saved, but uniform pricing could not be updated.' });
      return;
    }

    if (!uniformFlagResult) {
      setMessage({ type: 'error', text: 'Fees saved, but uniform visibility could not be updated.' });
      return;
    }

    if (!financeSettingsResult) {
      setMessage({ type: 'error', text: 'Fees saved, but fee privacy/admin controls could not be updated.' });
      return;
    }

    setMessage({ type: 'success', text: 'Fees, privacy mode, and admin controls updated successfully!' });
    setTimeout(() => setMessage(null), 3000);
  };

  const updateUniformFeatureFlag = async (enabled: boolean): Promise<boolean> => {
    if (!schoolId) return false;

    const tables: Array<'preschools' | 'organizations'> = ['preschools', 'organizations'];
    try {
      for (const table of tables) {
        const { data: row, error } = await supabase
          .from(table)
          .select('id, settings')
          .eq('id', schoolId)
          .maybeSingle();

        if (error || !row) continue;

        const settings = row.settings || {};
        const features = settings.features || {};
        const uniforms = features.uniforms || {};

        if (uniforms.enabled === enabled) continue;

        const nextSettings = {
          ...settings,
          features: {
            ...features,
            uniforms: {
              ...uniforms,
              enabled,
            },
          },
        };

        const { error: updateError } = await supabase
          .from(table)
          .update({ settings: nextSettings })
          .eq('id', schoolId);

        if (updateError) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  };

  const saveUniformPricing = async (): Promise<boolean> => {
    if (!schoolId) return false;

    if (!uniformPricing.enabled) {
      const { error } = await supabase
        .from('school_fee_structures')
        .update({ is_active: false })
        .eq('preschool_id', schoolId)
        .eq('fee_category', 'uniform');

      return !error;
    }

    const setPrice = Number.parseFloat(uniformPricing.setPrice);
    const tshirtPrice = Number.parseFloat(uniformPricing.tshirtPrice);
    const shortsPrice = Number.parseFloat(uniformPricing.shortsPrice);

    if (!Number.isFinite(setPrice) || !Number.isFinite(tshirtPrice) || !Number.isFinite(shortsPrice)) {
      setMessage({ type: 'error', text: 'Please enter all uniform prices before saving.' });
      return false;
    }

    const payloads = [
      {
        id: uniformPricing.ids.set,
        preschool_id: schoolId,
        name: 'Uniform Set',
        description: 'Uniform Set',
        amount_cents: Math.round(setPrice * 100),
        fee_category: 'uniform',
        is_active: true,
        currency: 'ZAR',
      },
      {
        id: uniformPricing.ids.tshirt,
        preschool_id: schoolId,
        name: 'Uniform T-shirt',
        description: 'Uniform T-shirt',
        amount_cents: Math.round(tshirtPrice * 100),
        fee_category: 'uniform',
        is_active: true,
        currency: 'ZAR',
      },
      {
        id: uniformPricing.ids.shorts,
        preschool_id: schoolId,
        name: 'Uniform Shorts',
        description: 'Uniform Shorts',
        amount_cents: Math.round(shortsPrice * 100),
        fee_category: 'uniform',
        is_active: true,
        currency: 'ZAR',
      },
    ];

    const [setPayload, tshirtPayload, shortsPayload] = payloads;

    const inserts = payloads.filter((row) => !row.id);
    const updates = payloads.filter((row) => row.id);

    if (updates.length) {
      const { error: updateError } = await supabase
        .from('school_fee_structures')
        .upsert(updates, { onConflict: 'id' });
      if (updateError) {
        return false;
      }
    }

    if (inserts.length) {
      const { error: insertError } = await supabase
        .from('school_fee_structures')
        .insert(inserts.map(({ id, ...row }) => row));
      if (insertError) {
        return false;
      }
    }

    return true;
  };

  const saveFinancePrivacySettings = async (): Promise<boolean> => {
    if (!schoolId) return false;
    try {
      const patch = {
        features: {
          financialReports: {
            hideOnDashboards: feesPrivateModeEnabled,
            requirePasswordForAccess: feesPrivateModeEnabled,
            privateModeEnabled: feesPrivateModeEnabled,
          },
        },
        permissions: {
          financeAdminControls: {
            canManageFees: financeAdminControls.canManageFees,
            canManageStudentProfile: financeAdminControls.canManageStudentProfile,
            canDeleteFees: financeAdminControls.canDeleteFees,
          },
        },
        finance_permissions: {
          admin_can_manage_fees: financeAdminControls.canManageFees,
          admin_can_manage_student_profile: financeAdminControls.canManageStudentProfile,
          admin_can_delete_fees: financeAdminControls.canDeleteFees,
        },
      };
      await updateSchoolSettings(supabase, schoolId, patch);
      return true;
    } catch {
      return false;
    }
  };

  const handleAddFee = (fee: FeeItem) => {
    setFees([...fees, { ...fee, id: Date.now().toString() }]);
    setShowAddModal(false);
  };

  const handleEditFee = (fee: FeeItem) => {
    setFees(fees.map((f) => (f.id === fee.id ? fee : f)));
    setEditingFee(null);
  };

  const handleDeleteFee = (id: string) => {
    setFees(fees.filter((f) => f.id !== id));
  };

  if (loading) {
    return (
      <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={preschoolId} hideRightSidebar={true}>
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-slate-400">Loading...</p>
        </div>
      </PrincipalShell>
    );
  }

  return (
    <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={preschoolId} hideRightSidebar={true}>
      <div className="section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button className="iconBtn" onClick={() => router.back()}>
              <ArrowLeft className="icon20" />
            </button>
            <div>
              <h1 className="h1" style={{ marginBottom: 4 }}>Fee Structure</h1>
              <p style={{ color: 'var(--muted)', fontSize: 14 }}>
                Configure registration, tuition, and other fees
              </p>
            </div>
          </div>
          <button 
            className="btn btnPrimary"
            onClick={() => setShowAddModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Plus size={18} />
            Add Fee
          </button>
        </div>

        {message && (
          <div
            className="card"
            style={{
              marginBottom: 24,
              padding: 16,
              background: message.type === 'success' ? '#10b98120' : '#ef444420',
              borderLeft: `4px solid ${message.type === 'success' ? '#10b981' : '#ef4444'}`,
            }}
          >
            <p style={{ color: message.type === 'success' ? '#10b981' : '#ef4444', margin: 0 }}>
              {message.text}
            </p>
          </div>
        )}

        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <DollarSign size={24} style={{ color: 'var(--primary)' }} />
            <h3>Current Fee Structure</h3>
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            {fees.length === 0 ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>
                No fees configured. Click "Add Fee" to get started.
              </p>
            ) : (
              fees.map((fee, idx) => (
                <div
                  key={fee.id || idx}
                  className="card"
                  style={{ background: 'var(--surface-2)', padding: 20 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <h4 style={{ margin: 0 }}>{fee.name}</h4>
                        {fee.required && (
                          <span className="chip" style={{ fontSize: 12, padding: '2px 8px' }}>
                            Required
                          </span>
                        )}
                      </div>
                      {fee.description && (
                        <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 12px 0' }}>
                          {fee.description}
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: 24, fontSize: 14 }}>
                        <div>
                          <span style={{ color: 'var(--muted)' }}>Amount: </span>
                          <span style={{ fontWeight: 600 }}>R{fee.amount.toLocaleString()}</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--muted)' }}>Frequency: </span>
                          <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                            {fee.frequency}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="iconBtn"
                        onClick={() => setEditingFee(fee)}
                        aria-label="Edit"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        className="iconBtn"
                        onClick={() => handleDeleteFee(fee.id!)}
                        aria-label="Delete"
                        style={{ color: '#ef4444' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0 }}>Uniform Pricing</h3>
              <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
                Enable uniform sales and set pricing for your school.
              </p>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={uniformPricing.enabled}
                onChange={(e) => setUniformPricing((prev) => ({ ...prev, enabled: e.target.checked }))}
              />
              Enable Uniform Sales
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Full Set (R)</label>
              <input
                type="number"
                className="input"
                value={uniformPricing.setPrice}
                onChange={(e) => setUniformPricing((prev) => ({ ...prev, setPrice: e.target.value }))}
                placeholder="0.00"
                min="0"
                step="0.01"
                disabled={!uniformPricing.enabled}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>T-shirt Only (R)</label>
              <input
                type="number"
                className="input"
                value={uniformPricing.tshirtPrice}
                onChange={(e) => setUniformPricing((prev) => ({ ...prev, tshirtPrice: e.target.value }))}
                placeholder="0.00"
                min="0"
                step="0.01"
                disabled={!uniformPricing.enabled}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Shorts Only (R)</label>
              <input
                type="number"
                className="input"
                value={uniformPricing.shortsPrice}
                onChange={(e) => setUniformPricing((prev) => ({ ...prev, shortsPrice: e.target.value }))}
                placeholder="0.00"
                min="0"
                step="0.01"
                disabled={!uniformPricing.enabled}
              />
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>Fee Privacy & Admin Controls</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
              Match mobile policy controls: private fee mode and principal-scoped admin finance rights.
            </p>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={feesPrivateModeEnabled}
                onChange={(e) => setFeesPrivateModeEnabled(e.target.checked)}
              />
              Enable private fees mode (hide fee widgets on dashboards)
            </label>

            <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 10 }}>
                Admin finance controls
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={financeAdminControls.canManageFees}
                    onChange={(e) =>
                      setFinanceAdminControls((prev) => ({ ...prev, canManageFees: e.target.checked }))
                    }
                  />
                  Admins can mark/waive/adjust fees
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={financeAdminControls.canManageStudentProfile}
                    onChange={(e) =>
                      setFinanceAdminControls((prev) => ({
                        ...prev,
                        canManageStudentProfile: e.target.checked,
                      }))
                    }
                  />
                  Admins can change class/start date/lifecycle
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={financeAdminControls.canDeleteFees}
                    onChange={(e) =>
                      setFinanceAdminControls((prev) => ({ ...prev, canDeleteFees: e.target.checked }))
                    }
                  />
                  Admins can delete fee rows
                </label>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button className="btn btnMuted" onClick={() => router.back()}>
            Cancel
          </button>
          <button 
            className="btn btnPrimary" 
            onClick={handleSaveFees}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Save size={18} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Add/Edit Fee Modal */}
      {(showAddModal || editingFee) && (
        <FeeModal
          fee={editingFee || undefined}
          onSave={editingFee ? handleEditFee : handleAddFee}
          onClose={() => {
            setShowAddModal(false);
            setEditingFee(null);
          }}
        />
      )}
    </PrincipalShell>
  );
}

// Fee Modal Component (under 400 lines total)
function FeeModal({ 
  fee, 
  onSave, 
  onClose 
}: { 
  fee?: FeeItem; 
  onSave: (fee: FeeItem) => void; 
  onClose: () => void;
}) {
  const [formData, setFormData] = useState<FeeItem>(
    fee || {
      name: '',
      amount: 0,
      frequency: 'monthly',
      required: false,
      description: '',
    }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: 500, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: 24 }}>{fee ? 'Edit Fee' : 'Add New Fee'}</h3>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 20 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
              Fee Name *
            </label>
            <input
              type="text"
              className="input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Registration Fee"
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
              Amount (ZAR) *
            </label>
            <input
              type="number"
              className="input"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
              placeholder="0.00"
              min="0"
              step="0.01"
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
              Frequency *
            </label>
            <select
              className="input"
              value={formData.frequency}
              onChange={(e) => setFormData({ ...formData, frequency: e.target.value as any })}
              required
            >
              <option value="once">One-time</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annually">Annually</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
              Description
            </label>
            <textarea
              className="input"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Optional description..."
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="checkbox"
              id="required"
              checked={formData.required}
              onChange={(e) => setFormData({ ...formData, required: e.target.checked })}
              style={{ width: 18, height: 18 }}
            />
            <label htmlFor="required" style={{ fontWeight: 500, cursor: 'pointer' }}>
              Required for all students
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
            <button type="button" className="btn btnMuted" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btnPrimary">
              {fee ? 'Update' : 'Add'} Fee
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
