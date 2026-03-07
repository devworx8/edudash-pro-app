/**
 * ParentInsightsSection (Web)
 *
 * Renders AI-powered proactive insights and predictive alerts on the parent dashboard.
 * Fully styled with Tailwind — no external dependencies.
 */

'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileText,
  Lightbulb,
  Sparkles,
  Trophy,
  TrendingUp,
} from 'lucide-react';
import type { ProactiveInsight, PredictiveAlert } from '@/lib/hooks/parent/useParentInsights';

interface ParentInsightsSectionProps {
  insights: ProactiveInsight[];
  alerts: PredictiveAlert[];
  loading: boolean;
  error: string | null;
  onActionPress?: (actionTitle: string) => void;
}

function InsightCard({
  insight,
  onActionPress,
}: {
  insight: ProactiveInsight;
  onActionPress?: (actionTitle: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const iconMap = {
    celebration: Trophy,
    concern: AlertTriangle,
    prediction: TrendingUp,
    suggestion: Lightbulb,
    strength: Sparkles,
  };
  const Icon = iconMap[insight.type] || Sparkles;

  const borderColor = {
    celebration: 'border-l-green-400',
    concern: 'border-l-red-400',
    prediction: 'border-l-amber-400',
    suggestion: 'border-l-cyan-400',
    strength: 'border-l-blue-400',
  }[insight.type] || 'border-l-gray-400';

  const iconColor = {
    high: 'text-red-400',
    medium: 'text-amber-400',
    low: 'text-cyan-400',
  }[insight.priority] || 'text-gray-400';

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl border-l-4 ${borderColor} shadow-sm overflow-hidden`}>
      <button
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{insight.title}</h4>
          <p className={`text-sm text-gray-500 dark:text-gray-400 ${expanded ? '' : 'line-clamp-2'}`}>
            {insight.description}
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        )}
      </button>

      {expanded && insight.action_items && insight.action_items.length > 0 && (
        <div className="px-4 pb-4 space-y-2">
          <p className="text-xs font-semibold text-cyan-500 uppercase tracking-wide">What you can do:</p>
          {insight.action_items.map((action, i) => (
            <button
              key={i}
              className="w-full flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors text-left"
              onClick={() => onActionPress?.(action.title)}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{action.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{action.description}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {expanded && insight.caps_topics && insight.caps_topics.length > 0 && (
        <div className="px-4 pb-4 flex flex-wrap gap-2">
          {insight.caps_topics.map((topic, i) => (
            <span key={i} className="px-3 py-1 text-xs font-medium bg-cyan-500/10 text-cyan-500 rounded-full">
              {topic}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AlertCard({ alert }: { alert: PredictiveAlert }) {
  const severityStyles = {
    urgent: 'bg-red-50 dark:bg-red-900/20 border-l-red-500 text-red-700 dark:text-red-300',
    warning: 'bg-amber-50 dark:bg-amber-900/20 border-l-amber-500 text-amber-700 dark:text-amber-300',
    info: 'bg-blue-50 dark:bg-blue-900/20 border-l-blue-500 text-blue-700 dark:text-blue-300',
  };

  const iconMap: Record<string, typeof BookOpen> = {
    assessment_coming: BookOpen,
    homework_due: FileText,
  };
  const Icon = iconMap[alert.alert_type] || AlertTriangle;

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border-l-3 ${severityStyles[alert.severity]}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{alert.title}</p>
        <p className="text-xs opacity-80">{alert.message}</p>
      </div>
    </div>
  );
}

export function ParentInsightsSection({
  insights,
  alerts,
  loading,
  error,
  onActionPress,
}: ParentInsightsSectionProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-8">
        <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-500 dark:text-gray-400">Analyzing progress...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center gap-2 py-6">
        <AlertTriangle className="w-4 h-4 text-red-400" />
        <span className="text-sm text-gray-500 dark:text-gray-400">Unable to load insights</span>
      </div>
    );
  }

  if (insights.length === 0 && alerts.length === 0) {
    return (
      <div className="text-center py-8">
        <Sparkles className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No insights yet</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Insights will appear as your child&apos;s learning data accumulates.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => (
        <AlertCard key={alert.id} alert={alert} />
      ))}
      {insights.map((insight) => (
        <InsightCard key={insight.id} insight={insight} onActionPress={onActionPress} />
      ))}
    </div>
  );
}
