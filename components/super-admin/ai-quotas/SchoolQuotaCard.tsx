/**
 * School quota card component
 * @module components/super-admin/ai-quotas/SchoolQuotaCard
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { AIQuotaSettings } from './types';
import { getUsagePercentage, getUsageColor, getPlanColor, formatNumber, formatCurrency } from './utils';
import { percentWidth } from '@/lib/progress/clampPercent';

interface SchoolQuotaCardProps {
  school: AIQuotaSettings;
  onPress: (school: AIQuotaSettings) => void;
}

export function SchoolQuotaCard({ school, onPress }: SchoolQuotaCardProps) {
  const usagePercentage = getUsagePercentage(school.current_usage, school.monthly_limit);
  const isOverLimit = school.current_usage > school.monthly_limit;

  return (
    <TouchableOpacity
      style={[
        styles.schoolCard,
        school.is_suspended && styles.schoolCardSuspended,
        isOverLimit && styles.schoolCardOverLimit
      ]}
      onPress={() => onPress(school)}
    >
      <View style={styles.schoolHeader}>
        <View style={styles.schoolInfo}>
          <Text style={styles.schoolName}>{school.school_name}</Text>
          <View style={styles.schoolMeta}>
            <View style={[
              styles.planBadge, 
              { 
                backgroundColor: getPlanColor(school.plan_type) + '20', 
                borderColor: getPlanColor(school.plan_type) 
              }
            ]}>
              <Text style={[styles.planBadgeText, { color: getPlanColor(school.plan_type) }]}>
                {school.plan_type.toUpperCase()}
              </Text>
            </View>
            {school.is_suspended && (
              <View style={styles.suspendedBadge}>
                <Text style={styles.suspendedBadgeText}>SUSPENDED</Text>
              </View>
            )}
          </View>
        </View>
        
        <View style={styles.usageInfo}>
          <Text style={[styles.usageText, { color: getUsageColor(usagePercentage) }]}>
            {formatNumber(school.current_usage)} / {formatNumber(school.monthly_limit)}
          </Text>
          <Text style={styles.usagePercentage}>
            {usagePercentage.toFixed(1)}%
          </Text>
        </View>
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View 
            style={[
              styles.progressFill,
              { 
                width: percentWidth(Math.min(usagePercentage, 100)),
                backgroundColor: getUsageColor(usagePercentage)
              }
            ]} 
          />
          {isOverLimit && (
            <View 
              style={[
                styles.overageFill,
                { 
                  width: percentWidth(Math.min(((school.current_usage - school.monthly_limit) / school.monthly_limit) * 100, 100))
                }
              ]} 
            />
          )}
        </View>
      </View>

      <View style={styles.schoolFooter}>
        <Text style={styles.resetDate}>
          Resets: {new Date(school.reset_date).toLocaleDateString()}
        </Text>
        {isOverLimit && school.overage_allowed && (
          <Text style={styles.overageCost}>
            Overage: {formatCurrency((school.current_usage - school.monthly_limit) * school.cost_per_overage)}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  schoolCard: {
    backgroundColor: '#1f2937',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  schoolCardSuspended: {
    borderColor: '#ef4444',
    backgroundColor: '#7f1d1d10',
  },
  schoolCardOverLimit: {
    borderColor: '#f59e0b',
    backgroundColor: '#92400e10',
  },
  schoolHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  schoolInfo: {
    flex: 1,
  },
  schoolName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  schoolMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  planBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  planBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  suspendedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#ef444420',
  },
  suspendedBadgeText: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: '600',
  },
  usageInfo: {
    alignItems: 'flex-end',
  },
  usageText: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  usagePercentage: {
    color: '#9ca3af',
    fontSize: 12,
  },
  progressContainer: {
    marginBottom: 12,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#374151',
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    position: 'absolute',
    left: 0,
    top: 0,
  },
  overageFill: {
    height: '100%',
    backgroundColor: '#dc2626',
    position: 'absolute',
    left: '100%',
    top: 0,
  },
  schoolFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resetDate: {
    color: '#9ca3af',
    fontSize: 12,
  },
  overageCost: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '500',
  },
});
