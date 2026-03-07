'use client';

import { TrendingUp, Calendar, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface StatsWidgetProps {
  className?: string;
}

export function StatsWidget({ className = '' }: StatsWidgetProps) {
  const { t } = useTranslation();

  const stats = [
    {
      label: t('dashboard.parent.stats.overview.week', { defaultValue: 'This Week' }),
      value: '95%',
      change: '+5%',
      trend: 'up',
      icon: TrendingUp,
    },
    {
      label: t('dashboard.parent.stats.overview.month', { defaultValue: 'This Month' }),
      value: '92%',
      change: '+3%',
      trend: 'up',
      icon: Calendar,
    },
    {
      label: t('dashboard.parent.stats.overview.homework_rate', { defaultValue: 'Homework Rate' }),
      value: '88%',
      change: '-2%',
      trend: 'down',
      icon: CheckCircle,
    },
  ];

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Activity Overview */}
      <div className="bg-gradient-to-br from-slate-800/70 to-slate-800/50 backdrop-blur-sm rounded-2xl p-6 lg:p-7 border border-slate-700/60 shadow-xl">
        <h3 className="text-base lg:text-lg font-bold text-white mb-5 flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/20 rounded-xl">
            <TrendingUp className="w-5 h-5 text-blue-400" />
          </div>
          {t('dashboard.parent.stats.overview.title', { defaultValue: 'Activity Overview' })}
        </h3>
        <div className="space-y-4">
          {stats.map((stat, idx) => (
            <div key={idx} className="flex items-center justify-between p-4 bg-slate-700/30 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-slate-600/40 rounded-lg">
                  <stat.icon className="w-4 h-4 text-slate-300" />
                </div>
                <span className="text-sm font-medium text-slate-300">{stat.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-white">{stat.value}</span>
                <span
                  className={`text-xs font-bold px-2.5 py-1.5 rounded-lg ${
                    stat.trend === 'up' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {stat.change}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Stats Cards */}
      <div className="space-y-3">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 shadow-lg border border-blue-500/30">
          <div className="text-sm text-blue-200 mb-2 font-semibold">
            {t('dashboard.parent.stats.cards.total_children', { defaultValue: 'Total Children' })}
          </div>
          <div className="text-3xl font-bold text-white">0</div>
        </div>
        <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-2xl p-6 shadow-lg border border-green-500/30">
          <div className="text-sm text-green-200 mb-2 font-semibold">
            {t('dashboard.parent.stats.cards.active_classes', { defaultValue: 'Active Classes' })}
          </div>
          <div className="text-3xl font-bold text-white">0</div>
        </div>
        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl p-6 shadow-lg border border-purple-500/30">
          <div className="text-sm text-purple-200 mb-2 font-semibold">
            {t('dashboard.parent.stats.cards.upcoming_events', { defaultValue: 'Upcoming Events' })}
          </div>
          <div className="text-3xl font-bold text-white">0</div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-gradient-to-br from-slate-800/70 to-slate-800/50 backdrop-blur-sm rounded-2xl p-6 lg:p-7 border border-slate-700/60 shadow-xl">
        <h3 className="text-base lg:text-lg font-bold text-white mb-4">
          {t('dashboard.parent.stats.recent.title', { defaultValue: 'Recent Activity' })}
        </h3>
        <div className="space-y-3">
          <div className="text-sm text-slate-400 text-center py-8 bg-slate-700/20 rounded-xl">
            {t('dashboard.parent.stats.recent.empty', { defaultValue: 'No recent activity' })}
          </div>
        </div>
      </div>
    </div>
  );
}
