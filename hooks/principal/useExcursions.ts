// Hook for Principal Excursions Screen
// Manages excursion CRUD operations

import { useState, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { assertSupabase } from '@/lib/supabase';
import type { Excursion, ExcursionFormData } from '@/components/principal/excursions/types';
import { isPreflightComplete } from '@/components/principal/excursions/types';

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
  upcomingExcursions: Excursion[];
  pastExcursions: Excursion[];
}

export function useExcursions({ organizationId, userId }: UseExcursionsOptions): UseExcursionsReturn {
  const [excursions, setExcursions] = useState<Excursion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
      Alert.alert('Error', 'Failed to load excursions');
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
      Alert.alert('Error', 'Please fill in the title and destination');
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
        Alert.alert('Success', 'Excursion updated successfully');
      } else {
        const { error } = await supabase
          .from('school_excursions')
          .insert(excursionData);
        
        if (error) throw error;
        Alert.alert('Success', 'Excursion created successfully');
      }

      fetchExcursions();
      return true;
    } catch (error: any) {
      console.error('Error saving excursion:', error);
      Alert.alert('Error', error.message || 'Failed to save excursion');
      return false;
    }
  }, [organizationId, userId, fetchExcursions]);

  const deleteExcursion = useCallback((excursion: Excursion) => {
    Alert.alert(
      'Delete Excursion',
      `Are you sure you want to delete "${excursion.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const supabase = assertSupabase();
              const { error } = await supabase
                .from('school_excursions')
                .delete()
                .eq('id', excursion.id);
              
              if (error) throw error;
              Alert.alert('Success', 'Excursion deleted');
              fetchExcursions();
            } catch (error: any) {
              Alert.alert('Error', 'Failed to delete excursion');
            }
          },
        },
      ]
    );
  }, [fetchExcursions]);

  const updateStatus = useCallback(async (excursion: Excursion, newStatus: string) => {
    if (newStatus === 'approved' && !isPreflightComplete(excursion.preflight_checks)) {
      Alert.alert(
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
      fetchExcursions();
    } catch (error: any) {
      Alert.alert('Error', 'Failed to update status');
    }
  }, [userId, fetchExcursions]);

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
    upcomingExcursions,
    pastExcursions,
  };
}
