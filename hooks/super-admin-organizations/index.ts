import { useCallback, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';

import { useAuth } from '@/contexts/AuthContext';
import { isPlatformStaff } from '@/lib/roleUtils';
import { logger } from '@/lib/logger';
import type {
  Organization,
  OrganizationStats,
  OrganizationType,
  OrganizationStatus,
} from '@/lib/screen-styles/super-admin-organizations.styles';

import { fetchOrganizationsData } from './fetchOrganizations';
import { executeOrgAction } from './orgActions';
import type { OrgActionDeps } from './orgActions';
import {
  openTierPicker as openTierPickerFn,
  openStatusPicker as openStatusPickerFn,
} from './subscriptionHandlers';
import type { SubscriptionDeps } from './subscriptionHandlers';
import type {
  UseSuperAdminOrganizationsParams,
  UseSuperAdminOrganizationsReturn,
} from './types';

export type { UseSuperAdminOrganizationsParams, UseSuperAdminOrganizationsReturn };

export function useSuperAdminOrganizations({
  showAlert,
}: UseSuperAdminOrganizationsParams): UseSuperAdminOrganizationsReturn {
  const { profile } = useAuth();

  // ── State ──────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [filteredOrgs, setFilteredOrgs] = useState<Organization[]>([]);
  const [stats, setStats] = useState<OrganizationStats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<OrganizationType>('all');
  const [selectedStatus, setSelectedStatus] = useState<OrganizationStatus>('all');
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showActionsModal, setShowActionsModal] = useState(false);
  const [updatingSubscription, setUpdatingSubscription] = useState(false);

  // ── Access check ───────────────────────────────────────────
  useEffect(() => {
    if (!isPlatformStaff(profile?.role)) {
      showAlert({ title: 'Access Denied', message: 'Super admin access required' });
      router.back();
    }
  }, [profile, showAlert]);

  // ── Fetch ──────────────────────────────────────────────────
  const loadOrganizations = useCallback(async () => {
    try {
      setLoading(true);
      const result = await fetchOrganizationsData();
      setOrganizations(result.organizations);
      setFilteredOrgs(result.organizations);
      setStats(result.stats);
    } catch (error) {
      logger.error('Failed to fetch organizations:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadOrganizations(); }, [loadOrganizations]);

  // ── Filtering ──────────────────────────────────────────────
  useEffect(() => {
    let filtered = [...organizations];
    if (selectedType !== 'all') filtered = filtered.filter(o => o.type === selectedType);
    if (selectedStatus !== 'all') filtered = filtered.filter(o => o.status === selectedStatus);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(o =>
        o.name.toLowerCase().includes(q) || o.contact_email.toLowerCase().includes(q) ||
        o.city?.toLowerCase()?.includes(q) || o.province?.toLowerCase()?.includes(q)
      );
    }
    setFilteredOrgs(filtered);
  }, [organizations, selectedType, selectedStatus, searchQuery]);

  // ── Refresh ────────────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadOrganizations();
    setRefreshing(false);
  }, [loadOrganizations]);

  // ── Dependency objects for extracted handlers ──────────────
  const actionDeps: OrgActionDeps = useMemo(() => ({
    showAlert, loadOrganizations, setShowActionsModal, setShowDetailModal, setSelectedOrg,
  }), [showAlert, loadOrganizations]);

  const subDeps: SubscriptionDeps = useMemo(() => ({
    showAlert, loadOrganizations, setUpdatingSubscription,
  }), [showAlert, loadOrganizations]);

  // ── Handlers ───────────────────────────────────────────────
  const handleOrgPress = useCallback((org: Organization) => {
    setSelectedOrg(org);
    setShowDetailModal(true);
  }, []);

  const handleOrgAction = useCallback(
    (action: string) => {
      if (!selectedOrg) return;
      executeOrgAction(action, selectedOrg, actionDeps);
    },
    [selectedOrg, actionDeps]
  );

  const openTierPicker = useCallback(
    (org: Organization) => openTierPickerFn(org, subDeps),
    [subDeps]
  );

  const openStatusPicker = useCallback(
    (org: Organization) => openStatusPickerFn(org, subDeps),
    [subDeps]
  );

  return {
    organizations, filteredOrgs, stats,
    loading, refreshing, updatingSubscription,
    searchQuery, setSearchQuery,
    selectedType, setSelectedType,
    selectedStatus, setSelectedStatus,
    selectedOrg, setSelectedOrg,
    showDetailModal, setShowDetailModal,
    showActionsModal, setShowActionsModal,
    onRefresh, handleOrgPress, handleOrgAction,
    openTierPicker, openStatusPicker,
  };
}
