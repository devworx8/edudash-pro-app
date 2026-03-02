// Hook for Principal Activities Screen
// Manages activity template CRUD operations

import { useState, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { assertSupabase } from '@/lib/supabase';
import type { ActivityTemplate, ActivityFormData } from '@/components/principal/activities/types';

interface UseActivitiesOptions {
  organizationId?: string;
  userId?: string;
}

interface UseActivitiesReturn {
  activities: ActivityTemplate[];
  loading: boolean;
  refreshing: boolean;
  activeTab: 'global' | 'school';
  selectedType: string | null;
  searchQuery: string;
  setActiveTab: (tab: 'global' | 'school') => void;
  setSelectedType: (type: string | null) => void;
  setSearchQuery: (query: string) => void;
  handleRefresh: () => void;
  saveActivity: (formData: ActivityFormData) => Promise<boolean>;
  addActivityToLesson: (activity: ActivityTemplate) => Promise<void>;
  filteredActivities: ActivityTemplate[];
}

export function useActivities({ organizationId, userId }: UseActivitiesOptions): UseActivitiesReturn {
  const [activities, setActivities] = useState<ActivityTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'global' | 'school'>('global');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchActivities = useCallback(async () => {
    try {
      const supabase = assertSupabase();
      
      let query = supabase
        .from('activity_templates')
        .select('*');
      
      if (activeTab === 'global') {
        query = query.is('preschool_id', null).eq('is_published', true);
      } else {
        query = query.eq('preschool_id', organizationId);
      }
      
      if (selectedType) {
        query = query.eq('activity_type', selectedType);
      }
      
      const { data, error } = await query.order('usage_count', { ascending: false });
      
      if (error) throw error;
      setActivities(data || []);
    } catch (error: any) {
      console.error('Error fetching activities:', error);
      Alert.alert('Error', 'Failed to load activities');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId, activeTab, selectedType]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchActivities();
  }, [fetchActivities]);

  const saveActivity = useCallback(async (formData: ActivityFormData): Promise<boolean> => {
    if (!formData.title.trim()) {
      Alert.alert('Validation Error', 'Please enter an activity title');
      return false;
    }
    
    try {
      const supabase = assertSupabase();
      
      const activityData = {
        preschool_id: organizationId,
        created_by: userId,
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        activity_type: formData.activity_type,
        age_groups: formData.age_groups,
        developmental_domains: formData.developmental_domains,
        learning_objectives: formData.learning_objectives,
        materials_needed: formData.materials_needed,
        duration_minutes: formData.duration_minutes,
        group_size: formData.group_size,
        activity_steps: formData.activity_steps,
        theme_tags: formData.theme_tags,
        is_published: formData.is_published,
      };
      
      const { error } = await supabase
        .from('activity_templates')
        .insert(activityData);
      
      if (error) throw error;
      
      Alert.alert('Success', 'Activity created successfully');
      setActiveTab('school');
      fetchActivities();
      return true;
    } catch (error: any) {
      console.error('Error saving activity:', error);
      Alert.alert('Error', error.message || 'Failed to save activity');
      return false;
    }
  }, [organizationId, userId, fetchActivities]);

  const addActivityToLesson = useCallback(async (activity: ActivityTemplate): Promise<void> => {
    try {
      const supabase = assertSupabase();
      await supabase
        .from('activity_templates')
        .update({ usage_count: (activity.usage_count || 0) + 1 })
        .eq('id', activity.id);
    } catch (e) {
      // Silent fail for usage tracking
    }
  }, []);

  // Filter activities by search query
  const filteredActivities = activities.filter(activity =>
    activity.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    activity.description?.toLowerCase()?.includes(searchQuery.toLowerCase())
  );

  return {
    activities,
    loading,
    refreshing,
    activeTab,
    selectedType,
    searchQuery,
    setActiveTab,
    setSelectedType,
    setSearchQuery,
    handleRefresh,
    saveActivity,
    addActivityToLesson,
    filteredActivities,
  };
}
