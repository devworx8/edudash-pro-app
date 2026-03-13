// filepath: /media/king/5e026cdc-594e-4493-bf92-c35c231beea3/home/king/Desktop/dashpro/app/screens/principal-activities.tsx
/**
 * Principal Activities Screen (Native)
 * 
 * Browse and manage ECD activity templates library
 * Refactored to use extracted components per WARP.md standards.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, RefreshControl } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { useTranslation } from 'react-i18next';
import { extractOrganizationId } from '@/lib/tenant/compat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Extracted components and hooks
import {
  ActivityCard,
  ActivityDetailModal,
  ActivityFormModal,
  ACTIVITY_TYPES,
} from '@/components/principal/activities';
import type { ActivityTemplate } from '@/components/principal/activities';
import { useActivities } from '@/hooks/principal/useActivities';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export default function PrincipalActivitiesScreen() {
  const { theme } = useTheme();
  const { showAlert, alertProps } = useAlertModal();
  const { profile, user } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme, insets.bottom);
  
  const orgId = extractOrganizationId(profile);
  
  // Use extracted hook for activities logic
  const {
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
  } = useActivities({ organizationId: orgId, userId: user?.id });
  
  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<ActivityTemplate | null>(null);

  const openDetailModal = (activity: ActivityTemplate) => {
    setSelectedActivity(activity);
    setShowDetailModal(true);
  };

  const handleAddActivity = async (activity: ActivityTemplate) => {
    await addActivityToLesson(activity);
    showAlert({
      title: 'Activity Added',
      message: `"${activity.title}" has been added to your lesson plan.`,
      type: 'success',
      buttons: [{ text: 'OK', onPress: () => setShowDetailModal(false) }]
    });
  };

  const content = (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Activity Library',
          headerStyle: { backgroundColor: theme.card },
          headerTintColor: theme.text,
        }}
      />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Activity Library</Text>
          <TouchableOpacity style={styles.addButton} onPress={() => setShowCreateModal(true)}>
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
        
        {/* Search */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={theme.textSecondary} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search activities..."
            placeholderTextColor={theme.textSecondary}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        
        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'global' && styles.activeTab]}
            onPress={() => setActiveTab('global')}
          >
            <Ionicons name="globe-outline" size={16} color={activeTab === 'global' ? '#fff' : theme.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'global' && styles.activeTabText]}>
              Global Library
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'school' && styles.activeTab]}
            onPress={() => setActiveTab('school')}
          >
            <Ionicons name="school-outline" size={16} color={activeTab === 'school' ? '#fff' : theme.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'school' && styles.activeTabText]}>
              My Activities
            </Text>
          </TouchableOpacity>
        </View>
        
        {/* Type Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeFilter}>
          <TouchableOpacity
            style={[styles.typeChip, !selectedType && styles.typeChipActive]}
            onPress={() => setSelectedType(null)}
          >
            <Text style={[styles.typeChipText, !selectedType && styles.typeChipTextActive]}>All</Text>
          </TouchableOpacity>
          {ACTIVITY_TYPES.slice(0, -1).map((type) => (
            <TouchableOpacity
              key={type.value}
              style={[
                styles.typeChip,
                selectedType === type.value && { backgroundColor: type.color + '30', borderColor: type.color },
              ]}
              onPress={() => setSelectedType(selectedType === type.value ? null : type.value)}
            >
              <Ionicons
                name={type.icon as any}
                size={14}
                color={selectedType === type.value ? type.color : theme.textSecondary}
              />
              <Text
                style={[
                  styles.typeChipText,
                  selectedType === type.value && { color: type.color },
                ]}
              >
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      
      {/* Activity List */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.listContainer}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          {filteredActivities.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="game-controller-outline" size={64} color={theme.textSecondary} />
              <Text style={styles.emptyTitle}>No activities found</Text>
              <Text style={styles.emptyText}>
                {activeTab === 'school'
                  ? 'Create your first custom activity'
                  : 'Try a different filter or search term'}
              </Text>
            </View>
          ) : (
            filteredActivities.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                onPress={openDetailModal}
              />
            ))
          )}
        </ScrollView>
      )}
      
      {/* Activity Detail Modal */}
      <ActivityDetailModal
        visible={showDetailModal}
        activity={selectedActivity}
        onClose={() => setShowDetailModal(false)}
        onUse={handleAddActivity}
      />
      
      {/* Create Activity Modal */}
      <ActivityFormModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSave={saveActivity}
      />
      <AlertModal {...alertProps} />
    </View>
  );

  return <DesktopLayout role="principal">{content}</DesktopLayout>;
}

const createStyles = (theme: any, insetBottom: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      backgroundColor: theme.card,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: 'bold',
      color: theme.text,
    },
    addButton: {
      backgroundColor: theme.primary,
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.background,
      borderRadius: 10,
      paddingHorizontal: 12,
      marginBottom: 12,
    },
    searchInput: {
      flex: 1,
      padding: 12,
      fontSize: 16,
      color: theme.text,
    },
    tabs: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    tab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: theme.background,
    },
    activeTab: {
      backgroundColor: theme.primary,
    },
    tabText: {
      color: theme.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    activeTabText: {
      color: '#fff',
    },
    typeFilter: {
      marginBottom: 4,
    },
    typeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
      marginRight: 8,
    },
    typeChipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    typeChipText: {
      fontSize: 13,
      color: theme.textSecondary,
    },
    typeChipTextActive: {
      color: '#fff',
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    listContainer: {
      flex: 1,
    },
    listContent: {
      padding: 16,
      paddingBottom: insetBottom + 24,
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 64,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.text,
      marginTop: 16,
    },
    emptyText: {
      fontSize: 14,
      color: theme.textSecondary,
      marginTop: 8,
    },
  });
