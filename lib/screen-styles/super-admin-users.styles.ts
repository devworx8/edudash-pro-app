import { StyleSheet } from 'react-native';
import { normalizeTierName, getTierDisplayName } from '@/lib/tiers';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UserRecord {
  id: string;
  auth_user_id: string | null;
  email: string;
  name: string | null;
  role: 'principal' | 'teacher' | 'parent' | 'student' | 'superadmin' | 'super_admin';
  school_id: string | null;
  school_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  is_active: boolean;
  avatar_url: string | null;
  subscription_tier: string | null;
}

export interface UserFilters {
  role: 'all' | 'principal' | 'teacher' | 'parent' | 'student' | 'superadmin';
  status: 'all' | 'active' | 'inactive';
  school: string;
  schoolId: string;
  search: string;
}

// ─── Pure helpers ───────────────────────────────────────────────────────────

export const getRoleColor = (role: string): string => {
  switch (role) {
    case 'superadmin':
    case 'super_admin':
      return '#ef4444';
    case 'principal':
      return '#8b5cf6';
    case 'teacher':
      return '#10b981';
    case 'parent':
      return '#f59e0b';
    case 'student':
      return '#3b82f6';
    default:
      return '#6b7280';
  }
};

export const formatLastSeen = (lastSignIn: string | null): string => {
  if (!lastSignIn) return 'Never';
  const date = new Date(lastSignIn);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 2) return 'Online now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
};

export const formatTierLabel = (tier?: string | null): string => {
  if (!tier) return 'Free';
  const normalized = normalizeTierName(tier);
  return `${getTierDisplayName(normalized)} (${normalized.replace(/_/g, ' ')})`;
};

// ─── Styles ─────────────────────────────────────────────────────────────────

export function createStyles(_theme: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#0b1220',
    },
    deniedContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#0b1220',
    },
    deniedText: {
      color: '#ffffff',
      fontSize: 18,
      fontWeight: '600',
    },
    header: {
      backgroundColor: '#0b1220',
      paddingHorizontal: 16,
    },
    headerContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
    },
    backButton: {
      padding: 8,
    },
    title: {
      color: '#ffffff',
      fontSize: 20,
      fontWeight: '700',
    },
    filterButton: {
      padding: 8,
    },
    statsContainer: {
      paddingBottom: 16,
    },
    statsText: {
      color: '#9ca3af',
      fontSize: 14,
    },
    scopeBadge: {
      marginTop: 8,
      alignSelf: 'flex-start',
      backgroundColor: '#2563eb22',
      borderWidth: 1,
      borderColor: '#2563eb66',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    scopeBadgeText: {
      color: '#93c5fd',
      fontSize: 12,
      fontWeight: '600',
    },
    filtersContainer: {
      backgroundColor: '#1f2937',
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: '#374151',
    },
    searchInput: {
      backgroundColor: '#374151',
      color: '#ffffff',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 8,
      marginBottom: 12,
      fontSize: 16,
    },
    filterTabs: {
      marginBottom: 8,
    },
    filterTab: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: '#374151',
      marginRight: 8,
    },
    filterTabActive: {
      backgroundColor: '#00f5ff',
    },
    filterTabText: {
      color: '#9ca3af',
      fontSize: 14,
      fontWeight: '500',
    },
    filterTabTextActive: {
      color: '#0b1220',
    },
    content: {
      flex: 1,
      backgroundColor: '#111827',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 64,
    },
    loadingText: {
      color: '#9ca3af',
      marginTop: 16,
    },
    userCard: {
      backgroundColor: '#1f2937',
      marginHorizontal: 16,
      marginVertical: 8,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: '#374151',
    },
    userHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    userInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    avatarContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: '#374151',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    avatarText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
    userDetails: {
      flex: 1,
    },
    userName: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 2,
    },
    userEmail: {
      color: '#9ca3af',
      fontSize: 14,
    },
    userMeta: {
      alignItems: 'flex-end',
      gap: 4,
    },
    roleBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
    },
    roleText: {
      fontSize: 10,
      fontWeight: '600',
    },
    statusBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 8,
    },
    statusActive: {
      backgroundColor: '#10b98120',
    },
    statusInactive: {
      backgroundColor: '#ef444420',
    },
    statusText: {
      fontSize: 10,
      fontWeight: '500',
    },
    statusActiveText: {
      color: '#10b981',
    },
    statusInactiveText: {
      color: '#ef4444',
    },
    userFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    schoolText: {
      color: '#9ca3af',
      fontSize: 12,
    },
    lastSeenText: {
      color: '#6b7280',
      fontSize: 12,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 64,
    },
    emptyText: {
      color: '#ffffff',
      fontSize: 18,
      fontWeight: '600',
      marginTop: 16,
    },
    emptySubText: {
      color: '#9ca3af',
      fontSize: 14,
      marginTop: 4,
    },
    modalContainer: {
      flex: 1,
      backgroundColor: '#0b1220',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: '#374151',
    },
    modalTitle: {
      color: '#ffffff',
      fontSize: 18,
      fontWeight: '600',
    },
    placeholder: {
      width: 24,
    },
    modalContent: {
      flex: 1,
      backgroundColor: '#111827',
    },
    modalUserInfo: {
      alignItems: 'center',
      padding: 24,
      backgroundColor: '#1f2937',
      marginBottom: 16,
    },
    modalAvatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: '#374151',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    modalAvatarText: {
      color: '#ffffff',
      fontSize: 32,
      fontWeight: '600',
    },
    modalUserName: {
      color: '#ffffff',
      fontSize: 20,
      fontWeight: '700',
      marginBottom: 4,
    },
    modalUserEmail: {
      color: '#9ca3af',
      fontSize: 16,
      marginBottom: 16,
    },
    modalBadges: {
      flexDirection: 'row',
      gap: 8,
    },
    modalRoleBadge: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
    },
    modalRoleText: {
      fontSize: 12,
      fontWeight: '600',
    },
    modalStatusBadge: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
    },
    modalStatusText: {
      fontSize: 12,
      fontWeight: '600',
    },
    modalSection: {
      backgroundColor: '#1f2937',
      marginHorizontal: 16,
      marginBottom: 16,
      borderRadius: 12,
      padding: 16,
    },
    modalSectionTitle: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 12,
    },
    modalInfoItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
    },
    modalInfoLabel: {
      color: '#9ca3af',
      fontSize: 14,
    },
    modalInfoValue: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '500',
    },
    modalActions: {
      marginHorizontal: 16,
      marginBottom: 32,
    },
    modalActionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#1f2937',
      padding: 16,
      borderRadius: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: '#374151',
    },
    modalActionText: {
      color: '#00f5ff',
      fontSize: 16,
      fontWeight: '500',
      marginLeft: 12,
    },
  });
}
