/**
 * Hook for fetching organization regions with member counts
 * Used in registration and join flows
 */
import { useState, useEffect, useCallback } from 'react';
import { assertSupabase } from '@/lib/supabase';

export interface OrganizationRegion {
  id: string;
  name: string;
  code: string;
  province_code: string;
  member_count: number;
  organization_id: string;
  is_active: boolean;
}

interface UseOrganizationRegionsOptions {
  organizationId?: string;
  /** If true, fetch EduPro regions by default */
  soilOfAfrica?: boolean;
}

interface UseOrganizationRegionsReturn {
  regions: OrganizationRegion[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Default Soil Of Africa organization ID
const SOIL_OF_AFRICA_ORG_ID = '63b6139a-e21f-447c-b322-376fb0828992';

export function useOrganizationRegions({
  organizationId,
  soilOfAfrica = true,
}: UseOrganizationRegionsOptions = {}): UseOrganizationRegionsReturn {
  const [regions, setRegions] = useState<OrganizationRegion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const targetOrgId = organizationId || (soilOfAfrica ? SOIL_OF_AFRICA_ORG_ID : null);

  const fetchRegions = useCallback(async () => {
    if (!targetOrgId) {
      setRegions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const supabase = assertSupabase();

      // Fetch regions
      const { data: regionsData, error: regionsError } = await supabase
        .from('organization_regions')
        .select('id, name, code, province_code, organization_id, is_active')
        .eq('organization_id', targetOrgId)
        .eq('is_active', true)
        .order('name');

      if (regionsError) throw regionsError;

      // Fetch member counts for each region
      const regionsWithCounts = await Promise.all(
        (regionsData || []).map(async (region) => {
          const { count } = await supabase
            .from('organization_members')
            .select('id', { count: 'exact', head: true })
            .eq('region_id', region.id);

          return {
            ...region,
            member_count: count || 0,
          };
        })
      );

      setRegions(regionsWithCounts);
    } catch (err: any) {
      console.error('[useOrganizationRegions] Error:', err);
      setError(err.message || 'Failed to fetch regions');
    } finally {
      setLoading(false);
    }
  }, [targetOrgId]);

  useEffect(() => {
    fetchRegions();
  }, [fetchRegions]);

  return {
    regions,
    loading,
    error,
    refetch: fetchRegions,
  };
}
