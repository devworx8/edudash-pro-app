// Hook for Principal Excursions Screen
// Manages excursion CRUD operations

import { useState, useCallback, useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { assertSupabase } from '@/lib/supabase';
import { toast } from '@/components/ui/ToastProvider';
import type { Excursion, ExcursionFormData } from '@/components/principal/excursions/types';
import { isPreflightComplete } from '@/components/principal/excursions/types';

// Alert.alert doesn't work on web — use toast + native Alert combo
const showAlert = (title: string, message?: string) => {
  if (Platform.OS === 'web') {
    toast.show(message || title, { title, type: 'info' });
  } else {
    Alert.alert(title, message);
  }
};

interface UseExcursionsOptions {
  organizationId?: string;
  userId?: string;
}

interface UseExcursionsReturn {
  excursions: Excursion[];
  loading: boolean;
  refreshing: boolean;
  activeTab: 'upcoming' | 'past';
  setActiveTab: (tab: 'upcoming' | 'past') => void;
  handleRefresh: () => void;
  saveExcursion: (formData: ExcursionFormData, editingId?: string) => Promise<boolean>;
  deleteExcursion: (excursion: Excursion) => void;
  updateStatus: (excursion: Excursion, newStatus: string) => Promise<void>;
  shareWithParents: (excursion: Excursion) => Promise<void>;
  sharing: boolean;
  upcomingExcursions: Excursion[];
  pastExcursions: Excursion[];
}

export function useExcursions({ organizationId, userId }: UseExcursionsOptions): UseExcursionsReturn {
  const [excursions, setExcursions] = useState<Excursion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

  const fetchExcursions = useCallback(async () => {
    if (!organizationId) return;
    
    try {
      const supabase = assertSupabase();
      const { data, error } = await supabase
        .from('school_excursions')
        .select('*')
        .eq('preschool_id', organizationId)
        .order('excursion_date', { ascending: true });
      
      if (error) throw error;
      setExcursions(data || []);
    } catch (error: any) {
      console.error('Error fetching excursions:', error);
      showAlert('Error', 'Failed to load excursions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchExcursions();
  }, [fetchExcursions]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchExcursions();
  }, [fetchExcursions]);

  const saveExcursion = useCallback(async (formData: ExcursionFormData, editingId?: string): Promise<boolean> => {
    if (!organizationId || !formData.title.trim() || !formData.destination.trim()) {
      showAlert('Error', 'Please fill in the title and destination');
      return false;
    }

    try {
      const supabase = assertSupabase();
      const formatTime = (d: Date | null) => d ? `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` : null;
      const excursionData: Record<string, unknown> = {
        preschool_id: organizationId,
        created_by: userId,
        title: formData.title.trim(),
        description: formData.description.trim(),
        destination: formData.destination.trim(),
        excursion_date: formData.excursion_date.toISOString().split('T')[0],
        departure_time: formatTime(formData.departure_time),
        return_time: formatTime(formData.return_time),
        estimated_cost_per_child: parseFloat(formData.estimated_cost_per_child) || 0,
        learning_objectives: formData.learning_objectives.split(',').map(s => s.trim()).filter(Boolean),
        items_to_bring: formData.items_to_bring.split(',').map(s => s.trim()).filter(Boolean),
        consent_required: formData.consent_required,
        consent_deadline: formData.consent_deadline ? formData.consent_deadline.toISOString().split('T')[0] : null,
        age_groups: formData.age_groups.length > 0 ? formData.age_groups : null,
        status: 'draft' as const,
      };
      if (formData.preflight_checks) {
        excursionData.preflight_checks = formData.preflight_checks;
      }

      if (editingId) {
        const { error } = await supabase
          .from('school_excursions')
          .update(excursionData)
          .eq('id', editingId);
        
        if (error) throw error;
        showAlert('Success', 'Excursion updated successfully');
      } else {
        const { error } = await supabase
          .from('school_excursions')
          .insert(excursionData);
        
        if (error) throw error;
        showAlert('Success', 'Excursion created successfully');
      }

      fetchExcursions();
      return true;
    } catch (error: any) {
      console.error('Error saving excursion:', error);
      showAlert('Error', error.message || 'Failed to save excursion');
      return false;
    }
  }, [organizationId, userId, fetchExcursions]);

  const deleteExcursion = useCallback(async (excursion: Excursion) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Are you sure you want to delete "${excursion.title}"?`)
      : await new Promise<boolean>((resolve) => {
          Alert.alert('Delete Excursion', `Are you sure you want to delete "${excursion.title}"?`, [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
    if (!confirmed) return;
    try {
      const supabase = assertSupabase();
      const { error } = await supabase.from('school_excursions').delete().eq('id', excursion.id);
      if (error) throw error;
      showAlert('Success', 'Excursion deleted');
      fetchExcursions();
    } catch {
      showAlert('Error', 'Failed to delete excursion');
    }
  }, [fetchExcursions]);

  // Notify parents about an excursion via notifications-dispatcher
  const notifyParents = useCallback(async (excursion: Excursion, eventType: string) => {
    try {
      const supabase = assertSupabase();
      const dateStr = new Date(excursion.excursion_date).toLocaleDateString('en-ZA', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
      await supabase.functions.invoke('notifications-dispatcher', {
        body: {
          event_type: eventType,
          excursion_id: excursion.id,
          preschool_id: organizationId,
          target_audience: ['parents'],
          context: {
            excursion_title: excursion.title,
            excursion_date: dateStr,
            destination: excursion.destination,
            estimated_cost: excursion.estimated_cost_per_child,
            consent_required: excursion.consent_required,
            consent_deadline: excursion.consent_deadline,
          },
        },
      });
    } catch {
      // Non-blocking — don't fail the primary action if notification fails
      console.warn('Failed to send excursion notification');
    }
  }, [organizationId]);

  const updateStatus = useCallback(async (excursion: Excursion, newStatus: string) => {
    if (newStatus === 'approved' && !isPreflightComplete(excursion.preflight_checks)) {
      showAlert(
        'Preflight Required',
        'Complete all preflight checklist items before approving. Open the excursion and check each item.',
      );
      return;
    }
    try {
      const supabase = assertSupabase();
      const { error } = await supabase
        .from('school_excursions')
        .update({
          status: newStatus,
          ...(newStatus === 'approved' ? { approved_by: userId, approved_at: new Date().toISOString() } : {}),
        })
        .eq('id', excursion.id);

      if (error) throw error;

      // Auto-notify parents when excursion is approved
      if (newStatus === 'approved') {
        await notifyParents(excursion, 'school_excursion_approved');
        toast.success('Excursion approved! All parents have been notified.', 'Approved & Shared', 4000);
      }

      fetchExcursions();
    } catch (error: any) {
      toast.error('Failed to update status');
    }
  }, [userId, fetchExcursions, notifyParents]);

  // Manual share: re-send notification to all parents (e.g. reminder or re-share)
  const shareWithParents = useCallback(async (excursion: Excursion) => {
    setSharing(true);
    try {
      await notifyParents(excursion, 'school_excursion_shared');
      toast.success(`"${excursion.title}" shared with all parents.`, 'Shared Successfully', 4000);
    } catch {
      toast.error('Failed to share with parents. Please try again.');
    } finally {
      setSharing(false);
    }
  }, [notifyParents]);

  const today = new Date().toISOString().split('T')[0];
  const upcomingExcursions = excursions.filter(e => e.excursion_date >= today && e.status !== 'cancelled');
  const pastExcursions = excursions.filter(e => e.excursion_date < today || e.status === 'completed');

  return {
    excursions,
    loading,
    refreshing,
    activeTab,
    setActiveTab,
    handleRefresh,
    saveExcursion,
    deleteExcursion,
    updateStatus,
    shareWithParents,
    sharing,
    upcomingExcursions,
    pastExcursions,
  };
}
