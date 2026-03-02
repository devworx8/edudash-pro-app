/**
 * Aftercare Activities Screen
 * 
 * Browse and manage educational activities for aftercare students.
 * Activities are age-appropriate (3-12 years) and include games, videos, quizzes.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, TextInput, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { logger } from '@/lib/logger';
import { LinearGradient } from 'expo-linear-gradient';
import { createStyles, Activity, activityTypeConfig, ageGroups, subjects } from '@/lib/screen-styles/aftercare-activities.styles';

import EduDashSpinner from '@/components/ui/EduDashSpinner';

export default function AftercareActivitiesScreen() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { showAlert, alertProps } = useAlertModal();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  
  const organizationId = profile?.organization_id || profile?.preschool_id;
  const isTeacher = profile?.role === 'teacher' || profile?.role === 'principal';
  
  const fetchActivities = useCallback(async () => {
    if (!organizationId) return;
    
    try {
      const supabase = assertSupabase();
      
      const { data, error } = await supabase
        .from('lesson_activities')
        .select(`
          *,
          lesson:lessons(title, subject, age_group)
        `)
        .eq('preschool_id', organizationId)
        .order('order_index');
      
      if (error && error.code !== '42P01') {
        logger.error('AftercareActivities', 'Error:', error);
        throw error;
      }
      
      setActivities(data || []);
    } catch (err) {
      logger.error('AftercareActivities', 'Fetch error:', err);
      showAlert({ title: 'Error', message: 'Failed to load activities' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId]);
  
  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);
  
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchActivities();
  }, [fetchActivities]);
  
  const filteredActivities = activities.filter(activity => {
    const matchesSearch = !searchQuery || 
      activity.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      activity.description?.toLowerCase()?.includes(searchQuery.toLowerCase());
    
    const matchesType = selectedType === 'all' || activity.activity_type === selectedType;
    
    const matchesAgeGroup = selectedAgeGroup === 'all' || 
      activity.lesson?.age_group === selectedAgeGroup;
    
    const matchesSubject = selectedSubject === 'all' || 
      activity.lesson?.subject === selectedSubject;
    
    return matchesSearch && matchesType && matchesAgeGroup && matchesSubject;
  });
  
  const handleActivityPress = (activity: Activity) => {
    // Navigate to activity player
    router.push({
      pathname: '/screens/interactive-lesson-player',
      params: { activityId: activity.id },
    });
  };
  
  const handleAssignActivity = (activity: Activity) => {
    router.push({
      pathname: '/screens/assign-lesson',
      params: { lessonId: activity.lesson_id },
    });
  };
  
  const renderActivity = ({ item }: { item: Activity }) => {
    const config = activityTypeConfig[item.activity_type];
    
    return (
      <TouchableOpacity
        style={styles.activityCard}
        onPress={() => handleActivityPress(item)}
        activeOpacity={0.8}
      >
        <View style={[styles.activityIcon, { backgroundColor: config.color + '20' }]}>
          <Ionicons name={config.icon as any} size={32} color={config.color} />
        </View>
        
        <View style={styles.activityContent}>
          <Text style={styles.activityTitle} numberOfLines={2}>{item.title}</Text>
          
          <View style={styles.activityMeta}>
            <View style={[styles.typeBadge, { backgroundColor: config.color + '20' }]}>
              <Text style={[styles.typeBadgeText, { color: config.color }]}>
                {config.label}
              </Text>
            </View>
            
            <View style={styles.durationContainer}>
              <Ionicons name="time-outline" size={12} color={theme.textSecondary} />
              <Text style={styles.durationText}>{item.estimated_minutes} min</Text>
            </View>
          </View>
          
          {item.lesson && (
            <Text style={styles.lessonInfo} numberOfLines={1}>
              {item.lesson.subject} • Ages {item.lesson.age_group}
            </Text>
          )}
        </View>
        
        {isTeacher && (
          <TouchableOpacity
            style={styles.assignButton}
            onPress={(e) => {
              e.stopPropagation();
              handleAssignActivity(item);
            }}
          >
            <Ionicons name="paper-plane" size={16} color="#fff" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };
  
  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Stack.Screen options={{ headerShown: false }} />
        <EduDashSpinner size="large" color={theme.primary} />
        <Text style={styles.loadingText}>Loading activities...</Text>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      <LinearGradient
        colors={['#EC4899', '#DB2777']}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Learning Activities</Text>
            <Text style={styles.headerSubtitle}>{activities.length} activities available</Text>
          </View>
          {isTeacher && (
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => router.push('/screens/create-lesson')}
            >
              <Ionicons name="add" size={24} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
        
        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="rgba(255,255,255,0.6)" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search activities..."
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </LinearGradient>
      
      {/* Filters */}
      <View style={styles.filtersContainer}>
        {/* Activity Types */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[{ id: 'all', label: 'All', icon: 'apps', color: theme.primary }, ...Object.entries(activityTypeConfig).map(([id, config]) => ({ id, ...config }))]}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
                selectedType === item.id && { backgroundColor: item.color || theme.primary }
              ]}
              onPress={() => setSelectedType(item.id)}
            >
              <Ionicons 
                name={(item as any).icon as any} 
                size={16} 
                color={selectedType === item.id ? '#fff' : theme.textSecondary} 
              />
              <Text style={[
                styles.filterChipText,
                selectedType === item.id && { color: '#fff' }
              ]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.filterList}
        />
      </View>
      
      {/* Activities Grid */}
      <FlatList
        data={filteredActivities}
        keyExtractor={item => item.id}
        renderItem={renderActivity}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="game-controller-outline" size={64} color={theme.textSecondary} />
            <Text style={styles.emptyTitle}>No Activities Found</Text>
            <Text style={styles.emptyText}>
              {searchQuery || selectedType !== 'all' 
                ? 'Try adjusting your filters'
                : 'Create lessons to add activities'}
            </Text>
            {isTeacher && (
              <TouchableOpacity
                style={styles.createActivityButton}
                onPress={() => router.push('/screens/create-lesson')}
              >
                <Ionicons name="add" size={20} color="#fff" />
                <Text style={styles.createActivityButtonText}>Create Lesson</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
      <AlertModal {...alertProps} />
    </View>
  );
}
