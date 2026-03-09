/**
 * Enhanced Superadmin User Management System
 *
 * Presentational component — all logic lives in
 * hooks/enhanced-user-management (WARP-compliant ≤400 lines).
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { AlertModal } from '@/components/ui/AlertModal';
import {
  useEnhancedUserManagement,
  type EnhancedUser,
  type UserFilter,
  getRoleColor,
  getRiskColor,
  formatLastActivity,
} from '@/hooks/enhanced-user-management';
import { createStyles } from './EnhancedUserManagement.styles';

// ── Main Component ───────────────────────────────────────────────────

export const EnhancedUserManagement: React.FC = () => {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const {
    filteredUsers,
    selectedUsers,
    refreshing,
    filters,
    setFilters,
    setSelectedUser,
    setShowUserDetailsModal,
    setShowBulkOperationsModal,
    setShowDeletionModal,
    setShowSuspensionModal,
    toggleUserSelection,
    selectAllVisible,
    clearSelection,
    fetchUsers,
    hasPermission,
    alertProps,
    showAlert,
  } = useEnhancedUserManagement();

  // ── Render Helpers ───────────────────────────────────────────────

  const renderUser = ({ item: user }: { item: EnhancedUser }) => (
    <TouchableOpacity
      style={[
        styles.userCard,
        { backgroundColor: theme.surface, borderColor: theme.border },
        selectedUsers.has(user.id) && {
          borderColor: theme.primary,
          borderWidth: 2,
        },
      ]}
      onPress={() => {
        setSelectedUser(user);
        setShowUserDetailsModal(true);
      }}
      onLongPress={() => toggleUserSelection(user.id)}
    >
      {/* Selection Checkbox */}
      <TouchableOpacity
        style={styles.selectionCheckbox}
        onPress={() => toggleUserSelection(user.id)}
      >
        <Ionicons
          name={selectedUsers.has(user.id) ? 'checkbox' : 'square-outline'}
          size={20}
          color={
            selectedUsers.has(user.id) ? theme.primary : theme.textSecondary
          }
        />
      </TouchableOpacity>

      {/* User Info */}
      <View style={styles.userInfo}>
        <View style={styles.userHeader}>
          <Text
            style={[styles.userName, { color: theme.text }]}
            numberOfLines={1}
          >
            {user.fullName}
          </Text>
          <View style={styles.userBadges}>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: getRoleColor(user.role) + '20',
                  borderColor: getRoleColor(user.role),
                },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  { color: getRoleColor(user.role) },
                ]}
              >
                {user.role.replace('_', ' ').toUpperCase()}
              </Text>
            </View>
            <View
              style={[
                styles.badge,
                user.isSuspended
                  ? { backgroundColor: '#ef444420', borderColor: '#ef4444' }
                  : user.isActive
                    ? { backgroundColor: '#10b98120', borderColor: '#10b981' }
                    : { backgroundColor: '#6b728020', borderColor: '#6b7280' },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  {
                    color: user.isSuspended
                      ? '#ef4444'
                      : user.isActive
                        ? '#10b981'
                        : '#6b7280',
                  },
                ]}
              >
                {user.isSuspended
                  ? 'SUSPENDED'
                  : user.isActive
                    ? 'ACTIVE'
                    : 'INACTIVE'}
              </Text>
            </View>
          </View>
        </View>

        <Text
          style={[styles.userEmail, { color: theme.textSecondary }]}
          numberOfLines={1}
        >
          {user.email}
        </Text>

        {user.organizationName && (
          <Text
            style={[styles.organizationName, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            <Ionicons name="business" size={12} color={theme.textSecondary} />{' '}
            {user.organizationName}
          </Text>
        )}

        <View style={styles.userMetrics}>
          <View style={styles.metric}>
            <Text style={[styles.metricLabel, { color: theme.textTertiary }]}>
              Risk
            </Text>
            <View
              style={[
                styles.riskIndicator,
                {
                  backgroundColor: getRiskColor(user.riskScore) + '20',
                  borderColor: getRiskColor(user.riskScore),
                },
              ]}
            >
              <Text
                style={[
                  styles.riskScore,
                  { color: getRiskColor(user.riskScore) },
                ]}
              >
                {user.riskScore}
              </Text>
            </View>
          </View>
          <View style={styles.metric}>
            <Text style={[styles.metricLabel, { color: theme.textTertiary }]}>
              Profile
            </Text>
            <Text
              style={[styles.metricValue, { color: theme.textSecondary }]}
            >
              {user.profileCompleteness}%
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={[styles.metricLabel, { color: theme.textTertiary }]}>
              Last Active
            </Text>
            <Text
              style={[styles.metricValue, { color: theme.textSecondary }]}
            >
              {formatLastActivity(user.lastLoginAt)}
            </Text>
          </View>
        </View>

        {user.tags.length > 0 && (
          <View style={styles.userTags}>
            {user.tags.slice(0, 3).map((tag, index) => (
              <View
                key={index}
                style={[
                  styles.tag,
                  { backgroundColor: theme.primary + '20' },
                ]}
              >
                <Text style={[styles.tagText, { color: theme.primary }]}>
                  {tag}
                </Text>
              </View>
            ))}
            {user.tags.length > 3 && (
              <Text
                style={[styles.moreTagsText, { color: theme.textTertiary }]}
              >
                +{user.tags.length - 3} more
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.quickAction}
          onPress={() => {
            setSelectedUser(user);
            setShowSuspensionModal(true);
          }}
        >
          <Ionicons
            name={user.isSuspended ? 'play' : 'pause'}
            size={16}
            color={user.isSuspended ? theme.success : theme.warning}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickAction}
          onPress={() => {
            setSelectedUser(user);
            setShowDeletionModal(true);
          }}
        >
          <Ionicons name="trash" size={16} color={theme.error} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  // ── Permission Gate ────────────────────────────────────────────

  if (!hasPermission) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.deniedContainer}>
          <Ionicons name="shield-checkmark" size={64} color={theme.error} />
          <Text style={[styles.deniedTitle, { color: theme.text }]}>
            Access Denied
          </Text>
          <Text style={[styles.deniedMessage, { color: theme.textSecondary }]}>
            Super Administrator privileges required
          </Text>
        </View>
      </View>
    );
  }

  // ── Main Render ────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header Stats */}
      <View
        style={[
          styles.header,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: theme.text }]}>
              {filteredUsers.length}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
              Total
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: theme.success }]}>
              {filteredUsers.filter(u => u.isActive && !u.isSuspended).length}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
              Active
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: theme.warning }]}>
              {filteredUsers.filter(u => u.isSuspended).length}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
              Suspended
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: theme.error }]}>
              {filteredUsers.filter(u => u.riskScore >= 76).length}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
              High Risk
            </Text>
          </View>
        </View>
      </View>

      {/* Search & Filters */}
      <View
        style={[styles.filtersContainer, { backgroundColor: theme.surface }]}
      >
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search users..."
            placeholderTextColor={theme.textSecondary}
            value={filters.search}
            onChangeText={text =>
              setFilters(prev => ({ ...prev, search: text }))
            }
          />
          {filters.search !== '' && (
            <TouchableOpacity
              onPress={() => setFilters(prev => ({ ...prev, search: '' }))}
            >
              <Ionicons
                name="close-circle"
                size={20}
                color={theme.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterPills}
        >
          {Object.entries({
            status: ['all', 'active', 'suspended', 'deleted'],
            role: ['all', 'super_admin', 'principal_admin', 'teacher', 'parent'],
            riskLevel: ['all', 'low', 'medium', 'high', 'critical'],
            lastActivity: ['all', 'today', 'week', 'month', 'inactive'],
          }).map(([filterKey, options]) => (
            <View key={filterKey} style={styles.filterGroup}>
              {options.map(option => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.filterPill,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.border,
                    },
                    filters[filterKey as keyof UserFilter] === option && {
                      backgroundColor: theme.primary + '20',
                      borderColor: theme.primary,
                    },
                  ]}
                  onPress={() =>
                    setFilters(prev => ({ ...prev, [filterKey]: option }))
                  }
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      { color: theme.textSecondary },
                      filters[filterKey as keyof UserFilter] === option && {
                        color: theme.primary,
                      },
                    ]}
                  >
                    {option === 'all'
                      ? `All ${filterKey}`
                      : option.replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Selection Bar */}
      {selectedUsers.size > 0 && (
        <View
          style={[
            styles.selectionBar,
            {
              backgroundColor: theme.primary + '10',
              borderColor: theme.primary,
            },
          ]}
        >
          <Text style={[styles.selectionText, { color: theme.primary }]}>
            {selectedUsers.size} users selected
          </Text>
          <View style={styles.selectionActions}>
            <TouchableOpacity
              style={[
                styles.selectionButton,
                { backgroundColor: theme.primary + '20' },
              ]}
              onPress={() => setShowBulkOperationsModal(true)}
            >
              <Text
                style={[
                  styles.selectionButtonText,
                  { color: theme.primary },
                ]}
              >
                Bulk Actions
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.selectionButton,
                { backgroundColor: theme.textSecondary + '20' },
              ]}
              onPress={clearSelection}
            >
              <Text
                style={[
                  styles.selectionButtonText,
                  { color: theme.textSecondary },
                ]}
              >
                Clear
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Users List */}
      <FlashList
        data={filteredUsers}
        renderItem={renderUser}
        keyExtractor={item => item.id}
        refreshing={refreshing}
        onRefresh={fetchUsers}
        estimatedItemSize={80}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons
              name="people-outline"
              size={64}
              color={theme.textTertiary}
            />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              No Users Found
            </Text>
            <Text
              style={[styles.emptyMessage, { color: theme.textSecondary }]}
            >
              Try adjusting your search or filters
            </Text>
          </View>
        }
      />

      {/* FABs */}
      <View style={styles.fab}>
        <TouchableOpacity
          style={[styles.fabButton, { backgroundColor: theme.primary }]}
          onPress={() =>
            showAlert({
              title: 'Create User',
              message: 'User creation wizard coming soon',
              type: 'info',
            })
          }
        >
          <Ionicons name="person-add" size={24} color={theme.onPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.fabButton, { backgroundColor: theme.secondary }]}
          onPress={selectAllVisible}
        >
          <Ionicons
            name="checkmark-done"
            size={24}
            color={theme.onSecondary}
          />
        </TouchableOpacity>
      </View>

      {/* Alert Modal */}
      <AlertModal {...alertProps} />
    </View>
  );
};

export default EnhancedUserManagement;