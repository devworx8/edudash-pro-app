// filepath: /media/king/5e026cdc-594e-4493-bf92-c35c231beea3/home/king/Desktop/dashpro/app/screens/principal-excursions.tsx
/**
 * Principal Excursions Screen (Native)
 * 
 * Plan and manage school field trips and excursions
 * Refactored to use extracted components per WARP.md standards.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { useTranslation } from 'react-i18next';
import { extractOrganizationId } from '@/lib/tenant/compat';

// Extracted components and hooks
import {
  ExcursionCard,
  ExcursionFormModal,
} from '@/components/principal/excursions';
import type { Excursion } from '@/components/principal/excursions';
import { useExcursions } from '@/hooks/principal/useExcursions';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export default function PrincipalExcursionsScreen() {
  const { theme } = useTheme();
  const { profile, user } = useAuth();
  const { t } = useTranslation();
  const styles = createStyles(theme);
  
  const orgId = extractOrganizationId(profile);
  
  // Use extracted hook for excursions logic
  const {
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
  } = useExcursions({ organizationId: orgId, userId: user?.id });
  
  // Modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingExcursion, setEditingExcursion] = useState<Excursion | null>(null);

  const displayedExcursions = activeTab === 'upcoming' ? upcomingExcursions : pastExcursions;

  const openCreateModal = () => {
    setEditingExcursion(null);
    setShowFormModal(true);
  };

  const openEditModal = (excursion: Excursion) => {
    setEditingExcursion(excursion);
    setShowFormModal(true);
  };

  const handleApprove = (excursion: Excursion) => {
    updateStatus(excursion, 'approved');
  };

  return (
    <DesktopLayout role="principal" title="Excursion Planner">
      <Stack.Screen
        options={{
          title: 'Excursion Planner',
          headerShown: false,
        }}
      />
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🚌 Excursion Planner</Text>
          <TouchableOpacity style={styles.addButton} onPress={openCreateModal}>
            <Ionicons name="add" size={24} color="#fff" />
            <Text style={styles.addButtonText}>New Excursion</Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'upcoming' && styles.tabActive]}
            onPress={() => setActiveTab('upcoming')}
          >
            <Text style={[styles.tabText, activeTab === 'upcoming' && styles.tabTextActive]}>
              Upcoming ({upcomingExcursions.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'past' && styles.tabActive]}
            onPress={() => setActiveTab('past')}
          >
            <Text style={[styles.tabText, activeTab === 'past' && styles.tabTextActive]}>
              Past ({pastExcursions.length})
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}>
            <EduDashSpinner size="large" color={theme.primary} />
          </View>
        ) : displayedExcursions.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="bus-outline" size={64} color={theme.textSecondary} />
            <Text style={styles.emptyText}>
              {activeTab === 'upcoming' ? 'No upcoming excursions planned' : 'No past excursions'}
            </Text>
            {activeTab === 'upcoming' && (
              <TouchableOpacity style={styles.emptyButton} onPress={openCreateModal}>
                <Text style={styles.emptyButtonText}>Plan Your First Excursion</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.list}>
            {displayedExcursions.map((excursion) => (
              <ExcursionCard
                key={excursion.id}
                excursion={excursion}
                onPress={openEditModal}
                onApprove={handleApprove}
                onShare={shareWithParents}
                sharing={sharing}
                onDelete={deleteExcursion}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Form Modal */}
      <ExcursionFormModal
        visible={showFormModal}
        excursion={editingExcursion}
        onClose={() => setShowFormModal(false)}
        onSave={saveExcursion}
      />
    </DesktopLayout>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: theme.text,
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.primary,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      gap: 8,
    },
    addButtonText: {
      color: '#fff',
      fontWeight: '600',
    },
    tabs: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      marginBottom: 16,
      gap: 8,
    },
    tab: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 20,
      backgroundColor: theme.card,
    },
    tabActive: {
      backgroundColor: theme.primary,
    },
    tabText: {
      color: theme.textSecondary,
      fontWeight: '500',
    },
    tabTextActive: {
      color: '#fff',
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
    },
    empty: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
    },
    emptyText: {
      fontSize: 16,
      color: theme.textSecondary,
      marginTop: 16,
      marginBottom: 24,
    },
    emptyButton: {
      backgroundColor: theme.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
    },
    emptyButtonText: {
      color: '#fff',
      fontWeight: '600',
    },
    list: {
      padding: 16,
      gap: 16,
    },
  });
