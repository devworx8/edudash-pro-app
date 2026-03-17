import { useCallback, useEffect, useState } from 'react';
import { assertSupabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { useAuth } from '@/contexts/AuthContext';
import { isPlatformStaff } from '@/lib/roleUtils';
import { logger } from '@/lib/logger';
import type { ModerationItem, ModerationFilters } from '@/lib/screen-styles/super-admin-moderation.styles';
import type { ShowAlertFn, UseSuperAdminModerationReturn } from './types';
import { SEVERITY_ORDER } from './types';
import { fetchModerationItems as fetchItems } from './fetchModerationItems';

export type { UseSuperAdminModerationReturn } from './types';

export function useSuperAdminModeration(showAlert: ShowAlertFn): UseSuperAdminModerationReturn {
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [moderationItems, setModerationItems] = useState<ModerationItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<ModerationItem[]>([]);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ModerationItem | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  const [filters, setFilters] = useState<ModerationFilters>({
    type: 'all',
    status: 'pending',
    severity: 'all',
    school: '',
  });

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const loadItems = useCallback(async () => {
    if (!isPlatformStaff(profile?.role)) {
      showAlert({ title: 'Access Denied', message: 'Super admin privileges required', buttons: [{ text: 'OK' }] });
      return;
    }
    try {
      setLoading(true);
      const items = await fetchItems({ status: filters.status, severity: filters.severity, type: filters.type });
      setModerationItems(items);
    } catch (error) {
      logger.error('Failed to fetch moderation items:', error);
      showAlert({ title: 'Error', message: 'Failed to load moderation items', buttons: [{ text: 'OK' }] });
      setModerationItems([]);
    } finally {
      setLoading(false);
    }
  }, [profile?.role, filters.status, filters.severity, filters.type, showAlert]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // ── Filtering & sorting ────────────────────────────────────────────────────

  useEffect(() => {
    let filtered = moderationItems;
    if (filters.type !== 'all') filtered = filtered.filter(i => i.type === filters.type);
    if (filters.status !== 'all') filtered = filtered.filter(i => i.status === filters.status);
    if (filters.severity !== 'all') filtered = filtered.filter(i => i.severity === filters.severity);
    if (filters.school) {
      filtered = filtered.filter(i => i.school_name.toLowerCase().includes(filters.school.toLowerCase()));
    }
    filtered.sort((a, b) => {
      const diff = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
      return diff !== 0 ? diff : new Date(b.flagged_at).getTime() - new Date(a.flagged_at).getTime();
    });
    setFilteredItems(filtered);
  }, [moderationItems, filters]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadItems();
    setRefreshing(false);
  }, [loadItems]);

  const openDetail = useCallback((item: ModerationItem) => {
    setSelectedItem(item);
    setReviewNotes(item.review_notes || '');
    setShowDetailModal(true);
  }, []);

  const closeDetail = useCallback(() => {
    setShowDetailModal(false);
    setSelectedItem(null);
    setReviewNotes('');
  }, []);

  const moderateItem = useCallback(async (item: ModerationItem, action: 'approve' | 'reject' | 'flag') => {
    if (!reviewNotes && action === 'reject') {
      showAlert({ title: 'Review Notes Required', message: 'Please provide review notes for rejected content', buttons: [{ text: 'OK' }] });
      return;
    }
    try {
      setProcessing(true);
      const { data: result, error } = await assertSupabase()
        .rpc('moderate_content', { p_queue_item_id: item.id, p_action: action, p_notes: reviewNotes || `Content ${action}ed by super admin` });
      if (error) { logger.error('Moderation RPC error:', error); throw new Error('Failed to moderate content'); }
      if (result?.error) throw new Error(result.error);

      setModerationItems(prev => prev.map(i =>
        i.id === item.id
          ? { ...item, status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'flagged', reviewed_by: profile?.id, reviewed_at: new Date().toISOString(), review_notes: reviewNotes || `Content ${action}ed by super admin` }
          : i,
      ));
      track('superadmin_content_moderated', { content_id: item.id, content_type: item.type, action, severity: item.severity, school_id: item.school_id, author_id: item.author_id });
      showAlert({ title: 'Success', message: `Content ${action}ed successfully. ${action === 'reject' ? 'Author has been notified.' : ''}`, buttons: [{ text: 'OK' }] });
      closeDetail();
      await loadItems();
    } catch (error) {
      logger.error('Failed to moderate content:', error);
      showAlert({ title: 'Error', message: 'Failed to moderate content', buttons: [{ text: 'OK' }] });
    } finally {
      setProcessing(false);
    }
  }, [reviewNotes, profile?.id, showAlert, closeDetail, loadItems]);

  return {
    profile, loading, refreshing, filteredItems, filters, setFilters,
    showDetailModal, setShowDetailModal, selectedItem, setSelectedItem,
    reviewNotes, setReviewNotes, processing, onRefresh, openDetail, closeDetail, moderateItem,
  };
}
