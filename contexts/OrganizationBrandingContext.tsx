/**
 * Organization Branding Context
 * Provides organization-level branding like wallpaper, greeting, colors
 * across all member dashboards and screens
 */
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

const TAG = 'Branding';

export interface DashboardSettings {
  wallpaper_url?: string;
  wallpaper_opacity?: number;
  custom_greeting?: string;
  primary_color?: string;
  logo_url?: string;
}

interface OrganizationBrandingContextType {
  settings: DashboardSettings | null;
  isLoading: boolean;
  error: string | null;
  organizationId: string | null;
  organizationName: string | null;
  refetch: () => Promise<void>;
}

const OrganizationBrandingContext = createContext<OrganizationBrandingContextType | null>(null);

export const useOrganizationBranding = () => {
  const context = useContext(OrganizationBrandingContext);
  if (!context) {
    // Return safe defaults if not in provider
    return {
      settings: null,
      isLoading: false,
      error: null,
      organizationId: null,
      organizationName: null,
      refetch: async () => {},
    };
  }
  return context;
};

interface OrganizationBrandingProviderProps {
  children: ReactNode;
}

export const OrganizationBrandingProvider: React.FC<OrganizationBrandingProviderProps> = ({ children }) => {
  const [settings, setSettings] = useState<DashboardSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState<string | null>(null);

  const fetchBranding = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const supabase = assertSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      
      logger.debug(TAG, 'User:', user?.id);
      
      if (!user) {
        logger.debug(TAG, 'No user found, skipping fetch');
        setIsLoading(false);
        return;
      }

      // First, check organization_members (for SOA/organization members)
      const { data: member, error: memberError } = await supabase
        .from('organization_members')
        .select('organization_id, organizations(id, name, dashboard_settings)')
        .eq('user_id', user.id)
        .maybeSingle();

      logger.debug(TAG, 'Member query result:', { member, memberError });

      if (memberError) {
        logger.debug(TAG, 'Error querying membership:', memberError.message);
        logger.info('[Branding] Error querying membership:', memberError.message);
      }
      
      // If user is in an organization with dashboard_settings, use that
      if (member?.organization_id && member.organizations) {
        const org = member.organizations as any;
        logger.debug(TAG, 'Organization found:', org.id, org.name);
        logger.debug(TAG, 'Dashboard settings:', org.dashboard_settings);
        setOrganizationId(org.id);
        setOrganizationName(org.name);
        
        if (org.dashboard_settings) {
          setSettings(org.dashboard_settings as DashboardSettings);
          logger.debug(TAG, 'Settings applied from organization:', org.dashboard_settings);
          logger.info('[Branding] Loaded organization branding:', org.dashboard_settings);
          setIsLoading(false);
          return;
        }
      }

      // Fallback: Check user's preschool for branding (for preschool staff/parents)
      // Use auth_user_id to lookup profile (NOT profiles.id!)
      let { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('preschool_id')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (!profile && !profileError) {
        const { data: profileById, error: profileByIdError } = await supabase
          .from('profiles')
          .select('preschool_id')
          .eq('id', user.id)
          .maybeSingle();
        if (!profileByIdError && profileById) {
          profile = profileById;
        }
      }

      if (profile?.preschool_id) {
        logger.debug(TAG, 'User has preschool_id:', profile.preschool_id);
        
        // Check if an organization has this preschool linked to it
        // Note: The FK is organizations.preschool_id → preschools.id (reverse direction)
        const { data: linkedOrg, error: linkedOrgError } = await supabase
          .from('organizations')
          .select('id, name, dashboard_settings')
          .eq('preschool_id', profile.preschool_id)
          .maybeSingle();

        if (linkedOrgError) {
          logger.debug(TAG, 'Error querying linked organization:', linkedOrgError.message);
        }

        if (linkedOrg?.dashboard_settings) {
          logger.debug(TAG, 'Using preschool organization branding:', linkedOrg.dashboard_settings);
          setOrganizationId(linkedOrg.id);
          setOrganizationName(linkedOrg.name);
          setSettings(linkedOrg.dashboard_settings as DashboardSettings);
          logger.info('[Branding] Loaded preschool organization branding');
          setIsLoading(false);
          return;
        }
      }

      logger.debug(TAG, 'No branding found for user');
    } catch (err: any) {
      logger.error('[Branding] Error fetching branding:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBranding();

    // Subscribe to organization changes
    const supabase = assertSupabase();
    const channel = supabase
      .channel('org-branding-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'organizations',
          filter: `id=eq.${organizationId}`,
        },
        (payload) => {
          if (payload.new?.id === organizationId && payload.new?.dashboard_settings) {
            logger.info('[Branding] Organization branding updated via realtime');
            setSettings(payload.new.dashboard_settings as DashboardSettings);
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [fetchBranding, organizationId]);

  return (
    <OrganizationBrandingContext.Provider
      value={{
        settings,
        isLoading,
        error,
        organizationId,
        organizationName,
        refetch: fetchBranding,
      }}
    >
      {children}
    </OrganizationBrandingContext.Provider>
  );
};
