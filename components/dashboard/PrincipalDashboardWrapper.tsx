import React, { memo, useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
// Using refactored modular dashboard (317 lines vs 1,518 lines original)
import PrincipalDashboardV2 from './PrincipalDashboardV2';
import { K12AdminDashboard } from './K12AdminDashboard';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { assertSupabase } from '@/lib/supabase';
import {
  normalizeResolvedSchoolType,
  resolveSchoolTypeFromProfile,
  type ResolvedSchoolType,
} from '@/lib/schoolTypeResolver';

import EduDashSpinner from '@/components/ui/EduDashSpinner';

interface PrincipalDashboardWrapperProps {}

/**
 * Principal Dashboard Wrapper
 * 
 * Routes to appropriate dashboard based on organization type:
 * - K-12 Schools → K12AdminDashboard (grade-based, aftercare focused)
 * - Preschools → NewEnhancedPrincipalDashboard (early childhood focused)
 * 
 * Uses refactored modular dashboard with extracted components:
 * - PrincipalWelcomeSection, PrincipalMetricsSection
 * - PrincipalQuickActions, PrincipalRecentActivity
 * - Shared: MetricCard, QuickActionCard, CollapsibleSection, SearchBar
 */
const PrincipalDashboardWrapperComponent: React.FC<PrincipalDashboardWrapperProps> = () => {
  const { profile } = useAuth();
  const { theme } = useTheme();
  const [resolvedSchoolType, setResolvedSchoolType] = useState<ResolvedSchoolType>(
    resolveSchoolTypeFromProfile(profile)
  );
  const [loading, setLoading] = useState(true);
  
  const organizationId = profile?.organization_id || profile?.preschool_id;

  // Resolve school type from authoritative org metadata first, then profile fallback.
  useEffect(() => {
    let cancelled = false;

    const checkOrgType = async () => {
      const fallbackType = resolveSchoolTypeFromProfile(profile);
      if (!organizationId) {
        if (!cancelled) {
          setResolvedSchoolType(fallbackType);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setLoading(true);
      }

      try {
        const supabase = assertSupabase();

        const [{ data: orgData, error: orgError }, { data: preschoolData, error: preschoolError }] =
          await Promise.all([
            supabase
              .from('organizations')
              .select('type')
              .eq('id', organizationId)
              .maybeSingle(),
            supabase
              .from('preschools')
              .select('school_type')
              .eq('id', organizationId)
              .maybeSingle(),
          ]);

        const normalizedOrgType = normalizeResolvedSchoolType(orgData?.type);
        const normalizedPreschoolType = normalizeResolvedSchoolType((preschoolData as any)?.school_type);
        const resolvedType = normalizedOrgType || normalizedPreschoolType || fallbackType;

        if (!cancelled) {
          setResolvedSchoolType(resolvedType);
        }

        if (orgError && orgError.code !== 'PGRST116') {
          // Organization type lookup warning — non-critical
        }
        if (preschoolError && preschoolError.code !== 'PGRST116') {
          // Preschool type lookup warning — non-critical
        }
      } catch (e) {
        if (!cancelled) {
          // Org type check failed — use profile fallback
          setResolvedSchoolType(fallbackType);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
    checkOrgType();

    return () => {
      cancelled = true;
    };
  }, [organizationId, profile]);
  
  // Show loading while checking org type
  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <EduDashSpinner size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading dashboard...
        </Text>
      </View>
    );
  }
  
  // Route to K-12 dashboard for K-12 schools
  if (resolvedSchoolType === 'k12_school') {
    return <K12AdminDashboard />;
  }
  
  // Default: Preschool dashboard
  return (
    <PrincipalDashboardV2 />
  );
};

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
  },
});

// Memoize wrapper to prevent unnecessary re-renders
export const PrincipalDashboardWrapper = memo(
  PrincipalDashboardWrapperComponent
);
