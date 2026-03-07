'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { Ticket, Plus, Trash2, Edit2, Save, X, TrendingUp, Users, AlertCircle } from 'lucide-react';

interface Campaign {
  id: string;
  organization_id: string;
  name: string;
  promo_code: string;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: number | null;
  max_redemptions: number;
  current_redemptions: number;
  start_date: string;
  end_date: string;
  active: boolean;
  created_at: string;
}

interface EditingCampaign {
  id: string;
  max_redemptions: number;
  current_redemptions: number;
}

export default function CampaignsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const { profile, loading: profileLoading } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditingCampaign | null>(null);
  const [creating, setCreating] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    promo_code: '',
    campaign_type: 'early_bird' as 'early_bird' | 'sibling_discount' | 'referral_bonus' | 'seasonal_promo' | 'bundle_offer' | 'scholarship',
    description: '',
    terms_conditions: '',
    discount_type: 'percentage' as 'percentage' | 'fixed_amount',
    discount_value: 20,
    max_redemptions: 50,
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    active: true,
  });

  // Check authentication
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
      } else {
        setUserId(session.user.id);
      }
    };
    checkUser();
  }, [supabase, router]);

  // Fetch campaigns when profile loads
  const fetchCampaigns = useCallback(async () => {
    if (!profile?.organizationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('marketing_campaigns')
        .select('*')
        .eq('organization_id', profile.organizationId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCampaigns(data || []);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      alert('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, [profile?.organizationId, supabase]);

  useEffect(() => {
    if (profile?.organizationId) {
      fetchCampaigns();
    }
  }, [profile?.organizationId, fetchCampaigns]);

  const handleCreateCampaign = async () => {
    if (!profile?.organizationId) {
      alert('You must be linked to an organization to create campaigns');
      return;
    }

    try {
      const { error } = await supabase
        .from('marketing_campaigns')
        .insert({
          organization_id: profile.organizationId,
          name: newCampaign.name,
          promo_code: newCampaign.promo_code.toUpperCase(),
          campaign_type: newCampaign.campaign_type,
          description: newCampaign.description,
          terms_conditions: newCampaign.terms_conditions,
          discount_type: newCampaign.discount_type,
          discount_value: newCampaign.discount_value,
          max_redemptions: newCampaign.max_redemptions,
          current_redemptions: 0,
          start_date: newCampaign.start_date,
          end_date: newCampaign.end_date,
          active: newCampaign.active,
        });

      if (error) throw error;

      alert('Campaign created successfully!');
      setCreating(false);
      setNewCampaign({
        name: '',
        promo_code: '',
        campaign_type: 'early_bird',
        description: '',
        terms_conditions: '',
        discount_type: 'percentage',
        discount_value: 20,
        max_redemptions: 50,
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        active: true,
      });
      fetchCampaigns();
    } catch (error: any) {
      console.error('Error creating campaign:', error);
      alert(error.message || 'Failed to create campaign');
    }
  };

  const handleUpdateSlots = async (campaignId: string, newMax: number, newCurrent: number) => {
    try {
      const { error } = await supabase
        .from('marketing_campaigns')
        .update({
          max_redemptions: newMax,
          current_redemptions: newCurrent,
        })
        .eq('id', campaignId);

      if (error) throw error;

      alert('Slots updated successfully!');
      setEditing(null);
      fetchCampaigns();
    } catch (error: any) {
      console.error('Error updating slots:', error);
      alert(error.message || 'Failed to update slots');
    }
  };

  const handleToggleActive = async (campaignId: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from('marketing_campaigns')
        .update({ active: !currentActive })
        .eq('id', campaignId);

      if (error) throw error;
      fetchCampaigns();
    } catch (error) {
      console.error('Error toggling campaign:', error);
      alert('Failed to toggle campaign status');
    }
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    if (!confirm('Are you sure you want to delete this campaign? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('marketing_campaigns')
        .delete()
        .eq('id', campaignId);

      if (error) throw error;

      alert('Campaign deleted successfully!');
      fetchCampaigns();
    } catch (error: any) {
      console.error('Error deleting campaign:', error);
      alert(error.message || 'Failed to delete campaign');
    }
  };

  if (!userId || profileLoading || loading) {
    return (
      <PrincipalShell
        tenantSlug={tenantSlug || ''}
        preschoolName={profile?.preschoolId ? 'Loading...' : undefined}
        preschoolId={profile?.preschoolId}
        hideRightSidebar={true}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-4"></div>
            <p className="text-slate-400">Loading campaigns...</p>
          </div>
        </div>
      </PrincipalShell>
    );
  }

  if (!profile?.organizationId) {
    return (
      <PrincipalShell
        tenantSlug={tenantSlug || ''}
        preschoolName={profile?.preschoolId ? 'Your School' : undefined}
        preschoolId={profile?.preschoolId}
        hideRightSidebar={true}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <AlertCircle size={48} className="text-amber-500 mx-auto mb-4" />
            <p className="text-slate-300 text-lg mb-2">No Organization Linked</p>
            <p className="text-slate-400">You must be linked to an organization to manage campaigns.</p>
          </div>
        </div>
      </PrincipalShell>
    );
  }

  return (
    <PrincipalShell
      tenantSlug={tenantSlug}
      preschoolName={profile?.preschoolId ? 'Your School' : undefined}
      preschoolId={profile?.preschoolId}
      hideRightSidebar={true}
    >
      <div className="section">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="h1">Marketing Campaigns</h1>
            <p style={{ color: 'var(--muted)' }}>
              Create and manage promo codes for registration discounts
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="btn btnPrimary"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Plus size={18} />
            Create Campaign
          </button>
        </div>

        {/* Create Campaign Modal */}
        {creating && (
          <div className="card" style={{ marginBottom: 24, border: '2px solid var(--primary)' }}>
            <h2 className="h2" style={{ marginBottom: 16 }}>New Campaign</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16, marginBottom: 16 }}>
              <div>
                <label className="label">Campaign Name</label>
                <input
                  type="text"
                  className="input"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  placeholder="Early Bird 2026"
                />
              </div>

              <div>
                <label className="label">Coupon Code</label>
                <input
                  type="text"
                  className="input"
                  value={newCampaign.promo_code}
                  onChange={(e) => setNewCampaign({ ...newCampaign, promo_code: e.target.value.toUpperCase() })}
                  placeholder="WELCOME2026"
                />
              </div>

              <div>
                <label className="label">Campaign Type</label>
                <select
                  className="input"
                  value={newCampaign.campaign_type}
                  onChange={(e) => setNewCampaign({ ...newCampaign, campaign_type: e.target.value as any })}
                >
                  <option value="early_bird">Early Bird</option>
                  <option value="sibling_discount">Sibling Discount</option>
                  <option value="referral_bonus">Referral Bonus</option>
                  <option value="seasonal_promo">Seasonal Promo</option>
                  <option value="bundle_offer">Bundle Offer</option>
                  <option value="scholarship">Scholarship</option>
                </select>
              </div>

              <div>
                <label className="label">Discount Type</label>
                <select
                  className="input"
                  value={newCampaign.discount_type}
                  onChange={(e) => setNewCampaign({ ...newCampaign, discount_type: e.target.value as 'percentage' | 'fixed_amount' })}
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed_amount">Fixed Amount</option>
                </select>
              </div>

              {newCampaign.discount_type === 'percentage' ? (
                <div>
                  <label className="label">Discount %</label>
                  <input
                    type="number"
                    className="input"
                    value={newCampaign.discount_value}
                    onChange={(e) => setNewCampaign({ ...newCampaign, discount_value: Number(e.target.value) })}
                    min="1"
                    max="100"
                  />
                </div>
              ) : (
                <div>
                  <label className="label">Discount Amount (R)</label>
                  <input
                    type="number"
                    className="input"
                    value={newCampaign.discount_value}
                    onChange={(e) => setNewCampaign({ ...newCampaign, discount_value: Number(e.target.value) })}
                    min="1"
                  />
                </div>
              )}

              <div>
                <label className="label">Max Redemptions</label>
                <input
                  type="number"
                  className="input"
                  value={newCampaign.max_redemptions}
                  onChange={(e) => setNewCampaign({ ...newCampaign, max_redemptions: Number(e.target.value) })}
                  min="1"
                />
              </div>

              <div>
                <label className="label">Start Date</label>
                <input
                  type="date"
                  className="input"
                  value={newCampaign.start_date}
                  onChange={(e) => setNewCampaign({ ...newCampaign, start_date: e.target.value })}
                />
              </div>

              <div>
                <label className="label">End Date</label>
                <input
                  type="date"
                  className="input"
                  value={newCampaign.end_date}
                  onChange={(e) => setNewCampaign({ ...newCampaign, end_date: e.target.value })}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="label">Description</label>
              <textarea
                className="input"
                value={newCampaign.description}
                onChange={(e) => setNewCampaign({ ...newCampaign, description: e.target.value })}
                placeholder="Short description of this campaign..."
                rows={2}
                style={{ resize: 'vertical', minHeight: '60px' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="label">Terms & Conditions</label>
              <textarea
                className="input"
                value={newCampaign.terms_conditions}
                onChange={(e) => setNewCampaign({ ...newCampaign, terms_conditions: e.target.value })}
                placeholder="Terms and conditions for this offer..."
                rows={3}
                style={{ resize: 'vertical', minHeight: '80px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleCreateCampaign} className="btn btnPrimary">
                <Save size={18} />
                Create Campaign
              </button>
              <button onClick={() => setCreating(false)} className="btn btnSecondary">
                <X size={18} />
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Campaigns List */}
        {campaigns.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <Ticket size={48} style={{ margin: '0 auto 16px', color: 'var(--muted)' }} />
            <h3 className="h3" style={{ marginBottom: 8 }}>No Campaigns Yet</h3>
            <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
              Create your first campaign to offer registration discounts
            </p>
            <button onClick={() => setCreating(true)} className="btn btnPrimary">
              <Plus size={18} />
              Create Campaign
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {campaigns.map((campaign) => {
              const usagePercent = (campaign.current_redemptions / campaign.max_redemptions) * 100;
              const isEditing = editing?.id === campaign.id;

              return (
                <div key={campaign.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 16 }}>
                    <div>
                      <h3 className="h3" style={{ marginBottom: 4 }}>{campaign.name}</h3>
                      <p style={{ color: 'var(--muted)', fontSize: 14 }}>
                        Code: <strong style={{ color: 'var(--primary)' }}>{campaign.promo_code}</strong>
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => handleToggleActive(campaign.id, campaign.active)}
                        className={campaign.active ? 'btn btnSuccess' : 'btn btnSecondary'}
                        style={{ fontSize: 12, padding: '6px 12px' }}
                      >
                        {campaign.active ? 'Active' : 'Inactive'}
                      </button>
                      <button
                        onClick={() => handleDeleteCampaign(campaign.id)}
                        className="btn btnDanger"
                        style={{ padding: 8 }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
                    <div>
                      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Discount</p>
                      <p style={{ fontSize: 16, fontWeight: 600 }}>
                        Discount: {campaign.discount_type === 'percentage'
                          ? `${campaign.discount_value}%`
                          : `R${campaign.discount_value}`}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Valid Period</p>
                      <p style={{ fontSize: 14 }}>
                        {new Date(campaign.start_date).toLocaleDateString()} - {new Date(campaign.end_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Usage Stats */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <p style={{ fontSize: 14, color: 'var(--muted)' }}>Redemptions</p>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            type="number"
                            className="input"
                            style={{ width: 80, padding: '4px 8px', fontSize: 12 }}
                            value={editing.current_redemptions}
                            onChange={(e) => setEditing({ ...editing, current_redemptions: Number(e.target.value) })}
                            min="0"
                            max={editing.max_redemptions}
                          />
                          <span>/</span>
                          <input
                            type="number"
                            className="input"
                            style={{ width: 80, padding: '4px 8px', fontSize: 12 }}
                            value={editing.max_redemptions}
                            onChange={(e) => setEditing({ ...editing, max_redemptions: Number(e.target.value) })}
                            min={editing.current_redemptions}
                          />
                          <button
                            onClick={() => handleUpdateSlots(campaign.id, editing.max_redemptions, editing.current_redemptions)}
                            className="btn btnPrimary"
                            style={{ padding: 6 }}
                          >
                            <Save size={14} />
                          </button>
                          <button
                            onClick={() => setEditing(null)}
                            className="btn btnSecondary"
                            style={{ padding: 6 }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <p style={{ fontSize: 14, fontWeight: 600 }}>
                            {campaign.current_redemptions} / {campaign.max_redemptions}
                          </p>
                          <button
                            onClick={() => setEditing({
                              id: campaign.id,
                              max_redemptions: campaign.max_redemptions,
                              current_redemptions: campaign.current_redemptions,
                            })}
                            className="btn btnSecondary"
                            style={{ padding: 6 }}
                          >
                            <Edit2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div style={{
                      width: '100%',
                      height: 8,
                      backgroundColor: 'var(--border)',
                      borderRadius: 4,
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${usagePercent}%`,
                        height: '100%',
                        backgroundColor: usagePercent >= 90 ? '#ef4444' : usagePercent >= 70 ? '#f59e0b' : '#10b981',
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      {usagePercent.toFixed(1)}% used
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PrincipalShell>
  );
}
