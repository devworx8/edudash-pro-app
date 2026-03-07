'use client';

import { useEffect, useState } from 'react';
import { clampPercent } from '@/lib/ui/clampPercent';

export type FeatureQuotaBarProps = {
  feature: string;
  used: number;
  limit: number;
  remaining: number;
  periodLabel: string;
  refreshKey?: number | string;
  onRefresh?: () => Promise<void> | void;
  className?: string;
};

function getStatusColor(percent: number): string {
  if (percent >= 100) return '#ef4444';
  if (percent >= 80) return '#f59e0b';
  return '#10b981';
}

export function FeatureQuotaBar({
  feature,
  used,
  limit,
  remaining,
  periodLabel,
  refreshKey,
  onRefresh,
  className,
}: FeatureQuotaBarProps) {
  const [refreshing, setRefreshing] = useState(false);
  const safeUsed = Number.isFinite(used) ? Math.max(0, used) : 0;
  const safeLimit = Number.isFinite(limit) ? Number(limit) : 0;
  const isUnlimited = safeLimit < 0;
  const safeRemaining = Number.isFinite(remaining) ? Number(remaining) : 0;
  const percent = !isUnlimited && safeLimit > 0 ? clampPercent((safeUsed / safeLimit) * 100) : 0;
  const color = getStatusColor(percent);
  const usedLabel = isUnlimited ? `${safeUsed}/∞ used` : `${safeUsed}/${Math.max(0, safeLimit)} used`;
  const remainingLabel = isUnlimited
    ? `Unlimited this ${periodLabel}`
    : `${Math.max(0, safeRemaining)} remaining this ${periodLabel}`;

  useEffect(() => {
    if (!onRefresh) return;
    let cancelled = false;
    const run = async () => {
      try {
        setRefreshing(true);
        await onRefresh();
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [onRefresh, refreshKey]);

  return (
    <div className={className} style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'capitalize' }}>{feature}</span>
        <span style={{ fontSize: 12, color }}>{Math.round(percent)}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        style={{
          width: '100%',
          height: 8,
          borderRadius: 999,
          overflow: 'hidden',
          background: 'rgba(148, 163, 184, 0.25)',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${percent}%`,
            borderRadius: 999,
            background: color,
            transition: 'width 200ms ease',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <span style={{ color: 'var(--text-muted)' }}>{usedLabel}</span>
        <span style={{ color }}>
          {remainingLabel}
          {refreshing ? ' • refreshing…' : ''}
        </span>
      </div>
    </div>
  );
}

export default FeatureQuotaBar;
