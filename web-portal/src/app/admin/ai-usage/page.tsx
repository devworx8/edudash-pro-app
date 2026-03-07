'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Activity, Image, MessageSquare, RefreshCcw, Search, Users } from 'lucide-react';

interface AiUsageRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  current_tier: string | null;
  chat_messages_this_month: number | null;
  chat_messages_today: number | null;
  last_monthly_reset_at: string | null;
  last_daily_reset_at: string | null;
}

interface ImageUsageRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  uploads_today: number | null;
}

interface MonthlyRollupRow {
  usage_month: string | null;
  total_cost: number | null;
  total_tokens: number | null;
  request_count: number | null;
}

interface AiCostSummary {
  monthly_cost: number;
}

export default function AIUsagePage() {
  const supabase = createClient();
  const [usageRows, setUsageRows] = useState<AiUsageRow[]>([]);
  const [imageRows, setImageRows] = useState<ImageUsageRow[]>([]);
  const [monthlyRollup, setMonthlyRollup] = useState<MonthlyRollupRow[]>([]);
  const [aiCostSummary, setAiCostSummary] = useState<AiCostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const formatNumber = (value?: number | null) => new Intl.NumberFormat().format(value ?? 0);

  const loadData = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);
    try {
      const [
        { data: usageData, error: usageError },
        { data: imageData, error: imageError },
        { data: costData, error: costError },
        { data: rollupData, error: rollupError },
      ] =
        await Promise.all([
          supabase.rpc('admin_get_ai_usage_summary'),
          supabase.rpc('admin_get_image_uploads_today'),
          supabase.rpc('get_superadmin_ai_usage_cost', { days_back: 30 }),
          supabase
            .from('monthly_ai_usage_rollup')
            .select('usage_month,total_cost,total_tokens,request_count')
            .order('usage_month', { ascending: false })
            .limit(12),
        ]);

      if (usageError) throw usageError;
      if (imageError) throw imageError;
      if (costError) console.warn('AI cost summary unavailable', costError);
      if (rollupError) console.warn('Monthly rollup unavailable', rollupError);

      setUsageRows((usageData as AiUsageRow[]) || []);
      setImageRows((imageData as ImageUsageRow[]) || []);
      if (costData?.success && costData.data) {
        setAiCostSummary({ monthly_cost: Number(costData.data.monthly_cost || 0) });
      }
      const rawRollup = ((rollupData as MonthlyRollupRow[]) || []).filter((row) => row.usage_month);
      const aggregated = new Map<string, MonthlyRollupRow>();
      rawRollup.forEach((row) => {
        const key = row.usage_month as string;
        const current = aggregated.get(key) || {
          usage_month: key,
          total_cost: 0,
          total_tokens: 0,
          request_count: 0,
        };
        aggregated.set(key, {
          usage_month: key,
          total_cost: (current.total_cost || 0) + (row.total_cost || 0),
          total_tokens: (current.total_tokens || 0) + (row.total_tokens || 0),
          request_count: (current.request_count || 0) + (row.request_count || 0),
        });
      });
      setMonthlyRollup(
        Array.from(aggregated.values()).sort((a, b) =>
          String(b.usage_month).localeCompare(String(a.usage_month))
        )
      );
    } catch (err: any) {
      console.error('Failed to load AI usage data', err);
      setError(err?.message || 'Failed to load AI usage data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredUsage = useMemo(() => {
    if (!search.trim()) return usageRows;
    const q = search.trim().toLowerCase();
    return usageRows.filter((row) => {
      const name = row.full_name?.toLowerCase() || '';
      const email = row.email?.toLowerCase() || '';
      return name.includes(q) || email.includes(q);
    });
  }, [usageRows, search]);

  const filteredImages = useMemo(() => {
    if (!search.trim()) return imageRows;
    const q = search.trim().toLowerCase();
    return imageRows.filter((row) => {
      const name = row.full_name?.toLowerCase() || '';
      const email = row.email?.toLowerCase() || '';
      return name.includes(q) || email.includes(q);
    });
  }, [imageRows, search]);

  const totalChatThisMonth = useMemo(
    () => usageRows.reduce((sum, row) => sum + (row.chat_messages_this_month ?? 0), 0),
    [usageRows]
  );
  const totalChatToday = useMemo(
    () => usageRows.reduce((sum, row) => sum + (row.chat_messages_today ?? 0), 0),
    [usageRows]
  );
  const totalUploadsToday = useMemo(
    () => imageRows.reduce((sum, row) => sum + (row.uploads_today ?? 0), 0),
    [imageRows]
  );
  const totalMonthlyRequests = useMemo(
    () => monthlyRollup.reduce((sum, row) => sum + (row.request_count ?? 0), 0),
    [monthlyRollup]
  );
  const totalMonthlyTokens = useMemo(
    () => monthlyRollup.reduce((sum, row) => sum + (row.total_tokens ?? 0), 0),
    [monthlyRollup]
  );
  const avgCostPerRequest = useMemo(() => {
    if (!aiCostSummary?.monthly_cost || totalMonthlyRequests === 0) return 0;
    return aiCostSummary.monthly_cost / totalMonthlyRequests;
  }, [aiCostSummary, totalMonthlyRequests]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <RefreshCcw className="w-8 h-8 animate-spin mx-auto text-blue-600 dark:text-blue-400" />
          <p className="mt-2 text-gray-600 dark:text-gray-400">Loading AI usage...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Activity className="w-8 h-8" />
                AI Usage
              </h1>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Monthly chat usage and daily image uploads (superadmin only)
              </p>
            </div>
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-60"
            >
              <RefreshCcw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-200 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 text-sm">
              <Users className="w-4 h-4" />
              Tracked Users
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              {formatNumber(usageRows.length)}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 text-sm">
              <MessageSquare className="w-4 h-4" />
              Chat Messages (Month)
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              {formatNumber(totalChatThisMonth)}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 text-sm">
              <MessageSquare className="w-4 h-4" />
              Chat Messages (Today)
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              {formatNumber(totalChatToday)}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 text-sm">
              <Image className="w-4 h-4" />
              Image Uploads (Today)
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              {formatNumber(totalUploadsToday)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 text-sm">
              <Activity className="w-4 h-4" />
              AI Cost (30d)
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              {aiCostSummary ? `R${(aiCostSummary.monthly_cost || 0).toFixed(2)}` : '—'}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 text-sm">
              <MessageSquare className="w-4 h-4" />
              Requests (30d)
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              {formatNumber(totalMonthlyRequests)}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 text-sm">
              <Activity className="w-4 h-4" />
              Avg Cost / Request
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              {avgCostPerRequest ? `R${avgCostPerRequest.toFixed(2)}` : '—'}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Search by name or email
          </label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search users..."
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Chat Usage</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-600 dark:text-gray-300">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">User</th>
                  <th className="text-left px-4 py-3 font-medium">Role</th>
                  <th className="text-left px-4 py-3 font-medium">Tier</th>
                  <th className="text-right px-4 py-3 font-medium">This Month</th>
                  <th className="text-right px-4 py-3 font-medium">Today</th>
                  <th className="text-left px-4 py-3 font-medium">Last Reset</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsage.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
                      No usage data found.
                    </td>
                  </tr>
                )}
                {filteredUsage.map((row) => (
                  <tr
                    key={row.user_id}
                    className="border-t border-gray-100 dark:border-gray-700/50 text-gray-700 dark:text-gray-200"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {row.full_name || 'Unknown'}
                      </div>
                      <div className="text-xs text-gray-500">{row.email || '—'}</div>
                    </td>
                    <td className="px-4 py-3">{row.role || '—'}</td>
                    <td className="px-4 py-3">{row.current_tier || '—'}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(row.chat_messages_this_month)}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(row.chat_messages_today)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {row.last_monthly_reset_at
                        ? new Date(row.last_monthly_reset_at).toLocaleString()
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Image Uploads (Today)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-600 dark:text-gray-300">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">User</th>
                  <th className="text-right px-4 py-3 font-medium">Uploads</th>
                </tr>
              </thead>
              <tbody>
                {filteredImages.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
                      No uploads recorded today.
                    </td>
                  </tr>
                )}
                {filteredImages.map((row) => (
                  <tr
                    key={row.user_id}
                    className="border-t border-gray-100 dark:border-gray-700/50 text-gray-700 dark:text-gray-200"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {row.full_name || 'Unknown'}
                      </div>
                      <div className="text-xs text-gray-500">{row.email || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-right">{formatNumber(row.uploads_today)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Monthly AI Usage Report</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">Last 12 months of AI usage + cost rollups</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requests</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tokens</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cost</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {monthlyRollup.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      No monthly rollup data available.
                    </td>
                  </tr>
                )}
                {monthlyRollup.map((row) => (
                  <tr key={`${row.usage_month}-${row.request_count}-${row.total_cost}`}>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">{row.usage_month}</td>
                    <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">{formatNumber(row.request_count)}</td>
                    <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">{formatNumber(row.total_tokens)}</td>
                    <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                      {row.total_cost ? `R${Number(row.total_cost).toFixed(2)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
