// filepath: /media/king/5e026cdc-594e-4493-bf92-c35c231beea3/home/king/Desktop/dashpro/app/screens/teachers-detail.tsx
/**
 * Teachers Directory Detail Screen
 * 
 * Complete teachers management with hierarchical access control:
 * - Principals see all school teachers with full management capabilities  
 * - Teachers see limited colleague information
 * - Parents see basic teacher contact information
 * 
 * Refactored to use extracted components and hook for WARP.md compliance
 */

import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { router } from 'expo-router';
import { CacheIndicator } from '@/components/ui/CacheIndicator';
import { EmptyTeachersState } from '@/components/ui/EmptyState';
import { useTeachersDirectory } from '@/hooks/useTeachersDirectory';
import {
  TeacherCard,
  TeacherFilterModal,
  teachersDirectoryStyles as styles,
  Teacher,
} from '@/components/teachers-directory';

export default function TeachersDetailScreen() {
  const {
    // State
    teachers,
    filteredTeachers,
    loading,
    refreshing,
    isLoadingFromCache,
    filters,
    showFilters,
    viewMode,

    // Actions
    loadTeachers,
    setFilters,
    setShowFilters,
    setViewMode,
    clearFilters,
    getActiveFiltersCount,

    // Teacher actions
    handleCallTeacher,
    handleEmailTeacher,
    handleEditTeacher,
    handleDeleteTeacher,
    toggleTeacherStatus,

    // Permission checks
    canManageTeacher,
    canViewFullDetails,
  } = useTeachersDirectory();

  const renderTeacherCard = ({ item }: { item: Teacher }) => (
    <TeacherCard
      teacher={item}
      canManageTeacher={canManageTeacher()}
      canViewFullDetails={canViewFullDetails()}
      onPress={() => handleEditTeacher(item)}
      onCall={() => handleCallTeacher(item.phone)}
      onEmail={() => handleEmailTeacher(item.email)}
      onToggleStatus={() => toggleTeacherStatus(item.id, item.employmentStatus)}
      onDelete={() => handleDeleteTeacher(item)}
    />
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.light.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Teachers Directory</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.viewToggle}
            onPress={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
          >
            <Ionicons name={viewMode === 'list' ? 'grid' : 'list'} size={20} color={Colors.light.tint} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.filterButton}
            onPress={() => setShowFilters(true)}
          >
            <Ionicons name="filter" size={20} color={Colors.light.tint} />
            {getActiveFiltersCount() > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{getActiveFiltersCount()}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Cache Indicator */}
      <CacheIndicator 
        isLoadingFromCache={isLoadingFromCache}
        onRefresh={() => loadTeachers(true)}
        compact={true}
      />

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={Colors.light.tabIconDefault} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search teachers..."
          value={filters.search}
          onChangeText={(text) => setFilters(prev => ({ ...prev, search: text }))}
          placeholderTextColor={Colors.light.tabIconDefault}
        />
      </View>

      {/* Teachers Summary */}
      <View style={styles.summaryContainer}>
        <Text style={styles.summaryText}>
          {filteredTeachers.length} of {teachers.length} teachers
        </Text>
        {canManageTeacher() && (
          <TouchableOpacity style={styles.addButton}>
            <Ionicons name="person-add" size={16} color={Colors.light.tint} />
            <Text style={styles.addButtonText}>Add Teacher</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Teachers List */}
      <FlatList
        data={filteredTeachers}
        renderItem={renderTeacherCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadTeachers(true)} />
        }
        ListEmptyComponent={() => (
          loading ? null : <EmptyTeachersState />
        )}
        showsVerticalScrollIndicator={false}
      />

      {/* Filter Modal */}
      <TeacherFilterModal
        visible={showFilters}
        filters={filters}
        onFilterChange={setFilters}
        onClearFilters={clearFilters}
        onClose={() => setShowFilters(false)}
      />
    </View>
  );
}
