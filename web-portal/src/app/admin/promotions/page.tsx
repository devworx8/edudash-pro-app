'use client';

/**
 * Superadmin Promotions & Trial Management
 * Allows superadmin to configure promotional offers, trial periods, and pricing
 * without direct database access
 * 
 * Created: 2025-11-17
 */

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Gift,
  Clock,
  DollarSign,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Percent,
  Calendar,
  Users,
  TrendingUp,
  Zap,
} from 'lucide-react';

interface PromotionConfig {
  id: string;
  name: string;
  description: string;
  trial_days: number;
  discount_percentage: number;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  applicable_tiers: string[];
  max_redemptions: number | null;
  current_redemptions: number;
  created_at: string;
  updated_at: string;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  tier: string;
  price: number;
  currency: string;
  billing_period: string;
  trial_days: number;
  is_active: boolean;
}

export default function PromotionsManagementPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [promotions, setPromotions] = useState<PromotionConfig[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [defaultTrialDays, setDefaultTrialDays] = useState(7);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const supabase = createClient();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch subscription plans
      const { data: plansData, error: plansError } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('price', { ascending: true });

      if (plansError) throw plansError;
      setPlans(plansData || []);

      // Get default trial days from first active plan
      const activePlan = plansData?.find((p: SubscriptionPlan) => p.is_active);
      if (activePlan) {
        setDefaultTrialDays(activePlan.trial_days || 7);
      }

      // Fetch promotions (if table exists)
      const { data: promosData } = await supabase
        .from('promotions')
        .select('*')
        .order('created_at', { ascending: false });

      if (promosData) {
        setPromotions(promosData);
      }

    } catch (error: any) {
      console.error('Failed to fetch data:', error);
      showMessage('error', 'Failed to load promotions data');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleUpdateTrialDays = async () => {
    try {
      setSaving(true);

      // Update all active plans
      const { error } = await supabase
        .from('subscription_plans')
        .update({ trial_days: defaultTrialDays, updated_at: new Date().toISOString() })
        .eq('is_active', true);

      if (error) throw error;

      showMessage('success', `Trial period updated to ${defaultTrialDays} days for all active plans`);
      await fetchData();

    } catch (error: any) {
      console.error('Failed to update trial days:', error);
      showMessage('error', 'Failed to update trial period');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePlanPrice = async (planId: string, newPrice: number) => {
    try {
      const { error } = await supabase
        .from('subscription_plans')
        .update({ price: newPrice, updated_at: new Date().toISOString() })
        .eq('id', planId);

      if (error) throw error;

      showMessage('success', 'Plan price updated successfully');
      await fetchData();

    } catch (error: any) {
      console.error('Failed to update price:', error);
      showMessage('error', 'Failed to update plan price');
    }
  };

  const handleTogglePlanActive = async (planId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('subscription_plans')
        .update({ is_active: !isActive, updated_at: new Date().toISOString() })
        .eq('id', planId);

      if (error) throw error;

      showMessage('success', `Plan ${!isActive ? 'activated' : 'deactivated'} successfully`);
      await fetchData();

    } catch (error: any) {
      console.error('Failed to toggle plan:', error);
      showMessage('error', 'Failed to update plan status');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
            <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl shadow-lg">
                <Gift className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
                Promotions & Pricing
              </h1>
            </div>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 ml-0 sm:ml-14">
              Manage trial periods, promotional offers, and subscription pricing
            </p>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="text-sm font-medium">Refresh</span>
          </button>
        </div>

        {/* Success/Error Message */}
        {message && (
          <div className={`p-4 rounded-xl border flex items-center gap-3 ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        )}

        {/* Default Trial Period */}
        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3 mb-6">
            <Clock className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Default Trial Period</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Trial Duration (Days)
              </label>
              <input
                type="number"
                min="0"
                max="365"
                value={defaultTrialDays}
                onChange={(e) => setDefaultTrialDays(parseInt(e.target.value) || 0)}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Applied to all new subscriptions
              </p>
            </div>

            <button
              onClick={handleUpdateTrialDays}
              disabled={saving}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg font-medium transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Update Trial Period
                </>
              )}
            </button>
          </div>
        </div>

        {/* Subscription Plans */}
        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3 mb-6">
            <DollarSign className="w-6 h-6 text-green-600" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Subscription Plans</h2>
          </div>

          <div className="space-y-4">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onUpdatePrice={handleUpdatePlanPrice}
                onToggleActive={handleTogglePlanActive}
              />
            ))}

            {plans.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Gift className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No subscription plans found</p>
              </div>
            )}
          </div>
        </div>

        {/* Usage Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={Users}
            label="Total Subscriptions"
            value="0"
            trend="+0%"
            color="blue"
          />
          <StatCard
            icon={TrendingUp}
            label="Revenue This Month"
            value="R 0.00"
            trend="+0%"
            color="green"
          />
          <StatCard
            icon={Zap}
            label="Active Trials"
            value="0"
            trend="+0%"
            color="purple"
          />
        </div>
      </div>
    </div>
  );
}

interface PlanCardProps {
  plan: SubscriptionPlan;
  onUpdatePrice: (planId: string, newPrice: number) => void;
  onToggleActive: (planId: string, isActive: boolean) => void;
}

function PlanCard({ plan, onUpdatePrice, onToggleActive }: PlanCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newPrice, setNewPrice] = useState(plan.price);

  const handleSave = () => {
    if (newPrice !== plan.price) {
      onUpdatePrice(plan.id, newPrice);
    }
    setIsEditing(false);
  };

  return (
    <div className={`p-5 rounded-xl border-2 transition-all ${
      plan.is_active
        ? 'border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-900/10'
        : 'border-gray-200 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-900/10 opacity-60'
    }`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{plan.name}</h3>
            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
              plan.is_active
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
            }`}>
              {plan.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <DollarSign className="w-4 h-4" />
              <span className="font-semibold text-gray-900 dark:text-white">
                {plan.currency} {plan.price.toFixed(2)}
              </span>
              <span>/ {plan.billing_period}</span>
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {plan.trial_days} day trial
            </span>
            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 rounded text-xs font-medium">
              {plan.tier}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newPrice}
                onChange={(e) => setNewPrice(parseFloat(e.target.value) || 0)}
                className="w-24 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <button
                onClick={handleSave}
                className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setNewPrice(plan.price);
                }}
                className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                Edit Price
              </button>
              <button
                onClick={() => onToggleActive(plan.id, plan.is_active)}
                className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                  plan.is_active
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {plan.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  trend: string;
  color: 'blue' | 'green' | 'purple';
}

function StatCard({ icon: Icon, label, value, trend, color }: StatCardProps) {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
  };

  return (
    <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-5">
      <div className={`w-10 h-10 bg-gradient-to-br ${colorClasses[color]} rounded-lg flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{trend}</p>
    </div>
  );
}
