'use client';

/**
 * Superadmin User Management & Troubleshooting
 * Search users, view payment history, tier status, and manually fix issues
 * 
 * Created: 2025-11-17
 */

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Search,
  User,
  DollarSign,
  Shield,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Eye,
  Edit,
  Calendar,
  CreditCard,
  Zap,
  Clock,
  TrendingUp,
  XCircle,
} from 'lucide-react';

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  updated_at: string;
}

interface PaymentTransaction {
  id: string;
  user_id: string;
  tier: string;
  amount: number;
  status: string;
  payment_method: string;
  created_at: string;
  updated_at: string;
}

interface UserTier {
  user_id: string;
  tier: string;
  updated_at: string;
}

interface UserUsage {
  user_id: string;
  current_tier: string;
  exams_generated_this_month: number;
  explanations_requested_this_month: number;
  chat_messages_today: number;
  trial_ends_at: string | null;
  updated_at: string;
}

interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  created_at: string;
}

interface UserDetails {
  profile: UserProfile;
  payments: PaymentTransaction[];
  tier: UserTier | null;
  usage: UserUsage | null;
  subscriptions: Subscription[];
}

export default function UserManagementPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const supabase = createClient();

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const searchUser = async () => {
    if (!searchQuery.trim()) {
      setError('Please enter an email address');
      return;
    }

    try {
      setSearching(true);
      setError(null);
      setUserDetails(null);

      // Fetch user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', searchQuery.trim())
        .single();

      if (profileError || !profile) {
        throw new Error('User not found');
      }

      // Fetch payment transactions
      const { data: payments } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });

      // Fetch user tier
      const { data: tier } = await supabase
        .from('user_ai_tiers')
        .select('*')
        .eq('user_id', profile.id)
        .single();

      // Fetch user usage
      const { data: usage } = await supabase
        .from('user_ai_usage')
        .select('*')
        .eq('user_id', profile.id)
        .single();

      // Fetch subscriptions
      const { data: subscriptions } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });

      setUserDetails({
        profile,
        payments: payments || [],
        tier: tier || null,
        usage: usage || null,
        subscriptions: subscriptions || [],
      });

    } catch (err: any) {
      setError(err.message || 'Failed to fetch user data');
    } finally {
      setSearching(false);
    }
  };

  const fixUserTier = async (newTier: string) => {
    if (!userDetails) return;

    try {
      setFixing(true);

      // Update user_ai_tiers
      const { error: tierError } = await supabase
        .from('user_ai_tiers')
        .upsert({
          user_id: userDetails.profile.id,
          tier: newTier,
          updated_at: new Date().toISOString(),
        });

      if (tierError) throw tierError;

      // Update user_ai_usage
      const { error: usageError } = await supabase
        .from('user_ai_usage')
        .upsert({
          user_id: userDetails.profile.id,
          current_tier: newTier,
          exams_generated_this_month: userDetails.usage?.exams_generated_this_month || 0,
          explanations_requested_this_month: userDetails.usage?.explanations_requested_this_month || 0,
          chat_messages_today: userDetails.usage?.chat_messages_today || 0,
          updated_at: new Date().toISOString(),
        });

      if (usageError) throw usageError;

      showMessage('success', `User tier updated to ${newTier} successfully`);
      
      // Refresh user data
      await searchUser();

    } catch (err: any) {
      showMessage('error', err.message || 'Failed to update user tier');
    } finally {
      setFixing(false);
    }
  };

  const markPaymentCompleted = async (paymentId: string) => {
    try {
      setFixing(true);

      const { error } = await supabase
        .from('payment_transactions')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', paymentId);

      if (error) throw error;

      showMessage('success', 'Payment marked as completed. Tier should auto-update via trigger.');
      
      // Refresh user data
      await searchUser();

    } catch (err: any) {
      showMessage('error', err.message || 'Failed to update payment status');
    } finally {
      setFixing(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-ZA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now.getTime() - past.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg">
              <User className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
              User Management
            </h1>
          </div>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 ml-0 sm:ml-14">
            Search users, view payment history, and troubleshoot tier issues
          </p>
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

        {/* Search Bar */}
        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                User Email Address
              </label>
              <input
                type="email"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchUser()}
                placeholder="user@example.com"
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={searchUser}
                disabled={searching}
                className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg font-medium transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {searching ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    Search User
                  </>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-800 dark:text-red-300">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}
        </div>

        {/* User Details */}
        {userDetails && (
          <div className="space-y-6">
            
            {/* Profile Card */}
            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center gap-3 mb-6">
                <User className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">User Profile</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Email</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">{userDetails.profile.email}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Full Name</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {userDetails.profile.full_name || 'Not set'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Role</p>
                  <span className="inline-block px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 rounded-full text-sm font-semibold">
                    {userDetails.profile.role.toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">User ID</p>
                  <p className="text-xs font-mono text-gray-600 dark:text-gray-400">{userDetails.profile.id}</p>
                </div>
              </div>
            </div>

            {/* Tier Status Card */}
            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Shield className="w-6 h-6 text-green-600" />
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Tier Status</h2>
                </div>
                {userDetails.tier && userDetails.usage && userDetails.tier.tier !== userDetails.usage.current_tier && (
                  <span className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 rounded-full text-sm font-semibold flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    Mismatch Detected
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">user_ai_tiers.tier</p>
                  {userDetails.tier ? (
                    <span className="inline-block px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 rounded-full text-sm font-semibold">
                      {userDetails.tier.tier}
                    </span>
                  ) : (
                    <span className="inline-block px-3 py-1 bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-400 rounded-full text-sm font-semibold">
                      Not Set
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">user_ai_usage.current_tier</p>
                  {userDetails.usage ? (
                    <span className="inline-block px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 rounded-full text-sm font-semibold">
                      {userDetails.usage.current_tier}
                    </span>
                  ) : (
                    <span className="inline-block px-3 py-1 bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-400 rounded-full text-sm font-semibold">
                      Not Set
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Trial Status</p>
                  {userDetails.usage?.trial_ends_at ? (
                    new Date(userDetails.usage.trial_ends_at) > new Date() ? (
                      <span className="inline-block px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400 rounded-full text-sm font-semibold">
                        Active Trial
                      </span>
                    ) : (
                      <span className="inline-block px-3 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 rounded-full text-sm font-semibold">
                        Trial Expired
                      </span>
                    )
                  ) : (
                    <span className="inline-block px-3 py-1 bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-400 rounded-full text-sm font-semibold">
                      No Trial
                    </span>
                  )}
                </div>
              </div>

              {userDetails.usage && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {userDetails.usage.exams_generated_this_month}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Exams This Month</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {userDetails.usage.explanations_requested_this_month}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Explanations</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {userDetails.usage.chat_messages_today}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Chat Messages Today</p>
                  </div>
                </div>
              )}

              {/* Manual Tier Fix */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Manual Tier Update</h3>
                <div className="flex flex-wrap gap-2">
                  {['parent_starter', 'parent_plus', 'trial'].map((tier) => (
                    <button
                      key={tier}
                      onClick={() => fixUserTier(tier)}
                      disabled={fixing}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Set to {tier}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  ⚠️ Only use if payment is confirmed successful. Updates both user_ai_tiers and user_ai_usage.
                </p>
              </div>
            </div>

            {/* Payment History */}
            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center gap-3 mb-6">
                <CreditCard className="w-6 h-6 text-purple-600" />
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Payment History</h2>
              </div>

              {userDetails.payments.length > 0 ? (
                <div className="space-y-3">
                  {userDetails.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold text-gray-900 dark:text-white">R {payment.amount.toFixed(2)}</span>
                            <span className="text-sm text-gray-600 dark:text-gray-400">→</span>
                            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 rounded text-xs font-semibold">
                              {payment.tier}
                            </span>
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${
                              payment.status === 'completed'
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                                : payment.status === 'pending'
                                ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400'
                                : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                            }`}>
                              {payment.status.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {payment.payment_method} • {formatDate(payment.created_at)} ({formatTimeAgo(payment.created_at)})
                          </p>
                          <p className="text-xs font-mono text-gray-500 dark:text-gray-500 mt-1">{payment.id}</p>
                        </div>

                        {payment.status === 'pending' && (
                          <button
                            onClick={() => markPaymentCompleted(payment.id)}
                            disabled={fixing}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Mark Completed
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No payment history found</p>
                </div>
              )}
            </div>

            {/* Subscriptions */}
            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center gap-3 mb-6">
                <Calendar className="w-6 h-6 text-orange-600" />
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Subscriptions</h2>
              </div>

              {userDetails.subscriptions.length > 0 ? (
                <div className="space-y-3">
                  {userDetails.subscriptions.map((sub) => (
                    <div
                      key={sub.id}
                      className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          sub.status === 'active'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                            : 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-400'
                        }`}>
                          {sub.status.toUpperCase()}
                        </span>
                        <span className="text-sm text-gray-600 dark:text-gray-400">Plan: {sub.plan_id}</span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Period: {formatDate(sub.current_period_start)} → {formatDate(sub.current_period_end)}
                      </p>
                      <p className="text-xs font-mono text-gray-500 dark:text-gray-500 mt-1">{sub.id}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No subscription records found</p>
                  <p className="text-xs mt-2">This might indicate webhook didn't fire</p>
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
